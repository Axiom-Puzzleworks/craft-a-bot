import { describe, expect, it } from 'vitest';
import { createGroupTokenBudgetGuardrail, createSessionGroup } from './session-group.js';
import { createPackRegistry, type PackRegistry } from '../pack-registry.js';
import { createMockProvider, createTestClock, turn, v1BrickKinds } from '../testing/index.js';
import type { AgentSpec } from '../schemas/agent-spec.js';
import type { EngineEvent } from '../schemas/events.js';
import type { GuardrailContext } from '../types/guardrail.js';
import type { AgentHandle, WorldDefinition, WorldInstance } from '../types/world.js';

/**
 * **WP29 stage C** (`23-MULTI-AGENT-DESIGN.md` §4.4, §10): `SessionGroup`
 * against a hand-built fake world — no pack changes yet, exactly as the
 * stage specifies. `AgentSession` itself is untouched by any of this (its
 * own suite in `agent-session.test.ts` still covers it); every test here is
 * about the scheduler, the merge, and the chokepoint.
 */

// `type`, not `interface` — the same "stays structurally assignable to the
// opaque `WorldState`" reason `14-…`'s real world packs use it for.
type TinyGroupState = {
	pings: Record<string, number>;
	won: boolean;
	heard: string[];
};

/** A room that can host several agents — every action delegates to the same shared state. */
function createTinyGroupWorld(id = 'tiny/group-world'): WorldDefinition {
	const state: TinyGroupState = { pings: {}, won: false, heard: [] };

	function instanceFor(agentId: string | undefined): WorldInstance {
		return {
			snapshot: () => structuredClone(state),
			observe: (channels) => ({
				channels: [...channels],
				text: `total pings: ${Object.values(state.pings).reduce((a, b) => a + b, 0)}`,
				data: {}
			}),
			perform: (action) => {
				if (action.name === 'ping') {
					const key = agentId ?? 'solo';
					state.pings[key] = (state.pings[key] ?? 0) + 1;
					return { ok: true, narration: `${key} pinged`, stateDiff: [] };
				}
				if (action.name === 'win') {
					state.won = true;
					return { ok: true, narration: `${agentId ?? 'solo'} declared it won`, stateDiff: [] };
				}
				return { ok: false, narration: `cannot ${action.name}`, stateDiff: [] };
			},
			test: (predicate) => predicate === 'has-won' && state.won,
			reset: () => {
				state.pings = {};
				state.won = false;
				state.heard = [];
			},
			receiveInput: (text) => void state.heard.push(text),
			forAgent: (handle: AgentHandle) => instanceFor(handle.agentId)
		};
	}

	return {
		id,
		name: 'Tiny group world',
		layouts: [{ id: 'only', name: 'Only layout', initialState: {} }],
		actions: [
			{
				id: 'ping',
				name: 'Ping',
				description: 'Make a small noise.',
				parameters: { type: 'object' }
			},
			{ id: 'win', name: 'Win', description: 'Finish the goal.', parameters: { type: 'object' } }
		],
		senses: [{ id: 'look', name: 'Look', description: 'See the world.' }],
		predicates: { 'has-won': 'The shared goal is met.' },
		create: () => instanceFor(undefined)
	};
}

/** The same shape, deliberately without `forAgent` — every world before WP29. */
function createSoloOnlyWorld(id = 'tiny/solo-world'): WorldDefinition {
	return {
		id,
		name: 'Solo-only world',
		layouts: [{ id: 'only', name: 'Only layout', initialState: {} }],
		actions: [{ id: 'ping', name: 'Ping', description: 'Ping.', parameters: { type: 'object' } }],
		senses: [{ id: 'look', name: 'Look', description: 'Look.' }],
		predicates: { 'has-won': 'Never.' },
		create: () => ({
			snapshot: () => ({}),
			observe: () => ({ channels: [], text: '', data: {} }),
			perform: () => ({ ok: true, narration: 'pinged', stateDiff: [] }),
			test: () => false,
			reset: () => {}
		})
	};
}

