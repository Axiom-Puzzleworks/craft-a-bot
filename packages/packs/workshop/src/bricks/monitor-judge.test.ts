import { describe, expect, it } from 'vitest';
import {
	createPackRegistry,
	createSession,
	type AgentSpecV2,
	type BrickValidationContext,
	type EngineEvent,
	type PackManifest
} from '@craftabot/core';
import { createMockProvider, obedient } from '@craftabot/core/testing';
import starterPack from '@craftabot/pack-starter';
import workshopPack from '../index.js';
import { monitorJudgeBrickKind, monitorJudgeConfigSchema } from './monitor-judge.js';

/**
 * WP43 stage C (`31-EVALUATORS.md` §4.3): the Monitor Judge runs an
 * evaluator in-run at `post-act` and only ever notes — its verdicts are
 * `guardrail.checked` rows, nothing new on the bus.
 */

const CARTRIDGE_PACK: PackManifest = {
	id: 'test',
	name: 'Test cartridges',
	version: '1.0.0',
	requiresCore: '>=0.0.1',
	cartridges: [
		{
			id: 'test/mock-brain',
			providerId: 'mock',
			model: 'mock-1',
			displayName: 'Mock Brain',
			blurb: 'Scripted.',
			stats: { words: 2, reasoning: 2, speed: 3 },
			costHint: 'low',
			defaults: { temperature: 0, maxTokens: 256 }
		}
	]
};

function spec(config: Record<string, unknown>): AgentSpecV2 {
	return {
		id: '99999999-9999-4999-8999-999999999999',
		name: 'Judged Tinybot',
		schemaVersion: 2,
		identity: { displayName: 'Judged Tinybot', boxArtSeed: 'seed' },
		goalCardId: 'starter/say-hello',
		bricks: [
			{
				slot: 'brain',
				kind: 'starter/llm',
				configVersion: 1,
				config: { cartridgeId: 'test/mock-brain', temperature: 0, maxTokens: 256, personality: '' }
			},
			{
				slot: 'perception',
				kind: 'starter/sense',
				configVersion: 1,
				config: { channels: ['starter/playroom/sight', 'starter/playroom/compass'] }
			},
			{
				slot: 'mobility',
				kind: 'starter/actions',
				configVersion: 1,
				config: { enabled: ['starter/playroom/move', 'starter/playroom/say'] }
			},
			{ slot: 'safety', kind: 'workshop/monitor-judge', configVersion: 1, config }
		],
		createdAt: '2026-09-02T09:00:00.000Z',
		updatedAt: '2026-09-02T09:00:00.000Z'
	};
}

async function run(config: Record<string, unknown>): Promise<EngineEvent[]> {
	const registry = createPackRegistry();
	for (const pack of [starterPack, CARTRIDGE_PACK, workshopPack]) registry.registerPack(pack);
	const session = createSession({
		spec: spec(config),
		registry,
		provider: createMockProvider({
			script: obedient([
				{ say: 'Off east.', call: 'move', args: { direction: 'east' } },
				{ say: 'Hello!', call: 'say', args: { text: 'Hello Teddy, I am your new robot!' } }
			])
		}),
		guardrails: []
	});
	const events: EngineEvent[] = [];
	session.events.onAny((event) => events.push(event));
	session.start('step');
	for (let i = 0; i < 6 && session.status !== 'finished'; i += 1) await session.step();
	return events;
}

const judgeRows = (events: EngineEvent[]) =>
	events.filter(
		(e) =>
			e.type === 'guardrail.checked' && e.payload.guardrailId.startsWith('workshop/monitor-judge:')
	);

describe('the Monitor Judge', () => {
	it("notes a card's verdict after every action, at post-act, and never stops anything", async () => {
		const events = await run({ evaluatorId: 'starter/testbench/opens-the-chest' });
		const rows = judgeRows(events);
		expect(rows.length).toBeGreaterThan(0);
		for (const row of rows) {
			expect(row.type === 'guardrail.checked' ? row.payload.hook : '').toBe('post-act');
			const verdict = row.type === 'guardrail.checked' ? row.payload.verdict : undefined;
			expect(verdict).toMatchObject({ allow: true });
			expect(JSON.stringify(verdict)).toContain('judge: fail');
		}
		expect(events.some((e) => e.type === 'guardrail.tripped')).toBe(false);
	});

	it('judges only every N-th tick when asked', async () => {
		const events = await run({ evaluatorId: 'starter/testbench/opens-the-chest', everyTicks: 2 });
		const notes = judgeRows(events).map((e) =>
			e.type === 'guardrail.checked' && 'note' in e.payload.verdict ? e.payload.verdict.note : ''
		);
		expect(notes.some((note) => note === 'judge: not this tick')).toBe(true);
		expect(notes.some((note) => (note ?? '').startsWith('judge: fail'))).toBe(true);
	});

	it('contributes nothing for an unknown evaluator or settings that are not JSON', async () => {
		expect(judgeRows(await run({ evaluatorId: 'nobody/knows' }))).toHaveLength(0);
		expect(
			judgeRows(
				await run({ evaluatorId: 'starter/testbench/opens-the-chest', evaluatorConfig: '{' })
			)
		).toHaveLength(0);
	});

	it('validates: no evaluator, an unknown one, settings that are not JSON', () => {
		const ctx = (known: boolean): BrickValidationContext => ({
			hasTool: () => true,
			hasAction: () => true,
			hasSenseChannel: () => true,
			hasCartridge: () => true,
			hasPolicyCard: () => true,
			hasCredential: () => false,
			hasGuardrailService: () => false,
			hasEvaluator: () => known
		});
		const codes = (input: Record<string, unknown>, known = true) =>
			(
				monitorJudgeBrickKind.validateConfig?.(monitorJudgeConfigSchema.parse(input), ctx(known)) ??
				[]
			).map((p) => p.code);
		expect(codes({})).toEqual(['judge-no-evaluator']);
		expect(codes({ evaluatorId: 'x/y' }, false)).toEqual(['unknown-evaluator']);
		expect(codes({ evaluatorId: 'x/y', evaluatorConfig: 'nope' })).toEqual([
			'judge-config-not-json'
		]);
		expect(codes({ evaluatorId: 'x/y' })).toEqual([]);
		expect(monitorJudgeBrickKind.audience).toBe('workshop');
		expect(monitorJudgeBrickKind.describeFitted?.(monitorJudgeConfigSchema.parse({}))).toContain(
			'nobody'
		);
	});
});
