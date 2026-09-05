import {
	createPackRegistry,
	createSession,
	type AgentSpec,
	type EngineEvent,
	type GuardrailService,
	type PackRegistry,
	type ProviderFactory,
	type WorldDefinition
} from '@craftabot/core';
import {
	createMockProvider,
	createTestClock,
	obedient,
	v1BrickKinds
} from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { boundaryMapFor, litEdgesAt } from './boundary.js';

/**
 * The Boundary fold (WP57 stage C, `44-…` §4.5) over a hand-built registry:
 * a tiny world, a provider factory with declared egress, a guard service,
 * a sink handed in by the host. Static first (no events), then over a real
 * session's trace, then the property: every host an outside edge names
 * is inside `run.started.egress.hosts` when the run named a mode — or the
 * fold says `outside-egress`.
 */
const world: WorldDefinition = {
	id: 'tiny/world',
	name: 'Tiny world',
	layouts: [{ id: 'a', name: 'A', initialState: {} }],
	actions: [
		{ id: 'tiny/world/win', name: 'Win', description: 'Win.', parameters: { type: 'object' } }
	],
	senses: [{ id: 'tiny/world/look', name: 'Look', description: 'Look.' }],
	predicates: { done: 'Done.' },
	create: () => {
		let done = false;
		return {
			snapshot: () => ({
				width: 1,
				height: 1,
				bot: { position: { x: 0, y: 0 } },
				furniture: [],
				containers: [],
				characters: [],
				items: []
			}),
			observe: () => ({ channels: ['look'], text: 'nothing' }),
			perform: () => {
				done = true;
				return { ok: true, narration: 'won', stateDiff: [] };
			},
			test: () => done,
			reset: () => {
				done = false;
			}
		};
	}
};

const factory: ProviderFactory = {
	id: 'mock',
	name: 'Mock provider',
	keyRequirement: 'required',
	egress: [{ host: 'api.mock.test', purpose: 'LLM', sends: ['prompt', 'credential-header'] }],
	create: () => createMockProvider({ script: [] })
};

const service: GuardrailService = {
	id: 'vendor/screen',
	name: 'Vendor screen',
	description: 'Screens text.',
	hooks: ['pre-act'],
	configSchema: {
		parse: (v: unknown) => v,
		safeParse: (v: unknown) => ({ success: true, data: v })
	} as never,
	egress: [{ host: 'screen.vendor.test', purpose: 'screening', sends: ['decision'] }],
	credential: { id: 'vendor', name: 'Vendor key', kind: 'api-key' },
	createOffline: () => ({ screen: async () => ({ outcome: 'offline', findings: [] }) }) as never,
	create: () => ({ screen: async () => ({ outcome: 'ok', findings: [] }) }) as never
} as unknown as GuardrailService;

function registry(): PackRegistry {
	const r = createPackRegistry();
	r.registerPack({
		id: 'tiny',
		name: 'Tiny',
		version: '1.0.0',
		requiresCore: '>=1.0.0',
		worlds: [world],
		brickKinds: v1BrickKinds(),
		providers: [factory],
		guardrailServices: [service],
		cartridges: [
			{
				id: 'tiny/brain',
				providerId: 'mock',
				model: 'm',
				displayName: 'Tiny brain',
				blurb: '.',
				stats: { words: 1, reasoning: 1, speed: 3 },
				costHint: 'low',
				defaults: { temperature: 0, maxTokens: 64 }
			}
		],
		goalCards: [
			{
				id: 'tiny/goal',
				title: 'Win',
				goalText: 'Win.',
				worldId: 'tiny/world',
				layoutId: 'a',
				successCondition: 'done',
				hints: [],
				teachesConcepts: []
			}
		]
	});
	return r;
}

const spec: AgentSpec = {
	id: '11111111-1111-4111-8111-111111111111',
	name: 'Tinybot',
	bricks: {
		llm: { cartridgeId: 'tiny/brain', temperature: 0, maxTokens: 64, personality: '' },
		sense: { channels: ['look'] },
		actions: { enabled: ['win'] },
		safety: { maxTicks: 5, blockedActions: [], approvalMode: true }
	},
	goalCardId: 'tiny/goal',
	createdAt: '2026-09-05T09:00:00Z',
	updatedAt: '2026-09-05T09:00:00Z',
	schemaVersion: 1
};

