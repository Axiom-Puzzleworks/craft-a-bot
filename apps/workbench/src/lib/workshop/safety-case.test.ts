import { describe, expect, it } from 'vitest';
import type { EngineEvent, RunRecord, ToolDefinition, WorldDefinition } from '@craftabot/core';
import type { BotCapabilities } from '$lib/bot-capabilities.js';
import { safetyCaseFor } from './safety-case.js';

const AGENT = { id: 'a1', name: 'Bolt', goalCardId: 'starter/say-hello' };

const capabilities = (over: Partial<BotCapabilities> = {}): BotCapabilities =>
	({
		filled: new Set(),
		toolIds: [],
		actionIds: [],
		channels: [],
		cartridgeId: 'demo/demo-brain',
		notebook: false,
		guardrailIds: [],
		fingerprint: 'fp',
		...over
	}) as BotCapabilities;

const playroom = (over: Partial<WorldDefinition> = {}): WorldDefinition =>
	({
		id: 'starter/playroom',
		name: 'The Playroom',
		layouts: [],
		actions: [],
		senses: [],
		predicates: {},
		create: () => {
			throw new Error('not used in these tests');
		},
		...over
	}) as WorldDefinition;

const tool = (id: string, riskTier: ToolDefinition['riskTier']): ToolDefinition =>
	({
		id,
		name: id,
		description: '',
		parameters: {},
		riskTier,
		execute: () => ({ ok: true, output: '' })
	}) as ToolDefinition;

let seq = 0;
const run = (over: Partial<RunRecord> = {}): RunRecord =>
	({
		id: `run-${++seq}`,
		agentId: AGENT.id,
		agentName: AGENT.name,
		goalCardId: AGENT.goalCardId,
		outcome: 'SUCCESS',
		startedAt: '2026-08-15T10:00:00.000Z',
		...over
	}) as never as RunRecord;

function event<T extends EngineEvent['type']>(type: T, payload: unknown, tick = 1): EngineEvent {
	seq += 1;
	return {
		id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
		runId: '11111111-1111-4111-8111-111111111111',
		agentId: '22222222-2222-4222-8222-222222222222',
		tick,
		timestamp: '2026-08-15T09:00:00.000Z',
		type,
		payload
	} as EngineEvent;
}

