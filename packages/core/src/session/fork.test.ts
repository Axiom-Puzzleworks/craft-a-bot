import { describe, expect, it } from 'vitest';
import { createPackRegistry, type PackRegistry } from '../pack-registry.js';
import type { AgentSpec } from '../schemas/agent-spec.js';
import type { EngineEvent } from '../schemas/events.js';
import {
	createMockProvider,
	createTestClock,
	turn,
	v1BrickKinds,
	type MockTurn
} from '../testing/index.js';
import type { Guardrail } from '../types/guardrail.js';
import type { WorldDefinition, WorldInstance } from '../types/world.js';
import { createSession } from './agent-session.js';
import {
	brainTurnsThrough,
	eventsThrough,
	feedbackAfter,
	forkSession,
	notebookFrom,
	rebuildWorld,
	tickMemoryFrom,
	worldStateThrough
} from './fork.js';

/**
 * `forkSession` over a tiny world with no `restore` (WP66, `54-…` §4.1):
 * the world is rebuilt by replaying its recorded calls and checked against
 * the recorded snapshot; the memory, the notebook, the usage, the feedback
 * and the guardrails' history come back from the origin's rows; a world
 * that keeps something outside its snapshot is refused with the path; the
 * folds are checked one by one.
 */
function tinyWorld(id: string, options: { hiddenCounter?: boolean } = {}): WorldDefinition {
	return {
		id,
		name: 'Tiny world',
		layouts: [{ id: 'only', name: 'Only layout', initialState: { pings: 0, won: false } }],
		actions: [
			{
				id: 'ping',
				name: 'Ping',
				description: 'Make a small noise.',
				parameters: { type: 'object' }
			},
			{ id: 'win', name: 'Win', description: 'Finish the goal.', parameters: { type: 'object' } },
			{ id: 'flop', name: 'Flop', description: 'Always refused.', parameters: { type: 'object' } }
		],
		senses: [{ id: 'look', name: 'Look', description: 'See the world.' }],
		predicates: { 'has-won': 'The goal is met.' },
		create(): WorldInstance {
			const state = { pings: 0, won: false, heard: [] as string[] };
			// A world that keeps a counter outside its snapshot cannot be rebuilt from its calls.
			let hidden = 0;
			return {
				snapshot: () => ({ ...state, heard: [...state.heard] }),
				receiveInput: (text: string) => void state.heard.push(text),
				observe: (channels) => ({
					channels: [...channels],
					text: `pings: ${state.pings}${options.hiddenCounter ? ` hidden: ${hidden}` : ''}`,
					summary: `pings ${state.pings}`,
					data: {}
				}),
				perform: (action) => {
					hidden += 1;
					if (action.name === 'ping') {
						state.pings += 1;
						return { ok: true, narration: `ping ${state.pings}!`, stateDiff: [] };
					}
					if (action.name === 'win') {
						state.won = true;
						return { ok: true, narration: 'you win!', stateDiff: [] };
					}
					return { ok: false, narration: 'you flop, and nothing happens', stateDiff: [] };
				},
				test: (predicate) => predicate === 'has-won' && state.won,
				reset: () => {
					state.pings = 0;
					state.won = false;
					state.heard = [];
					hidden = 0;
				}
			};
		}
	};
}

function buildRegistry(): PackRegistry {
	const registry = createPackRegistry();
	registry.registerPack({
		id: 'tiny',
		name: 'Tiny pack',
		version: '1.0.0',
		requiresCore: '>=0.0.1',
		worlds: [tinyWorld('tiny/world'), tinyWorld('tiny/hidden-world', { hiddenCounter: true })],
		tools: [
			{
				id: 'tiny/notebook_write',
				name: 'Note',
				description: 'Write a note.',
				parameters: { type: 'object' },
				requiresNotebook: true,
				execute: (args, context) => {
					const note = String((args as { note?: unknown })?.note ?? '');
					context.notebook.append(note);
					return { ok: true, output: `noted: ${note}` };
				}
			}
		],
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
				id: 'tiny/goal',
				title: 'Win',
				goalText: 'Win the tiny world.',
				worldId: 'tiny/world',
				layoutId: 'only',
				successCondition: 'has-won',
				hints: [],
				teachesConcepts: []
			},
			{
				id: 'tiny/hidden-goal',
				title: 'Win, hidden',
				goalText: 'Win the world with a hidden counter.',
				worldId: 'tiny/hidden-world',
				layoutId: 'only',
				successCondition: 'has-won',
				hints: [],
				teachesConcepts: []
			}
		]
	});
	return registry;
}