function buildRegistry(): PackRegistry {
	const registry = createPackRegistry();
	registry.registerPack({
		id: 'tiny',
		name: 'Tiny pack',
		version: '1.0.0',
		requiresCore: '>=0.0.1',
		worlds: [createTinyGroupWorld(), createSoloOnlyWorld()],
		brickKinds: v1BrickKinds(),
		cartridges: [
			{
				id: 'tiny/brain',
				providerId: 'mock',
				model: 'tiny-model-1',
				displayName: 'Tiny brain',
				blurb: 'Small.',
				stats: { words: 1, reasoning: 1, speed: 3 },
				costHint: 'low',
				defaults: { temperature: 0, maxTokens: 64 }
			}
		],
		goalCards: [
			{
				id: 'tiny/group-goal',
				title: 'Win together',
				goalText: 'Win the shared tiny world.',
				worldId: 'tiny/group-world',
				layoutId: 'only',
				successCondition: 'has-won',
				hints: [],
				teachesConcepts: []
			},
			{
				id: 'tiny/other-goal',
				title: 'A different card',
				goalText: 'Different world entirely.',
				worldId: 'tiny/solo-world',
				layoutId: 'only',
				successCondition: 'has-won',
				hints: [],
				teachesConcepts: []
			}
		]
	});
	return registry;
}

function buildSpec(id: string, name: string, goalCardId = 'tiny/group-goal'): AgentSpec {
	return {
		id,
		name,
		bricks: {
			llm: { cartridgeId: 'tiny/brain', temperature: 0, maxTokens: 64, personality: '' },
			sense: { channels: ['look'] },
			actions: { enabled: ['ping', 'win'] }
		},
		goalCardId,
		createdAt: '2026-08-19T09:00:00Z',
		updatedAt: '2026-08-19T09:00:00Z',
		schemaVersion: 1
	};
}

const AGENT_A = '11111111-1111-4111-8111-111111111111';
const AGENT_B = '22222222-2222-4222-8222-222222222222';

function twoMembers(
	scriptA: Parameters<typeof createMockProvider>[0]['script'],
	scriptB: typeof scriptA
) {
	return [
		{ spec: buildSpec(AGENT_A, 'Robo'), provider: createMockProvider({ script: scriptA }) },
		{ spec: buildSpec(AGENT_B, 'Bolt'), provider: createMockProvider({ script: scriptB }) }
	];
}

function makeGroup(config: {
	members: ReturnType<typeof twoMembers>;
	goalCardId?: string;
	groupMaxTokens?: number;
	maxRounds?: number;
}) {
	const clock = createTestClock();
	const group = createSessionGroup({
		members: config.members,
		registry: buildRegistry(),
		goalCardId: config.goalCardId ?? 'tiny/group-goal',
		options: {
			now: clock.now,
			newId: clock.newId,
			random: clock.random,
			...(config.groupMaxTokens !== undefined ? { groupMaxTokens: config.groupMaxTokens } : {}),
			...(config.maxRounds !== undefined ? { maxRounds: config.maxRounds } : {})
		}
	});
	const log: EngineEvent[] = [];
	group.events.onAny((event) => log.push(event));
	return { group, log };
}

describe('constructing a group', () => {
	it('refuses no members', () => {
		expect(() =>
			createSessionGroup({ members: [], registry: buildRegistry(), goalCardId: 'tiny/group-goal' })
		).toThrow(/at least one member/);
	});

	it('refuses two members sharing an agent id', () => {
		const registry = buildRegistry();
		expect(() =>
			createSessionGroup({
				members: [
					{ spec: buildSpec(AGENT_A, 'Robo'), provider: createMockProvider({ script: [] }) },
					{ spec: buildSpec(AGENT_A, 'Also Robo'), provider: createMockProvider({ script: [] }) }
				],
				registry,
				goalCardId: 'tiny/group-goal'
			})
		).toThrow(/share the agent id/);
	});

	it('refuses a member built for a different goal card — "mixed-world cards"', () => {
		const registry = buildRegistry();
		expect(() =>
			createSessionGroup({
				members: [
					{ spec: buildSpec(AGENT_A, 'Robo'), provider: createMockProvider({ script: [] }) },
					{
						spec: buildSpec(AGENT_B, 'Bolt', 'tiny/other-goal'),
						provider: createMockProvider({ script: [] })
					}
				],
				registry,
				goalCardId: 'tiny/group-goal'
			})
		).toThrow(/built for a different|same card/);
	});

	it('refuses a world that has not implemented forAgent', () => {
		const registry = buildRegistry();
		expect(() =>
			createSessionGroup({
				members: [
					{
						spec: buildSpec(AGENT_A, 'Robo', 'tiny/other-goal'),
						provider: createMockProvider({ script: [] })
					}
				],
				registry,
				goalCardId: 'tiny/other-goal'
			})
		).toThrow(/forAgent/);
	});

	it('refuses an unknown goal card', () => {
		const registry = buildRegistry();
		expect(() =>
			createSessionGroup({
				members: [
					{
						spec: buildSpec(AGENT_A, 'Robo', 'tiny/nonexistent'),
						provider: createMockProvider({ script: [] })
					}
				],
				registry,
				goalCardId: 'tiny/nonexistent'
			})
		).toThrow(/Unknown goal card/);
	});

	it('exposes each member’s own runId before any of them has taken a turn', () => {
		const { group } = makeGroup({
			members: twoMembers([turn('Ping.', 'ping')], [turn('Ping.', 'ping')])
		});
		expect(group.sessions).toHaveLength(2);
		expect(new Set(group.sessions.map((s) => s.runId)).size).toBe(2);
	});
});

