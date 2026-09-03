import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EngineEvent, RunRecord } from '@craftabot/core';
import { createMemoryStorage } from '@craftabot/core';
import { makeRun, obedient } from '@craftabot/core/testing';
import { evalFixtures } from '@craftabot/pack-geap';
import { buildSpec, runToCompletion } from '@craftabot/pack-starter/testing';
import { createRegistry } from '../packs.js';
import { createBrowserKeyVault } from '../state/keys.js';
import { availableEvaluators, runEvaluator } from './evaluations.js';

/**
 * A hosted evaluator in the Workshop (WP51, `39-…` §4.3): offline — and the
 * record says so — without the Cloud Armour battery or a config; live,
 * through `globalThis.fetch`, with both.
 */

async function storedRun() {
	const played = await runToCompletion({
		spec: buildSpec({ goalCardId: 'starter/say-hello' }),
		script: obedient([
			{ say: 'Hello!', call: 'say', args: { text: 'Hello Teddy, I am your new robot!' } }
		])
	});
	const storage = createMemoryStorage();
	const events = played.events as EngineEvent[];
	const run: RunRecord = makeRun({
		id: events[0]?.runId ?? 'run-1',
		providerId: 'mock',
		wireModel: 'mock-1'
	});
	await storage.putRun(run);
	await storage.appendEvents(run.id, events);
	expect((await storage.getEvents(run.id)).length).toBeGreaterThan(0);
	return { storage, run };
}

const registry = createRegistry();
const config = { projectId: 'proj-1', location: 'europe-west2' };

afterEach(() => {
	vi.unstubAllGlobals();
	localStorage.clear();
});

describe('runEvaluator with geap/eval/*', () => {
	it('lists the three cloud evaluators', () => {
		const ids = availableEvaluators(registry).map((e) => e.id);
		expect(ids).toEqual(
			expect.arrayContaining(['geap/eval/safety', 'geap/eval/fulfillment', 'geap/eval/rubric'])
		);
	});

	it('runs offline without the battery, and with the battery but no config', async () => {
		const { storage, run } = await storedRun();
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);
		const noBattery = await runEvaluator(storage, registry, run.id, 'geap/eval/safety', { config });
		expect(noBattery?.result).toMatchObject({
			verdict: 'inconclusive',
			external: { outcome: 'offline' }
		});
		createBrowserKeyVault().set('geap', 'ya29.workshop-test-token');
		const noConfig = await runEvaluator(storage, registry, run.id, 'geap/eval/safety');
		expect(noConfig?.result.external?.outcome).toBe('offline');
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('calls the evaluation service with the battery and a config, and records the call', async () => {
		const { storage, run } = await storedRun();
		createBrowserKeyVault().set('geap', 'ya29.workshop-test-token');
		const fetchSpy = vi.fn(async (url: string) => {
			expect(String(url)).toContain('europe-west2-aiplatform.googleapis.com');
			return new Response(JSON.stringify(evalFixtures['fulfillment-high']), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			});
		});
		vi.stubGlobal('fetch', fetchSpy);
		const record = await runEvaluator(storage, registry, run.id, 'geap/eval/fulfillment', {
			config
		});
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(record?.result).toMatchObject({
			verdict: 'pass',
			score: 1,
			external: { service: 'geap/evaluation', outcome: 'ok', policyRef: 'fulfillment' }
		});
		expect(JSON.stringify(record)).not.toContain('ya29.workshop-test-token');
		expect((await storage.listEvaluations(run.id)).map((row) => row.evaluatorId)).toEqual([
			'geap/eval/fulfillment'
		]);
	});
});
