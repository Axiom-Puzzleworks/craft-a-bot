import { describe, expect, it } from 'vitest';
import type { EngineEvent, LLMProvider, RunRecord } from '@craftabot/core';
import { createMemoryStorage } from '@craftabot/core';
import { makeRun } from '@craftabot/core/testing';
import { createMockProvider, obedient } from '@craftabot/core/testing';
import { buildSpec, runToCompletion } from '@craftabot/pack-starter/testing';
import { createRegistry } from '../packs.js';
import { availableEvaluators, providerForRun, runEvaluator } from './evaluations.js';

async function storedRun() {
	const played = await runToCompletion({
		spec: buildSpec({ goalCardId: 'starter/say-hello' }),
		script: obedient([
			{ say: 'Hello!', call: 'say', args: { text: 'Hello Teddy, I am your new robot!' } }
		])
	});
	const storage = createMemoryStorage();
	const run: RunRecord = makeRun({ id: 'run-1', providerId: 'mock', wireModel: 'mock-1' });
	await storage.putRun(run);
	await storage.appendEvents(run.id, played.events as EngineEvent[]);
	return { storage, run };
}

const registry = createRegistry();

describe('availableEvaluators', () => {
	it('lists the rubric judge and every pack card', () => {
		const ids = availableEvaluators(registry).map((e) => e.id);
		expect(ids).toContain('evals/judge/rubric');
		expect(ids).toContain('starter/testbench/opens-the-chest');
		expect(ids).toContain('workshop/testbench/paints-the-birdhouse-blue');
	});
});

describe('runEvaluator', () => {
	it('runs a card over a stored run, persists the record and points at real events', async () => {
		const { storage, run } = await storedRun();
		const record = await runEvaluator(
			storage,
			registry,
			run.id,
			'starter/testbench/no-secrets-out-loud',
			{
				now: () => '2026-09-02T12:00:00.000Z',
				newId: () => 'eval-1'
			}
		);
		expect(record).toMatchObject({
			id: 'eval-1',
			runId: 'run-1',
			evaluatorId: 'starter/testbench/no-secrets-out-loud',
			result: { verdict: 'pass' },
			evaluatedAt: '2026-09-02T12:00:00.000Z'
		});
		expect(await storage.listEvaluations('run-1')).toEqual([record]);
	});

	it('runs the rubric judge through a handed-in provider, and offline when there is none', async () => {
		const { storage, run } = await storedRun();
		const judge: LLMProvider = {
			...createMockProvider({ script: [] }),
			id: 'stub',
			chat: () =>
				Promise.resolve({
					text: '{"score": 1, "verdict": "pass", "explanation": "fine", "evidence": [1]}',
					usage: { inputTokens: 1, outputTokens: 1 },
					raw: null,
					finishReason: 'stop'
				})
		};
		const live = await runEvaluator(storage, registry, run.id, 'evals/judge/rubric', {
			config: { rubric: 'Was it polite?' },
			provider: judge
		});
		expect(live?.result.verdict).toBe('pass');
		expect(live?.result.external?.endpoint).toBe('provider://stub/mock-1');
		const offline = await runEvaluator(storage, registry, run.id, 'evals/judge/rubric', {
			config: { rubric: 'Was it polite?' }
		});
		expect(offline?.result.verdict).toBe('inconclusive');
		expect(await storage.listEvaluations('run-1')).toHaveLength(2);
	});

	it('answers undefined for a run or an evaluator that is not there', async () => {
		const { storage, run } = await storedRun();
		expect(
			await runEvaluator(storage, registry, 'nope', 'starter/testbench/opens-the-chest')
		).toBeUndefined();
		expect(await runEvaluator(storage, registry, run.id, 'nobody/knows')).toBeUndefined();
	});

	it('finds no provider for a keyed provider with no battery, and a keyless one without', () => {
		expect(providerForRun(makeRun({ providerId: 'openai' }), registry)).toBeUndefined();
		expect(providerForRun(makeRun({ providerId: 'ollama' }), registry)?.id).toBe('ollama');
		expect(providerForRun(makeRun({ providerId: 'nobody' }), registry)).toBeUndefined();
	});
});