describe('round-robin scheduling', () => {
	it('takes one tick per live member, in member order, per round', async () => {
		const { group, log } = makeGroup({
			members: twoMembers(
				[turn('Ping A1.', 'ping'), turn('Ping A2.', 'ping')],
				[turn('Ping B1.', 'ping'), turn('Ping B2.', 'ping')]
			)
		});

		await group.stepRound();
		await group.stepRound();

		const actionOrder = log
			.filter((event) => event.type === 'action.performed')
			.map((event) => event.agentId);
		expect(actionOrder).toEqual([AGENT_A, AGENT_B, AGENT_A, AGENT_B]);
	});

	it('is the actual shared world: A winning is visible to B within the same round', async () => {
		const { group } = makeGroup({
			members: twoMembers([turn('Win it.', 'win')], [turn('Just watching.', 'ping')])
		});
		// A acts first (member order), wins; B then takes its own round-1 turn
		// and its own JUDGE already sees the shared predicate A just made true
		// — proving the facades share one state, not a copy each.
		await group.stepRound();
		expect(group.sessions[0]?.status).toBe('finished');
		expect(group.sessions[1]?.status).toBe('finished');
	});

	it('skips a member that already finished, without erroring on a further round', async () => {
		const { group, log } = makeGroup({
			members: twoMembers([turn('Win now.', 'win')], [turn('Just watching.', 'ping')])
		});

		const first = await group.stepRound(); // A wins; B's own turn sees it too, same round
		expect(first.outcome).toBe('SUCCESS');
		expect(group.sessions.every((session) => session.status === 'finished')).toBe(true);

		// A finished group is inert, not an error — the round count does not move.
		const second = await group.stepRound();
		expect(second.round).toBe(first.round);
		expect(second.outcome).toBe('SUCCESS');

		// Exactly one action each: B never got a "sit out and skip" second turn
		// to take, because it finished in the very round it started in.
		const actions = log.filter((event) => event.type === 'action.performed');
		expect(actions).toHaveLength(2);
	});
});