const spec = (goalCardId = 'tiny/goal', tools: string[] = []): AgentSpec => ({
	id: '11111111-1111-4111-8111-111111111111',
	name: 'Tinybot',
	bricks: {
		llm: { cartridgeId: 'tiny/brain', temperature: 0, maxTokens: 64, personality: '' },
		sense: { channels: ['look'] },
		actions: { enabled: ['ping', 'win', 'flop'] },
		memory: { windowSize: 10, notebook: true },
		...(tools.length > 0 ? { tools: { enabled: tools } } : {})
	},
	goalCardId,
	createdAt: '2026-08-12T09:00:00Z',
	updatedAt: '2026-08-12T09:00:00Z',
	schemaVersion: 1
});

const PLAN = [
	turn('Ping once.', 'ping'),
	turn('Note it.', 'notebook_write', { note: 'pinged once' }),
	turn('Flop.', 'flop'),
	turn('Win.', 'win')
];

async function drive(
	config: {
		spec?: AgentSpec;
		script?: MockTurn[];
		fork?: { events: EngineEvent[]; tick: number; spec?: AgentSpec; guardrails?: Guardrail[] };
		guardrails?: Guardrail[];
		approve?: boolean;
		deliver?: { atTick: number; text: string };
	} = {}
): Promise<EngineEvent[]> {
	const clock = createTestClock({ idOffset: config.fork ? 500 : 0 });
	const deps = {
		spec: config.spec ?? spec('tiny/goal', ['tiny/notebook_write']),
		registry: buildRegistry(),
		provider: createMockProvider({
			script: config.script ?? PLAN,
			...(config.fork ? { startAt: brainTurnsThrough(config.fork.events, config.fork.tick) } : {})
		}),
		guardrails: config.guardrails ?? [],
		options: { now: clock.now, newId: clock.newId, random: clock.random }
	};
	const session = config.fork
		? forkSession(deps, {
				from: { events: config.fork.events, tick: config.fork.tick },
				overrides: {
					...(config.fork.spec ? { spec: config.fork.spec } : {}),
					...(config.fork.guardrails ? { guardrails: config.fork.guardrails } : {})
				}
			})
		: createSession(deps);
	const events: EngineEvent[] = [];
	session.events.onAny((event) => events.push(event));
	session.events.on('approval.requested', () => session.resolveApproval(config.approve ?? true));
	session.start('step');
	for (let step = 0; step < 8; step++) {
		if (config.deliver && step === config.deliver.atTick) session.deliverInput(config.deliver.text);
		if ((await session.step()).outcome) break;
	}
	return events;
}

const comparable = (events: readonly EngineEvent[], after: number) =>
	events
		.filter((event) => event.tick > after || event.type === 'run.finished')
		.map((event) => ({
			type: event.type,
			tick: event.tick,
			payload:
				event.type === 'tool.executed'
					? { ...event.payload, durationMs: 0 }
					: event.type === 'run.started'
						? Object.fromEntries(
								Object.entries(event.payload).filter(([key]) => key !== 'forkedFrom')
							)
						: event.payload
		}));