async function trace(): Promise<EngineEvent[]> {
	const clock = createTestClock();
	const session = createSession({
		spec,
		registry: registry(),
		provider: {
			...createMockProvider({ script: obedient([{ say: 'Winning.', call: 'win', args: {} }]) }),
			// Declared, as the OpenAI pack's provider declares its own — what run.started.egress reads.
			egress: factory.egress ?? []
		},
		options: { now: clock.now, newId: clock.newId, random: clock.random, egress: 'declared' }
	});
	const events: EngineEvent[] = [];
	session.events.onAny((event) => events.push(event));
	session.events.on('approval.requested', () => session.resolveApproval(true));
	session.start('step');
	for (let i = 0; i < 5; i++) {
		const result = await session.step();
		if (result.outcome) break;
	}
	return events;
}

describe('boundaryMapFor, static', () => {
	it('draws the build: bricks, the safety stack, the approval dial, the world, the provider outside', () => {
		const map = boundaryMapFor(spec, registry(), {
			sinks: [
				{
					id: 'telemetry/otlp-http',
					name: 'OTLP',
					egress: [{ host: 'collector.test', purpose: 'trace', sends: ['trace'] }],
					credential: 'otlp'
				}
			]
		});
		expect(map.schemaVersion).toBe(1);
		expect(map.agent.name).toBe('Tinybot');
		expect(map.agent.bricks.map((b) => b.slot)).toEqual([
			'brain',
			'perception',
			'mobility',
			'safety'
		]);
		expect(map.boundary.safetyStack).toEqual([
			{ kindId: 'starter/safety', name: expect.any(String) }
		]);
		expect(map.boundary.approval).toMatchObject({
			mode: 'everything',
			riskTiers: ['observe', 'reversible', 'irreversible']
		});
		expect(map.inside.world).toEqual({ id: 'tiny/world', name: 'Tiny world', view: 'grid' });
		expect(map.inside.counterparts).toEqual([]);
		expect(map.outside).toEqual([
			{
				kind: 'provider',
				id: 'mock',
				name: 'Mock provider',
				hosts: ['api.mock.test'],
				sends: ['prompt', 'credential-header'],
				credential: 'mock'
			},
			{
				kind: 'sink',
				id: 'telemetry/otlp-http',
				name: 'OTLP',
				hosts: ['collector.test'],
				sends: ['trace'],
				credential: 'otlp'
			}
		]);
		// No run yet: the hosts are the union of every declaration, and there is no mode.
		expect(map.boundary.egress).toEqual({ hosts: ['api.mock.test', 'collector.test'] });
		expect(map.human).toEqual({ approvals: 0 });
		expect(map.activity).toBeUndefined();
	});

	it('lists a guard service the generic Guard brick names, with its credential', () => {
		const armed: AgentSpec = {
			...spec,
			bricks: { ...spec.bricks, safety: undefined as never }
		};
		const r = registry();
		r.registerPack({
			id: 'gk',
			name: 'Guard kinds',
			version: '1.0.0',
			requiresCore: '>=1.0.0',
			brickKinds: [
				{
					id: 'gk/guard',
					slot: 'safety',
					name: 'Guard',
					description: 'A guard.',
					configVersion: 1,
					configSchema: {
						parse: (v: unknown) => v,
						safeParse: (v: unknown) => ({ success: true, data: v })
					} as never,
					defaults: { serviceId: 'vendor/screen' },
					describeFitted: () => 'a guard',
					createRuntime: () => ({})
				} as never
			]
		});
		const v2 = { ...armed, bricks: { ...spec.bricks } };
		const map = boundaryMapFor(
			{
				id: v2.id,
				name: v2.name,
				schemaVersion: 2,
				identity: { displayName: v2.name, boxArtSeed: 's' },
				goalCardId: 'tiny/goal',
				bricks: [
					{ slot: 'brain', kind: 'starter/llm', configVersion: 1, config: spec.bricks.llm },
					{
						slot: 'safety',
						kind: 'gk/guard',
						configVersion: 1,
						config: { serviceId: 'vendor/screen' }
					}
				],
				createdAt: spec.createdAt,
				updatedAt: spec.updatedAt
			} as never,
			r
		);
		expect(map.outside.find((entry) => entry.kind === 'guard-service')).toEqual({
			kind: 'guard-service',
			id: 'vendor/screen',
			name: 'Vendor screen',
			hosts: ['screen.vendor.test'],
			sends: ['decision'],
			credential: 'vendor'
		});
		expect(map.boundary.egress.hosts).toContain('screen.vendor.test');
		expect(map.boundary.approval.mode).toBe('off');
	});
});