describe('the merged trace', () => {
	it('carries group.started first and group.finished last, both under groupRunId with no agentId', async () => {
		const { group, log } = makeGroup({
			members: twoMembers([turn('Win.', 'win')], [turn('Win too.', 'win')])
		});
		await group.stepRound();

		expect(log[0]?.type).toBe('group.started');
		expect(log[0]?.runId).toBe(group.groupRunId);
		expect('agentId' in (log[0] as object)).toBe(false);

		const last = log.at(-1);
		expect(last?.type).toBe('group.finished');
		expect(last?.runId).toBe(group.groupRunId);
	});

	it('group.started names every member’s runId and agentId', async () => {
		const { group, log } = makeGroup({
			members: twoMembers([turn('Ping.', 'ping')], [turn('Ping.', 'ping')])
		});
		await group.stepRound();

		const started = log.find((event) => event.type === 'group.started');
		expect(started?.type === 'group.started' && started.payload.memberAgentIds).toEqual([
			AGENT_A,
			AGENT_B
		]);
		expect(started?.type === 'group.started' && started.payload.memberRunIds).toEqual(
			group.sessions.map((s) => s.runId)
		);
		expect(started?.type === 'group.started' && started.payload.scheduler).toBe('round-robin');
	});

	it('each member’s own trace is still complete and independently readable', async () => {
		const { group } = makeGroup({
			members: twoMembers([turn('Win.', 'win')], [turn('Win too.', 'win')])
		});
		const ownLogA: EngineEvent[] = [];
		group.sessions[0]?.events.onAny((event) => ownLogA.push(event));

		await group.stepRound();

		expect(ownLogA.some((event) => event.type === 'run.started')).toBe(true);
		expect(ownLogA.some((event) => event.type === 'run.finished')).toBe(true);
		expect(new Set(ownLogA.map((event) => event.runId)).size).toBe(1);
		expect(ownLogA.every((event) => event.agentId === AGENT_A)).toBe(true);
	});

	it('reproduces byte-identically on a second run — the group scheduler is deterministic', async () => {
		async function run(): Promise<EngineEvent[]> {
			const { group, log } = makeGroup({
				members: twoMembers(
					[turn('Ping.', 'ping'), turn('Win.', 'win')],
					[turn('Ping.', 'ping'), turn('Win.', 'win')]
				)
			});
			await group.stepRound();
			await group.stepRound();
			return log;
		}

		const first = await run();
		const second = await run();
		expect(JSON.stringify(second)).toBe(JSON.stringify(first));
	});
});

describe('ending the group', () => {
	it('finishes SUCCESS once every member independently reaches it', async () => {
		const { group } = makeGroup({
			members: twoMembers([turn('Win.', 'win')], [turn('Ping.', 'ping')])
		});
		await group.stepRound();
		await group.stepRound();
		expect(group.status).toBe('finished');
		const outcome = await group.stepRound();
		expect(outcome.outcome).toBe('SUCCESS');
	});

	it('trips OUT_OF_STEPS at maxRounds without exceeding it', async () => {
		const { group, log } = makeGroup({
			members: twoMembers(
				[turn('Ping.', 'ping'), turn('Ping.', 'ping'), turn('Ping.', 'ping')],
				[turn('Ping.', 'ping'), turn('Ping.', 'ping'), turn('Ping.', 'ping')]
			),
			maxRounds: 2
		});
		await group.stepRound();
		const second = await group.stepRound();
		expect(second.outcome).toBeUndefined();
		const third = await group.stepRound();
		expect(third.outcome).toBe('OUT_OF_STEPS');

		const finished = log.find((event) => event.type === 'group.finished');
		expect(finished?.type === 'group.finished' && finished.payload.rounds).toBe(2);
	});

	it('propagates stop() to every still-running member, closing their traces too', async () => {
		const { group } = makeGroup({
			members: twoMembers(
				[turn('Ping.', 'ping'), turn('Ping.', 'ping')],
				[turn('Ping.', 'ping'), turn('Ping.', 'ping')]
			)
		});
		await group.stepRound();
		group.stop('the practitioner pulled the plug');
		expect(group.sessions.every((session) => session.status === 'finished')).toBe(true);
	});

	/** Same regression class as the chokepoint's below: stop() never populates memberOutcomes either. */
	it('reports STOPPED_BY_USER, not OUT_OF_STEPS, on a stepRound() call after stop()', async () => {
		const { group } = makeGroup({
			members: twoMembers(
				[turn('Ping.', 'ping'), turn('Ping.', 'ping')],
				[turn('Ping.', 'ping'), turn('Ping.', 'ping')]
			)
		});
		await group.stepRound();
		group.stop('the practitioner pulled the plug');
		const after = await group.stepRound();
		expect(after.outcome).toBe('STOPPED_BY_USER');
	});
});