describe('forkSession over a world with no restore', () => {
	it('rebuilds the world by replaying its calls and reproduces the origin after every tick', async () => {
		const origin = await drive({ deliver: { atTick: 1, text: 'hello there' } });
		expect(origin.find((event) => event.type === 'run.finished')).toMatchObject({
			payload: { outcome: 'SUCCESS', ticks: 4 }
		});
		for (const tick of [1, 2, 3]) {
			const fork = await drive({ fork: { events: origin, tick } });
			const started = fork.find((event) => event.type === 'run.started');
			expect(started?.type === 'run.started' && started.payload.forkedFrom).toEqual({
				runId: origin[0]?.runId,
				tick,
				notebook: tick >= 2 ? 'restored' : 'empty'
			});
			expect(comparable(fork, tick), `tick ${tick}`).toEqual(comparable(origin, tick));
			expect(fork[0]?.runId).not.toBe(origin[0]?.runId);
		}
	});

	it('a world that keeps something outside its snapshot is refused with the path, and the goal card must match', async () => {
		const hidden = spec('tiny/hidden-goal');
		const origin = await drive({ spec: hidden, script: [PLAN[0]!, PLAN[3]!] });
		expect(() =>
			forkSession(
				{
					spec: hidden,
					registry: buildRegistry(),
					provider: createMockProvider({ script: [] })
				},
				{ from: { events: origin, tick: 1 } }
			)
		).not.toThrow();
		// The replay agrees on the snapshot (the counter is not in it) — the refusal needs a world whose replay differs.
		const world = buildRegistry().getWorld('tiny/world')!.create('only');
		world.perform({ name: 'ping', arguments: {} });
		const drifted = origin.map((event) =>
			event.type === 'world.changed' && event.tick === 1
				? { ...event, payload: { state: { ...(event.payload.state as object), pings: 9 } } }
				: event
		);
		expect(() =>
			rebuildWorld(buildRegistry().getWorld('tiny/world')!.create('only'), drifted, 1)
		).toThrow(/differs from the recorded state at "pings"/);
		expect(() =>
			forkSession(
				{ spec: hidden, registry: buildRegistry(), provider: createMockProvider({ script: [] }) },
				{ from: { events: origin, tick: 1 }, overrides: { spec: spec('tiny/goal') } }
			)
		).toThrow(/goal card/);
		expect(() =>
			forkSession(
				{ spec: hidden, registry: buildRegistry(), provider: createMockProvider({ script: [] }) },
				{ from: { events: origin, tick: 7 } }
			)
		).toThrow(/tick 7/);
		expect(() =>
			forkSession(
				{ spec: hidden, registry: buildRegistry(), provider: createMockProvider({ script: [] }) },
				{ from: { events: origin.filter((event) => event.type !== 'run.started'), tick: 1 } }
			)
		).toThrow(/no run.started/);
		void world;
	});

	it('a guardrail added on the fork checks the tick where the origin acted freely', async () => {
		const origin = await drive();
		const block: Guardrail = {
			id: 'test/no-win',
			name: 'No win',
			description: 'Blocks winning.',
			hooks: ['pre-act'],
			check: (ctx) =>
				ctx.proposed?.name.endsWith('win')
					? { allow: false, reason: 'not today', disposition: 'block-action' }
					: { allow: true }
		};
		const fork = await drive({ fork: { events: origin, tick: 3, guardrails: [block] } });
		expect(fork.some((event) => event.type === 'guardrail.tripped' && event.tick === 4)).toBe(true);
		expect(fork.find((event) => event.type === 'run.finished')?.payload).not.toMatchObject({
			outcome: 'SUCCESS'
		});
	});

	it('the folds: memory, notebook, feedback, usage, history', async () => {
		const origin = await drive();
		expect(brainTurnsThrough(origin, 2)).toBe(2);
		expect(eventsThrough(origin, 1).every((event) => event.tick <= 1)).toBe(true);
		expect(worldStateThrough(origin, 1)).toMatchObject({ pings: 1, won: false });
		expect(notebookFrom(origin, 1)).toEqual([]);
		expect(notebookFrom(origin, 2)).toEqual(['pinged once']);
		const memory = tickMemoryFrom(origin, 3);
		expect(memory.map((entry) => entry.tick)).toEqual([1, 2, 3]);
		expect(memory[0]).toMatchObject({
			observation: 'pings 0',
			thought: 'Ping once.',
			action: 'tried to ping',
			result: 'ping 1!',
			ok: true
		});
		expect(memory[1]).toMatchObject({ action: 'used the notebook_write tool', ok: true });
		expect(memory[2]).toMatchObject({ action: 'tried to flop', ok: false });
		// The flop's narration is what the next prompt would carry.
		expect(feedbackAfter(origin, 3)).toEqual(['you flop, and nothing happens']);
		expect(feedbackAfter(origin, 1)).toEqual([]);
	});

	it('feedback after a refusal and after a denied approval reads as the loop wrote it', async () => {
		const block: Guardrail = {
			id: 'test/no-ping',
			name: 'No ping',
			description: 'Blocks pinging.',
			hooks: ['pre-act'],
			check: (ctx) =>
				ctx.proposed?.name.endsWith('ping')
					? { allow: false, reason: 'quiet please', disposition: 'block-action' }
					: { allow: true }
		};
		const blocked = await drive({ script: [PLAN[0]!, PLAN[3]!], guardrails: [block] });
		expect(feedbackAfter(blocked, 1)).toEqual([
			'You tried to ping, but a safety rule stopped you: quiet please'
		]);
		expect(tickMemoryFrom(blocked, 1)[0]?.refused).toContain('safety rule');
		const pause: Guardrail = {
			id: 'test/ask',
			name: 'Ask',
			description: 'Pauses pinging.',
			hooks: ['pre-act'],
			check: (ctx) =>
				ctx.proposed?.name.endsWith('ping')
					? { pause: true, reason: 'check first' }
					: { allow: true }
		};
		const denied = await drive({
			script: [PLAN[0]!, PLAN[3]!],
			guardrails: [pause],
			approve: false
		});
		expect(feedbackAfter(denied, 1)).toEqual([
			'You tried to ping, but a person said no: check first'
		]);
		// An empty reply is asked again within the tick; two in a row are the mumble the loop notes.
		const mumbled = await drive({
			script: [{ text: '', toolCall: null }, { text: '', toolCall: null }, PLAN[3]!]
		});
		expect(feedbackAfter(mumbled, 1)).toEqual([
			'Your last two replies were empty. Try again, and say what you are doing.'
		]);
	});
});