describe('boundaryMapFor, over a trace', () => {
	it('takes the egress from run.started, counts approvals, and lights edges tick by tick', async () => {
		const events = await trace();
		const map = boundaryMapFor(spec, registry(), { events });
		expect(map.boundary.egress.mode).toBe('declared');
		expect(map.boundary.egress.hosts).toContain('api.mock.test');
		// The stub safety kind asks for no approvals; the synthetic-events test below covers the human edge.
		expect(map.human.approvals).toBe(0);
		const activity = map.activity ?? [];
		expect(activity.some((a) => a.edge === 'provider')).toBe(true);
		expect(activity.some((a) => a.edge === 'world')).toBe(true);
		const lit = litEdgesAt(map, 1);
		expect(lit.has('provider')).toBe(true);
		expect(lit.has('world')).toBe(true);
		expect(litEdgesAt(map, 99).size).toBe(0);
	});

	it('every outside host is inside run.started.egress.hosts when a mode was named — the property', async () => {
		const events = await trace();
		const map = boundaryMapFor(spec, registry(), { events });
		expect(map.boundary.egress.mode).toBeDefined();
		for (const entry of map.outside) {
			for (const host of entry.hosts) {
				expect(
					map.boundary.egress.hosts.some((pattern) => pattern === host || pattern.includes('*'))
				).toBe(true);
			}
		}
		expect((map.activity ?? []).filter((a) => a.verdict === 'outside-egress')).toEqual([]);
	});

	it('flags a hosted call to a host the run never declared, and forgives an offline one', () => {
		const external = (outcome: string, endpoint: string): EngineEvent =>
			({
				id: `e-${outcome}`,
				runId: 'r',
				agentId: spec.id,
				tick: 2,
				at: '2026-09-05T09:00:00.000Z',
				type: 'guardrail.external',
				payload: {
					guardrailId: 'g',
					hook: 'pre-act',
					service: 'screen',
					endpoint,
					latencyMs: 1,
					charsScreened: 1,
					outcome
				}
			}) as unknown as EngineEvent;
		const started = {
			id: 's',
			runId: 'r',
			agentId: spec.id,
			agentName: spec.name,
			tick: 0,
			at: '2026-09-05T09:00:00.000Z',
			type: 'run.started',
			payload: {
				mode: 'step',
				budgets: { maxTicks: 5, maxTokens: 100, requestTimeoutMs: 1000 },
				providerId: 'mock',
				wireModel: 'm',
				cartridgeId: 'tiny/brain',
				egress: { mode: 'declared', hosts: ['api.mock.test'] },
				strategies: { memory: 'window', prompt: 'default' }
			}
		} as unknown as EngineEvent;
		const asked = {
			id: 'ask',
			runId: 'r',
			agentId: spec.id,
			tick: 3,
			at: '2026-09-05T09:00:00.000Z',
			type: 'approval.requested',
			payload: { proposed: { kind: 'action', name: 'win', arguments: {} }, reason: 'risky' }
		} as unknown as EngineEvent;
		const map = boundaryMapFor(spec, registry(), {
			events: [
				started,
				external('ok', 'https://screen.vendor.test/v1'),
				external('offline', 'https://screen.vendor.test/v1'),
				asked
			]
		});
		expect(map.human.approvals).toBe(1);
		expect(litEdgesAt(map, 3).has('human')).toBe(true);
		const [reached, offline] = map.activity ?? [];
		expect(reached).toMatchObject({
			edge: 'guard-service:screen',
			verdict: 'outside-egress',
			outcome: 'ok'
		});
		expect(offline).toMatchObject({ edge: 'guard-service:screen', outcome: 'offline' });
		expect(offline?.verdict).toBeUndefined();
	});
});