describe('the orchestrator chokepoint (groupMaxTokens)', () => {
	it('lets a round proceed under budget', async () => {
		const { group } = makeGroup({
			members: twoMembers(
				[
					{
						text: 'Ping.',
						toolCall: { name: 'ping', arguments: {} },
						usage: { inputTokens: 10, outputTokens: 5 }
					}
				],
				[
					{
						text: 'Ping.',
						toolCall: { name: 'ping', arguments: {} },
						usage: { inputTokens: 10, outputTokens: 5 }
					}
				]
			),
			groupMaxTokens: 1000
		});
		const result = await group.stepRound();
		expect(result.outcome).toBeUndefined();
	});

	it('stops the group once combined usage reaches the ceiling, with the chokepoint on the merged trace', async () => {
		const { group, log } = makeGroup({
			members: twoMembers(
				[
					{
						text: 'Ping.',
						toolCall: { name: 'ping', arguments: {} },
						usage: { inputTokens: 40, outputTokens: 10 }
					}
				],
				[
					{
						text: 'Ping.',
						toolCall: { name: 'ping', arguments: {} },
						usage: { inputTokens: 40, outputTokens: 10 }
					}
				]
			),
			groupMaxTokens: 50
		});

		// A round offers every live member a tick, so A's turn alone (usage 0 →
		// 50) and B's chokepoint check (50 is no longer < 50) both happen inside
		// this one round — the group need not wait for a second round to stop.
		const first = await group.stepRound();
		expect(first.outcome).toBe('STOPPED_BY_GUARDRAIL');

		const tripped = log.find((event) => event.type === 'guardrail.tripped');
		expect(tripped?.type === 'guardrail.tripped' && tripped.payload.guardrailId).toBe(
			'core/group-token-budget'
		);
		expect('agentId' in (tripped as object)).toBe(false);
	});

	/**
	 * Regression: `stepRound()`'s already-finished branch used to re-derive the
	 * outcome with `deriveGroupOutcome()`, which reads `memberOutcomes` — never
	 * populated for a member the chokepoint stopped (it ends via `session.stop()`,
	 * not a natural `step()` return). A second call silently reported
	 * `OUT_OF_STEPS` instead of the real `STOPPED_BY_GUARDRAIL`, its own default
	 * fallback for "nobody's outcome is on record" happening to be exactly the
	 * wrong answer here. Caught by this verification pass, not by any stage's
	 * own gate — nothing before it called `stepRound()` twice past a finish.
	 */
	it('keeps reporting STOPPED_BY_GUARDRAIL on every call after the group has finished', async () => {
		const { group } = makeGroup({
			members: twoMembers(
				[
					{
						text: 'Ping.',
						toolCall: { name: 'ping', arguments: {} },
						usage: { inputTokens: 40, outputTokens: 10 }
					}
				],
				[
					{
						text: 'Ping.',
						toolCall: { name: 'ping', arguments: {} },
						usage: { inputTokens: 40, outputTokens: 10 }
					}
				]
			),
			groupMaxTokens: 50
		});

		const first = await group.stepRound();
		expect(first.outcome).toBe('STOPPED_BY_GUARDRAIL');
		const second = await group.stepRound();
		expect(second.outcome).toBe('STOPPED_BY_GUARDRAIL');
		expect(second.round).toBe(first.round);
	});
});

describe('createGroupTokenBudgetGuardrail, in isolation', () => {
	const ctx = (inputTokens: number, outputTokens: number): GuardrailContext => ({
		hook: 'pre-think',
		tick: 0,
		spec: buildSpec(AGENT_A, 'Robo'),
		usage: { ticks: 0, inputTokens, outputTokens },
		worldState: {},
		history: []
	});

	it('allows under the ceiling', async () => {
		const guardrail = createGroupTokenBudgetGuardrail(100);
		expect(await guardrail.check(ctx(40, 40))).toEqual({ allow: true });
	});

	it('stops the run at or above the ceiling', async () => {
		const guardrail = createGroupTokenBudgetGuardrail(100);
		const verdict = await guardrail.check(ctx(60, 40));
		expect(verdict).toMatchObject({ allow: false, disposition: 'stop-run' });
	});
});

describe('deliverInput', () => {
	it('reaches the shared world exactly once, not once per member', async () => {
		const { group, log } = makeGroup({
			members: twoMembers([turn('Ping.', 'ping')], [turn('Ping.', 'ping')])
		});
		group.deliverInput('hello from outside');
		const delivered = log.filter((event) => event.type === 'input.delivered');
		expect(delivered).toHaveLength(1);
	});
});