describe('safetyCaseFor', () => {
	it('claims a world with no irreversible action outright, when true', () => {
		const world = playroom({
			actions: [{ id: 'move', name: 'Move', description: '', parameters: {} }]
		});
		const result = safetyCaseFor(AGENT, capabilities(), world, [], [], new Map());
		expect(result.inability).toContain(
			"The Playroom's own world offers no irreversible action at all."
		);
		expect(result.reach).toEqual([]);
	});

	it('claims inability over an irreversible action this build does not enable', () => {
		const world = playroom({
			actions: [
				{ id: 'paint', name: 'Paint', description: '', parameters: {}, riskTier: 'irreversible' }
			]
		});
		const result = safetyCaseFor(AGENT, capabilities({ actionIds: [] }), world, [], [], new Map());
		expect(result.inability).toContain('Cannot paint — not an action this build enables.');
		expect(result.reach).toEqual([]);
	});

	it('names an irreversible action this build actually reaches, rather than hiding it', () => {
		const world = playroom({
			actions: [
				{ id: 'paint', name: 'Paint', description: '', parameters: {}, riskTier: 'irreversible' }
			]
		});
		const result = safetyCaseFor(
			AGENT,
			capabilities({ actionIds: ['paint'] }),
			world,
			[],
			[],
			new Map()
		);
		expect(result.reach).toContain('Can paint — an irreversible world action.');
		expect(result.inability).toEqual([]);
	});

	it('does the same split for irreversible tools', () => {
		const tools = [
			tool('starter/connector_weather_alert', 'irreversible'),
			tool('starter/calculator', 'observe')
		];
		const notReaching = safetyCaseFor(
			AGENT,
			capabilities({ toolIds: [] }),
			playroom(),
			tools,
			[],
			new Map()
		);
		expect(notReaching.inability).toContain(
			"Cannot use starter/connector_weather_alert — not a tool this build's fitted bricks reach."
		);

		const reaching = safetyCaseFor(
			AGENT,
			capabilities({ toolIds: ['starter/connector_weather_alert'] }),
			playroom(),
			tools,
			[],
			new Map()
		);
		expect(reaching.reach).toContain(
			'Can use starter/connector_weather_alert — an irreversible tool.'
		);
	});

	it('carries every guardrail id straight from capabilities', () => {
		const result = safetyCaseFor(
			AGENT,
			capabilities({ guardrailIds: ['safety/action-blocklist', 'connector/tool-blocklist'] }),
			playroom(),
			[],
			[],
			new Map()
		);
		expect(result.guardrails).toEqual(['safety/action-blocklist', 'connector/tool-blocklist']);
	});

	it('has no success rate at all when this bot has never finished a run', () => {
		const result = safetyCaseFor(
			AGENT,
			capabilities(),
			playroom(),
			[],
			[run({ outcome: 'IN_PROGRESS' })],
			new Map()
		);
		expect(result.trustworthiness.successRate).toBeUndefined();
	});

	it("rates success over this bot's own finished runs, and counts its own incidents", () => {
		const runs = [
			run({ id: 'r1', outcome: 'SUCCESS' }),
			run({ id: 'r2', outcome: 'OUT_OF_STEPS' })
		];
		const eventsByRun = new Map([
			['r1', []],
			['r2', [event('run.finished', { outcome: 'OUT_OF_STEPS', ticks: 30, usage: {} })]]
		]);
		const result = safetyCaseFor(AGENT, capabilities(), playroom(), [], runs, eventsByRun);
		expect(result.trustworthiness).toMatchObject({
			runs: 2,
			finishedRuns: 2,
			successRate: 0.5,
			incidentRuns: 1
		});
	});

	/**
	 * `hostedScreening` (`25-ARMOUR-BRICK.md` §11 Stage E) — `undefined` when
	 * no `geap/armor` guardrail is fitted at all; `{ fired, decisions }`
	 * otherwise, read as "hosted content screening ran on `fired` of
	 * `decisions` decisions" (`25-…` §5's own UX trajectory wording).
	 */
	describe('hostedScreening', () => {
		it('is undefined when no geap/armor guardrail is fitted', () => {
			const result = safetyCaseFor(
				AGENT,
				capabilities({ guardrailIds: ['safety/step-budget'] }),
				playroom(),
				[],
				[],
				new Map()
			);
			expect(result.hostedScreening).toBeUndefined();
		});

		it('counts every real decision and every pre-act guardrail.external, once the Armour Brick is fitted', () => {
			const runs = [run({ id: 'r1' })];
			const eventsByRun = new Map([
				[
					'r1',
					[
						event(
							'decision',
							{ thought: 'go', call: { kind: 'action', name: 'move', arguments: {} } },
							1
						),
						event(
							'guardrail.external',
							{
								guardrailId: 'geap/armor:decision',
								hook: 'pre-act',
								service: 'model-armor',
								endpoint: 'x',
								template: 't',
								latencyMs: 1,
								charsScreened: 4,
								outcome: 'ok'
							},
							1
						),
						event('decision', { thought: 'mumble', call: null }, 2)
					]
				]
			]);
			const result = safetyCaseFor(
				AGENT,
				capabilities({ guardrailIds: ['geap/armor:decision'] }),
				playroom(),
				[],
				runs,
				eventsByRun
			);
			// Two decision events, only one carrying a real call — the mumble
			// (call: null) is not a decision the guard could have screened.
			expect(result.hostedScreening).toEqual({ fired: 1, decisions: 1 });
		});

		it('does not count a guardrail.external at a different hook (observation/result screening)', () => {
			const runs = [run({ id: 'r1' })];
			const eventsByRun = new Map([
				[
					'r1',
					[
						event(
							'decision',
							{ thought: 'go', call: { kind: 'action', name: 'move', arguments: {} } },
							1
						),
						event(
							'guardrail.external',
							{
								guardrailId: 'geap/armor:observation',
								hook: 'pre-think',
								service: 'model-armor',
								endpoint: 'x',
								template: 't',
								latencyMs: 1,
								charsScreened: 4,
								outcome: 'ok'
							},
							1
						)
					]
				]
			]);
			const result = safetyCaseFor(
				AGENT,
				capabilities({ guardrailIds: ['geap/armor:observation'] }),
				playroom(),
				[],
				runs,
				eventsByRun
			);
			expect(result.hostedScreening).toEqual({ fired: 0, decisions: 1 });
		});
	});
});