describe('approvals', () => {
	it('a member awaiting approval pauses the whole round, and resolveApproval(agentId) unblocks only that member', async () => {
		const registry = buildRegistry();
		const pausing = {
			id: 'test/pause-ping',
			name: 'Pause on ping',
			description: 'Always asks first.',
			hooks: ['pre-act' as const],
			check: () => ({ pause: true as const, reason: 'checking with a person' })
		};

		const clock = createTestClock();
		const group = createSessionGroup({
			members: [
				{
					spec: buildSpec(AGENT_A, 'Robo'),
					provider: createMockProvider({ script: [turn('Ping.', 'ping')] }),
					guardrails: [pausing]
				},
				{
					spec: buildSpec(AGENT_B, 'Bolt'),
					provider: createMockProvider({ script: [turn('Ping.', 'ping')] })
				}
			],
			registry,
			goalCardId: 'tiny/group-goal',
			options: { now: clock.now, newId: clock.newId, random: clock.random }
		});

		const pending = group.stepRound();
		// A's own tick (sense→compose→think→decide→pre-act) is several real
		// awaits deep before it reaches the pause — poll microtasks rather than
		// guess a fixed count, with a generous cap so a genuine bug hangs the
		// test loudly instead of silently passing on a lucky timing.
		for (let i = 0; i < 200 && group.status !== 'awaiting-approval'; i++) {
			await Promise.resolve();
		}
		expect(group.status).toBe('awaiting-approval');

		group.resolveApproval(AGENT_A, true);
		const result = await pending;
		expect(result.round).toBe(1);
	});
});

describe('start(mode) and pause()', () => {
	it('start("play") drives every round automatically until the group finishes', async () => {
		const { group, log } = makeGroup({
			members: twoMembers(
				[turn('Ping.', 'ping'), turn('Win.', 'win')],
				[turn('Ping.', 'ping'), turn('Ping.', 'ping')]
			)
		});
		group.start('play');
		// The play loop drives itself off `roundDelayMs` (here 0) via
		// fire-and-forget promises — poll microtasks rather than guess a
		// fixed count, same reasoning as the approval test above.
		for (let i = 0; i < 200 && group.status !== 'finished'; i++) {
			await Promise.resolve();
		}
		expect(group.status).toBe('finished');
		expect(log.filter((event) => event.type === 'group.started')).toHaveLength(1);
		expect(log.at(-1)?.type).toBe('group.finished');
	});

	it('start("step") leaves the group paused — it does not auto-advance', () => {
		const { group } = makeGroup({
			members: twoMembers([turn('Ping.', 'ping')], [turn('Ping.', 'ping')])
		});
		group.start('step');
		expect(group.status).toBe('paused');
	});

	it('a second start() call is a no-op once the group is already under way', () => {
		const { group, log } = makeGroup({
			members: twoMembers([turn('Ping.', 'ping')], [turn('Ping.', 'ping')])
		});
		group.start('step');
		group.start('step');
		expect(log.filter((event) => event.type === 'group.started')).toHaveLength(1);
	});

	it('pause() stops a running play loop before every round has executed', async () => {
		const clock = createTestClock();
		const group = createSessionGroup({
			members: [
				{
					spec: buildSpec(AGENT_A, 'Robo'),
					provider: createMockProvider({
						script: [turn('Ping.', 'ping'), turn('Ping.', 'ping'), turn('Ping.', 'ping')]
					})
				},
				{
					spec: buildSpec(AGENT_B, 'Bolt'),
					provider: createMockProvider({
						script: [turn('Ping.', 'ping'), turn('Ping.', 'ping'), turn('Ping.', 'ping')]
					})
				}
			],
			registry: buildRegistry(),
			goalCardId: 'tiny/group-goal',
			// A real gap between rounds gives pause() a window to land in —
			// the scheduler's own now/newId/random stay the test clock's,
			// only the pacing between rounds uses real time.
			options: {
				now: clock.now,
				newId: clock.newId,
				random: clock.random,
				maxRounds: 3,
				tickDelayMs: 30
			}
		});

		group.start('play');
		await new Promise((resolve) => setTimeout(resolve, 10));
		group.pause();
		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(group.status).toBe('paused');
		expect(group.sessions.every((session) => session.status !== 'finished')).toBe(true);
	});
});
