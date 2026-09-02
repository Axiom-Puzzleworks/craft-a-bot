import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { stubService } from '../types/guardrail-service.test.js';
import { createSession } from './agent-session.js';
import { createPackRegistry, type PackRegistry } from '../pack-registry.js';
import { createMockProvider, createTestClock, turn, v1BrickKinds } from '../testing/index.js';
import { migrateAgentSpec, toSpecV2 } from '../schemas/agent-spec-v2.js';
import type { AgentSpec } from '../schemas/agent-spec.js';
import type { EngineEvent } from '../schemas/events.js';
import type { BrickKindDefinition } from '../types/brick.js';
import type { Guardrail, GuardrailHook, GuardrailVerdict } from '../types/guardrail.js';
import type { ToolDefinition } from '../types/tool.js';
import type { WorldDefinition, WorldInstance } from '../types/world.js';

/**
 * The loop, tested against a deliberately trivial world rather than the
 * Playroom. `core` must never depend on a pack (01-ARCHITECTURE.md §1.3), so
 * proving the engine works has to be possible without one — these cover the
 * mechanics, while pack-starter's session tests cover realistic goal runs.
 */

/**
 * A one-cell world: `ping` does nothing much, `win` satisfies the goal.
 *
 * `ears` decides whether it implements `receiveInput` — a world is entitled to
 * have no way of being spoken to, and E2 has to behave sensibly either way.
 */
function createTinyWorld(id = 'tiny/world', ears = true): WorldDefinition {
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
			{
				id: 'flop',
				name: 'Flop',
				description: 'Try something the world always refuses.',
				parameters: { type: 'object' }
			}
		],
		senses: [{ id: 'look', name: 'Look', description: 'See the world.' }],
		predicates: { 'has-won': 'The goal is met.' },
		create(): WorldInstance {
			const state = { pings: 0, won: false, heard: [] as string[] };
			return {
				snapshot: () => ({ ...state }),
				...(ears ? { receiveInput: (text: string) => void state.heard.push(text) } : {}),
				observe: (channels) => ({
					channels: [...channels],
					text: channels.length > 0 ? `pings: ${state.pings}` : 'you sense nothing',
					data: {}
				}),
				perform: (action) => {
					if (action.name === 'ping') {
						state.pings += 1;
						return { ok: true, narration: 'ping!', stateDiff: [] };
					}
					if (action.name === 'win') {
						state.won = true;
						return { ok: true, narration: 'you win!', stateDiff: [] };
					}
					if (action.name === 'flop') {
						return { ok: false, narration: 'you flop, and nothing happens', stateDiff: [] };
					}
					return { ok: false, narration: `you cannot ${action.name}`, stateDiff: [] };
				},
				test: (predicate) => predicate === 'has-won' && state.won,
				reset: () => {
					state.pings = 0;
					state.won = false;
					state.heard = [];
				}
			};
		}
	};
}

const echoTool: ToolDefinition = {
	id: 'tiny/echo',
	name: 'Echo',
	description: 'Repeats what you give it.',
	parameters: { type: 'object' },
	execute: (args) => ({ ok: true, output: `echo: ${JSON.stringify(args)}` })
};

const secretTool: ToolDefinition = {
	id: 'tiny/secret',
	name: 'Secret',
	description: 'Needs the notebook.',
	parameters: { type: 'object' },
	requiresNotebook: true,
	execute: () => ({ ok: true, output: 'secret' })
};

function buildRegistry(): PackRegistry {
	const registry = createPackRegistry();
	registry.registerPack({
		id: 'tiny',
		name: 'Tiny pack',
		version: '1.0.0',
		requiresCore: '>=0.0.1',
		worlds: [createTinyWorld(), createTinyWorld('tiny/deaf-world', false)],
		tools: [echoTool, secretTool],
		/*
		 * The loop builds runtimes from registered kinds (WP14 slice 3), so a
		 * registry with none is a bot with nothing fitted, however full its spec
		 * looks. `v1BrickKinds` is the shared stub; the real behaviour is proved
		 * against the real pack in `pack-starter`.
		 */
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
				id: 'tiny/deaf-goal',
				title: 'Win, unheard',
				goalText: 'Win the tiny world nobody can talk to.',
				worldId: 'tiny/deaf-world',
				layoutId: 'only',
				successCondition: 'has-won',
				hints: [],
				teachesConcepts: []
			}
		]
	});
	return registry;
}

function buildSpec(
	overrides: Partial<AgentSpec['bricks']> = {},
	goalCardId = 'tiny/goal'
): AgentSpec {
	return {
		id: '11111111-1111-4111-8111-111111111111',
		name: 'Tinybot',
		bricks: {
			llm: { cartridgeId: 'tiny/brain', temperature: 0, maxTokens: 64, personality: '' },
			sense: { channels: ['look'] },
			actions: { enabled: ['ping', 'win'] },
			...overrides
		},
		goalCardId,
		createdAt: '2026-08-12T09:00:00Z',
		updatedAt: '2026-08-12T09:00:00Z',
		schemaVersion: 1
	};
}

function makeSession(config: {
	spec?: AgentSpec;
	script?: Parameters<typeof createMockProvider>[0]['script'];
	guardrails?: Guardrail[];
	budgets?: { maxTicks?: number; maxTokens?: number; requestTimeoutMs?: number };
	/** WP29, `23-…` §4.5: a world handed in rather than built. */
	world?: WorldInstance;
	/** WP29, `23-…` §4.5: stamped into every emitted event's envelope. */
	parentRunId?: string;
}) {
	const clock = createTestClock();
	const session = createSession({
		spec: config.spec ?? buildSpec(),
		registry: buildRegistry(),
		provider: createMockProvider({ script: config.script ?? [] }),
		guardrails: config.guardrails ?? [],
		...(config.world ? { world: config.world } : {}),
		options: {
			now: clock.now,
			newId: clock.newId,
			random: clock.random,
			...(config.budgets ? { budgets: config.budgets } : {}),
			...(config.parentRunId ? { parentRunId: config.parentRunId } : {})
		}
	});
	const seen: string[] = [];
	const log: EngineEvent[] = [];
	session.events.onAny((event) => {
		seen.push(event.type);
		log.push(event);
	});
	return { session, seen, log };
}

describe('starting a session', () => {
	it('refuses a goal card that is not installed', () => {
		expect(() =>
			createSession({
				spec: buildSpec({}, 'tiny/nope'),
				registry: buildRegistry(),
				provider: createMockProvider({ script: [] }),
				guardrails: []
			})
		).toThrow(/Unknown goal card/);
	});

	it('refuses a goal card whose world is not installed', () => {
		const registry = createPackRegistry();
		registry.registerPack({
			id: 'orphan',
			name: 'Orphan',
			version: '1.0.0',
			requiresCore: '>=0.0.1',
			goalCards: [
				{
					id: 'tiny/goal',
					title: 'Win',
					goalText: 'Win.',
					worldId: 'missing/world',
					layoutId: 'only',
					successCondition: 'has-won',
					hints: [],
					teachesConcepts: []
				}
			]
		});
		expect(() =>
			createSession({
				spec: buildSpec(),
				registry,
				provider: createMockProvider({ script: [] }),
				guardrails: []
			})
		).toThrow(/not installed/);
	});

	it('starts idle and reports run.started on the first step', async () => {
		const { session, seen } = makeSession({ script: [turn('Ping.', 'ping')] });
		expect(session.status).toBe('idle');
		await session.step();
		expect(seen[0]).toBe('run.started');
	});

	it('is paused between ticks in step mode, and finished after success', async () => {
		const { session } = makeSession({ script: [turn('Win!', 'win')] });
		session.start('step');
		expect(session.status).toBe('paused');
		await session.step();
		expect(session.status).toBe('finished');
	});

	it('ignores start() once the run has finished', async () => {
		const { session } = makeSession({ script: [turn('Win!', 'win')] });
		await session.step();
		session.start('play');
		expect(session.status).toBe('finished');
	});

	it('returns the recorded outcome when stepped after finishing', async () => {
		const { session } = makeSession({ script: [turn('Win!', 'win')] });
		await session.step();
		expect(await session.step()).toMatchObject({ outcome: 'SUCCESS' });
	});
});

/**
 * **Wire-name collisions** (E6, `14-…` §3, closing the second half of
 * `12-…` D4). The provider's function-calling API has no namespaces, so two
 * things the model would call by the same name is not a build to start.
 */
describe('two things called the same', () => {
	const rivalPing: ToolDefinition = {
		id: 'rival/ping',
		name: 'Rival ping',
		description: 'Also called ping.',
		parameters: { type: 'object' },
		execute: () => ({ ok: true, output: 'rival' })
	};

	function registryWithRival(): PackRegistry {
		const registry = buildRegistry();
		registry.registerPack({
			id: 'rival',
			name: 'Rival pack',
			version: '1.0.0',
			requiresCore: '>=0.0.1',
			tools: [rivalPing]
		});
		return registry;
	}

	it('refuses to build when a tool and an action share a wire name', () => {
		expect(() =>
			createSession({
				spec: buildSpec({
					tools: { enabled: ['rival/ping'] },
					actions: { enabled: ['ping', 'win'] }
				}),
				registry: registryWithRival(),
				provider: createMockProvider({ script: [] }),
				guardrails: []
			})
		).toThrow(/more than one thing called "ping"/);
	});

	it('builds happily when the names do not clash', () => {
		expect(() =>
			createSession({
				spec: buildSpec({ tools: { enabled: ['tiny/echo'] } }),
				registry: registryWithRival(),
				provider: createMockProvider({ script: [] }),
				guardrails: []
			})
		).not.toThrow();
	});
});

describe('the tick sequence', () => {
	it('emits the nine steps in order', async () => {
		const { session, seen } = makeSession({ script: [turn('Ping.', 'ping')] });
		await session.step();

		expect(seen).toEqual([
			'run.started',
			'world.changed', // the opening scene
			'tick.started',
			'sense',
			'prompt.composed',
			'think.started',
			'think.token', // "Ping." streams as a single chunk
			'think.completed',
			'decision',
			'action.performed',
			'world.changed',
			'tick.completed'
		]);
	});

	it('resolves the cartridge to its real provider model', async () => {
		const { session } = makeSession({ script: [turn('Ping.', 'ping')] });
		let model = '';
		session.events.on('think.completed', (event) => {
			model = (event.payload.response.raw as { turn?: unknown }) ? model : model;
		});
		const requests: string[] = [];
		const clock = createTestClock();
		const spy = createSession({
			spec: buildSpec(),
			registry: buildRegistry(),
			provider: {
				id: 'spy',
				name: 'Spy',
				keyRequirement: 'none',
				validateKey: () => Promise.resolve({ ok: true, message: '' }),
				chat: (request) => {
					requests.push(request.model);
					return Promise.resolve({
						text: 'ok',
						toolCall: null,
						usage: { inputTokens: 1, outputTokens: 1 },
						raw: {},
						finishReason: 'stop' as const
					});
				}
			},
			guardrails: [],
			options: { now: clock.now, newId: clock.newId, random: clock.random }
		});
		await spy.step();
		expect(requests).toEqual(['tiny-model-1']);
		await session.step();
	});

	it('senses nothing when no Sense brick is fitted', async () => {
		const spec = buildSpec();
		delete spec.bricks.sense;
		const { session } = makeSession({ spec, script: [turn('Ping.', 'ping')] });

		let text = '';
		session.events.on('sense', (event) => {
			text = event.payload.observation.text;
		});
		await session.step();
		expect(text).toBe('you sense nothing');
	});

	it('routes an action the world does not have to the world, which refuses it kindly', async () => {
		const { session, seen } = makeSession({ script: [turn('Teleport!', 'teleport')] });
		let narration = '';
		session.events.on('action.performed', (event) => {
			narration = event.payload.result.narration;
		});
		await session.step();

		expect(narration).toContain('cannot teleport');
		// Only the opening scene — a refused action changes nothing.
		expect(seen.filter((type) => type === 'world.changed')).toHaveLength(1);
	});

	it('refuses an action the world has but the bot was not built with', async () => {
		// Found via the teaching arc: without this the Actions brick gated nothing,
		// and a bot with no hands could still move and speak (02 §9, chapter 1).
		const spec = buildSpec();
		delete spec.bricks.actions;
		const { session, seen } = makeSession({ spec, script: [turn('Off I go.', 'ping')] });

		let narration = '';
		session.events.on('action.performed', (event) => {
			narration = event.payload.result.narration;
		});
		await session.step();

		expect(narration).toContain('not been built with any way to do it');
		// Nothing happened to the world, so nothing was announced about it.
		expect(seen.filter((type) => type === 'world.changed')).toHaveLength(1);
	});

	it('performs the same action once the brick grants it', async () => {
		const { session } = makeSession({ script: [turn('Off I go.', 'ping')] });
		let ok = false;
		session.events.on('action.performed', (event) => {
			ok = event.payload.result.ok;
		});
		await session.step();
		expect(ok).toBe(true);
	});

	it('records a thinking turn with no call', async () => {
		const { session, seen } = makeSession({
			script: [{ text: 'Just pondering.', toolCall: null }]
		});
		await session.step();
		expect(seen).toContain('decision');
		expect(seen).not.toContain('action.performed');
	});
});

describe('the malformed-output re-prompt rule (03-UI-UX-DESIGN.md §9)', () => {
	it('re-prompts once with a stricter nudge, then carries on', async () => {
		const { session, seen } = makeSession({
			script: [{ text: '  ', toolCall: null }, turn('Sorry — ping.', 'ping')]
		});
		const prompts: number[] = [];
		session.events.on('prompt.composed', (event) => prompts.push(event.payload.messages.length));

		await session.step();

		// One tick, two think cycles: the mumble and the re-prompt.
		expect(seen.filter((type) => type === 'tick.started')).toHaveLength(1);
		expect(seen.filter((type) => type === 'think.started')).toHaveLength(2);
		// The re-prompt carries one extra message — the stricter instruction.
		expect(prompts[1]).toBe((prompts[0] ?? 0) + 1);
		expect(seen).toContain('action.performed');
	});

	it('gives up after the second mumble and wastes the tick', async () => {
		const { session, seen } = makeSession({
			script: () => ({ text: '', toolCall: null }),
			budgets: { maxTicks: 2 }
		});
		const prompts: string[] = [];
		session.events.on('prompt.composed', (event) => {
			prompts.push(event.payload.messages.at(-1)?.content ?? '');
		});

		await session.step();
		await session.step();

		expect(seen).not.toContain('action.performed');
		// Prompts run [tick 1 initial, tick 1 re-prompt, tick 2 initial, tick 2
		// re-prompt]; the mumbling feedback lands on the next tick's first prompt.
		expect(prompts).toHaveLength(4);
		expect(prompts[2]).toContain('Your last two replies were empty');
	});
});

describe('tools', () => {
	it('offers and executes an enabled tool', async () => {
		const { session, seen } = makeSession({
			spec: buildSpec({ tools: { enabled: ['tiny/echo'] } }),
			script: [turn('Echo this.', 'echo', { word: 'hello' })]
		});
		let output: unknown;
		session.events.on('tool.executed', (event) => {
			output = event.payload.result;
		});
		await session.step();

		expect(seen).toContain('tool.executed');
		expect(output).toContain('hello');
	});

	it('passes tool names on the wire without the pack prefix', async () => {
		const names: string[] = [];
		const clock = createTestClock();
		const session = createSession({
			spec: buildSpec({ tools: { enabled: ['tiny/echo'] } }),
			registry: buildRegistry(),
			provider: {
				id: 'spy',
				name: 'Spy',
				keyRequirement: 'none',
				validateKey: () => Promise.resolve({ ok: true, message: '' }),
				chat: (request) => {
					for (const tool of request.tools ?? []) names.push(tool.name);
					return Promise.resolve({
						text: 'ok',
						toolCall: null,
						usage: { inputTokens: 1, outputTokens: 1 },
						raw: {},
						finishReason: 'stop' as const
					});
				}
			},
			guardrails: [],
			options: { now: clock.now, newId: clock.newId, random: clock.random }
		});
		await session.step();

		expect(names).toContain('echo');
		expect(names).toContain('ping');
		expect(names.some((name) => name.includes('/'))).toBe(false);
	});

	it('withholds a notebook tool when there is no notebook', async () => {
		const { session, seen } = makeSession({
			spec: buildSpec({
				tools: { enabled: ['tiny/secret'] },
				memory: { windowSize: 3, notebook: false }
			}),
			script: [turn('Secret time.', 'secret')]
		});
		await session.step();
		// Not offered, so the call falls through to the world, which refuses it.
		expect(seen).not.toContain('tool.executed');
		expect(seen).toContain('action.performed');
	});

	it('offers a notebook tool once the notebook is switched on', async () => {
		const { session, seen } = makeSession({
			spec: buildSpec({
				tools: { enabled: ['tiny/secret'] },
				memory: { windowSize: 3, notebook: true }
			}),
			script: [turn('Secret time.', 'secret')]
		});
		await session.step();
		expect(seen).toContain('tool.executed');
	});

	it('skips tool ids that are not installed', async () => {
		const { session, seen } = makeSession({
			spec: buildSpec({ tools: { enabled: ['tiny/nonexistent'] } }),
			script: [turn('Ping.', 'ping')]
		});
		await session.step();
		expect(seen).toContain('action.performed');
	});
});

describe('memory', () => {
	it('remembers each tick when the brick is fitted', async () => {
		const { session, seen } = makeSession({
			spec: buildSpec({ memory: { windowSize: 3, notebook: false } }),
			script: [turn('Ping.', 'ping')]
		});
		await session.step();
		expect(seen).toContain('memory.updated');
	});

	it('remembers nothing without the brick', async () => {
		const { session, seen } = makeSession({ script: [turn('Ping.', 'ping')] });
		await session.step();
		expect(seen).not.toContain('memory.updated');
	});
});

/**
 * E3 (`14-…` §3), the fix for `12-…` C2. The bot that cannot see its own
 * failures repeats them; before this, a world refusal reached the Memory
 * brick's window and nowhere else, so the very first bot anyone builds — no
 * Memory — was structurally incapable of learning from a failed action.
 */
describe('learning from a failed action', () => {
	function promptsFrom(session: ReturnType<typeof makeSession>['session']): string[] {
		const prompts: string[] = [];
		session.events.on('prompt.composed', (event) => {
			prompts.push(event.payload.messages.at(-1)?.content ?? '');
		});
		return prompts;
	}

	it('tells the bot next tick, with no Memory brick fitted', async () => {
		const { session } = makeSession({
			spec: buildSpec({ actions: { enabled: ['ping', 'win', 'flop'] } }),
			script: [turn('I shall flop.', 'flop'), turn('Ping instead.', 'ping')],
			budgets: { maxTicks: 2 }
		});
		const prompts = promptsFrom(session);

		await session.step();
		await session.step();

		expect(prompts[0]).not.toContain('you flop');
		expect(prompts[1]).toContain('you flop, and nothing happens');
	});

	it('keeps the prompt to two messages while doing it', async () => {
		const { session } = makeSession({
			spec: buildSpec({ actions: { enabled: ['ping', 'win', 'flop'] } }),
			script: [turn('I shall flop.', 'flop'), turn('Ping instead.', 'ping')],
			budgets: { maxTicks: 2 }
		});
		const lengths: number[] = [];
		session.events.on('prompt.composed', (event) => lengths.push(event.payload.messages.length));

		await session.step();
		await session.step();

		// The failure rides in the "Right now:" section of the user message
		// rather than adding a turn — a memory-less bot's prompt stays system +
		// user, exactly as 02-AGENT-MODEL.md §8 describes it.
		expect(lengths).toEqual([2, 2]);
	});

	it('also promotes the refusal for an action the bot was never built with', async () => {
		const { session } = makeSession({
			// `flop` exists in the world but is not fitted, so the engine refuses
			// it before the world ever sees it.
			script: [turn('I shall flop.', 'flop'), turn('Ping instead.', 'ping')],
			budgets: { maxTicks: 2 }
		});
		const prompts = promptsFrom(session);

		await session.step();
		await session.step();

		expect(prompts[1]).toContain('you have not been built with any way to do it');
	});

	it('says nothing extra when the action succeeded', async () => {
		const { session } = makeSession({
			script: [turn('Ping.', 'ping'), turn('Ping again.', 'ping')],
			budgets: { maxTicks: 2 }
		});
		const prompts = promptsFrom(session);

		await session.step();
		await session.step();

		// Nothing is prepended to the observation: the second prompt is the
		// bare "Right now:" section, with the ping count moved on by one.
		expect(prompts[0]).toBe('Right now:\npings: 0');
		expect(prompts[1]).toBe('Right now:\npings: 1');
	});
});

/**
 * **WP30 stage B**: `TickRecord.call`/`.ok`, the door a brick's own
 * `onTickEnd` needs to tell *what was attempted* and *whether it worked*
 * apart from narration text — neither existed until the Planner brick needed
 * to know both. Proven against a real session rather than only against
 * `TickMemory`'s own type, because what actually matters is that `tick()`
 * populates both fields correctly for every shape of outcome, not merely
 * that the type permits them.
 */
describe('what onTickEnd learns about the call (WP30 stage B)', () => {
	function specWithWatcher(records: unknown[], overrides: Partial<AgentSpec['bricks']> = {}) {
		const migrated = migrateAgentSpec(buildSpec(overrides));
		if ('kind' in migrated) throw new Error(migrated.message);
		migrated.bricks.push({
			slot: 'memory',
			kind: 'test/watcher',
			configVersion: 1,
			config: {}
		});
		return migrated;
	}

	function registryWithWatcher(records: unknown[]): PackRegistry {
		const registry = buildRegistry();
		registry.registerPack({
			id: 'watcher-pack',
			name: 'Watcher pack',
			version: '1.0.0',
			requiresCore: '>=0.0.1',
			brickKinds: [
				{
					id: 'test/watcher',
					slot: 'memory',
					name: 'Watcher',
					description: 'test/watcher',
					realName: 'test/watcher',
					realExplanation: 'test/watcher',
					configSchema: z.object({}),
					configVersion: 1,
					defaults: {},
					createRuntime: () => ({
						onTickEnd: (record) => records.push(record)
					})
				} as BrickKindDefinition
			]
		});
		return registry;
	}

	it('records a successful action, ok true, refused undefined', async () => {
		const records: unknown[] = [];
		const session = createSession({
			spec: specWithWatcher(records, { actions: { enabled: ['ping', 'win', 'flop'] } }),
			registry: registryWithWatcher(records),
			provider: createMockProvider({ script: [turn('Ping.', 'ping')] }),
			guardrails: [],
			options: { now: () => '2026-08-20T00:00:00Z', newId: () => 'id', random: () => 0 }
		});
		await session.step();

		expect(records).toEqual([
			expect.objectContaining({
				call: { kind: 'action', name: 'ping', arguments: {} },
				ok: true
			})
		]);
	});

	it('records a failed action, ok false, still no refusal — it ran, it just did not work', async () => {
		const records: unknown[] = [];
		const session = createSession({
			spec: specWithWatcher(records, { actions: { enabled: ['ping', 'win', 'flop'] } }),
			registry: registryWithWatcher(records),
			provider: createMockProvider({ script: [turn('Flop.', 'flop')] }),
			guardrails: [],
			options: { now: () => '2026-08-20T00:00:00Z', newId: () => 'id', random: () => 0 }
		});
		await session.step();

		expect(records).toEqual([
			expect.objectContaining({
				call: { kind: 'action', name: 'flop', arguments: {} },
				ok: false
			})
		]);
		expect((records[0] as { refused?: string }).refused).toBeUndefined();
	});

	it('records a successful tool call, ok true', async () => {
		const records: unknown[] = [];
		const session = createSession({
			spec: specWithWatcher(records, { tools: { enabled: ['tiny/echo'] } }),
			registry: registryWithWatcher(records),
			provider: createMockProvider({ script: [turn('Echo.', 'echo', { word: 'hi' })] }),
			guardrails: [],
			options: { now: () => '2026-08-20T00:00:00Z', newId: () => 'id', random: () => 0 }
		});
		await session.step();

		expect(records).toEqual([
			expect.objectContaining({
				call: { kind: 'tool', name: 'echo', arguments: { word: 'hi' } },
				ok: true
			})
		]);
	});

	/**
	 * "Not built with this" is still a real, world-facing attempt in this
	 * engine's own model — `action.performed` fires with `ok: false`, the same
	 * as any other failed action — not a `refused` (that word is reserved for
	 * a guardrail or a person stopping the call *before* it reaches the world).
	 */
	it('records ok false, not refused, for an action the bot was never built with', async () => {
		const records: unknown[] = [];
		const session = createSession({
			// `flop` is a real world action, but not fitted.
			spec: specWithWatcher(records, { actions: { enabled: ['ping', 'win'] } }),
			registry: registryWithWatcher(records),
			provider: createMockProvider({ script: [turn('Flop.', 'flop')] }),
			guardrails: [],
			options: { now: () => '2026-08-20T00:00:00Z', newId: () => 'id', random: () => 0 }
		});
		await session.step();

		expect((records[0] as { ok?: boolean }).ok).toBe(false);
		expect((records[0] as { refused?: string }).refused).toBeUndefined();
	});

	it('leaves ok undefined for a call a guardrail refused — never attempted, not a failure', async () => {
		const records: unknown[] = [];
		const blockPing: Guardrail = {
			id: 'test/no-ping',
			name: 'No Ping',
			description: 'Blocks pinging, but lets the run go on.',
			hooks: ['pre-act'],
			check: (ctx) =>
				ctx.proposed?.name === 'ping'
					? { allow: false, reason: 'pinging is banned', disposition: 'block-action' }
					: { allow: true }
		};
		const session = createSession({
			spec: specWithWatcher(records, { actions: { enabled: ['ping', 'win'] } }),
			registry: registryWithWatcher(records),
			provider: createMockProvider({ script: [turn('Ping.', 'ping')] }),
			guardrails: [blockPing],
			options: { now: () => '2026-08-20T00:00:00Z', newId: () => 'id', random: () => 0 }
		});
		await session.step();

		expect((records[0] as { ok?: boolean }).ok).toBeUndefined();
		expect((records[0] as { refused?: string }).refused).toBeDefined();
	});
});

/**
 * **WP30 stage C**: `contributeState`/`brick.state` — the door a
 * pack-contributed brick uses to put its own structured state on the trace,
 * since core has no privileged view into a brick it did not write (unlike
 * `memory.updated`, which core emits directly because Memory is its own
 * concept). Proven against a real session, the same reasoning as stage B's
 * own tests above: what matters is that `tick()` actually emits the event
 * for a fitted brick that implements the hook, and never for one that
 * doesn't, not merely that the type permits it.
 */
describe('brick.state — a fitted brick reporting its own live state (WP30 stage C)', () => {
	function registryWithReporter(state: unknown): PackRegistry {
		const registry = buildRegistry();
		registry.registerPack({
			id: 'reporter-pack',
			name: 'Reporter pack',
			version: '1.0.0',
			requiresCore: '>=0.0.1',
			brickKinds: [
				{
					id: 'test/reporter',
					slot: 'planner',
					name: 'Reporter',
					description: 'test/reporter',
					realName: 'test/reporter',
					realExplanation: 'test/reporter',
					configSchema: z.object({}),
					configVersion: 1,
					defaults: {},
					createRuntime: () => ({ contributeState: () => state })
				} as BrickKindDefinition
			]
		});
		return registry;
	}

	function specWithReporter(overrides: Partial<AgentSpec['bricks']> = {}) {
		const migrated = migrateAgentSpec(buildSpec(overrides));
		if ('kind' in migrated) throw new Error(migrated.message);
		migrated.bricks.push({ slot: 'planner', kind: 'test/reporter', configVersion: 1, config: {} });
		return migrated;
	}

	it('emits brick.state, tagged with the fitted slot and kind, carrying whatever the brick reported', async () => {
		const events: EngineEvent[] = [];
		const session = createSession({
			spec: specWithReporter(),
			registry: registryWithReporter({ steps: ['Find the key'], done: [false] }),
			provider: createMockProvider({ script: [turn('Ping.', 'ping')] }),
			guardrails: [],
			options: { now: () => '2026-08-20T00:00:00Z', newId: () => 'id', random: () => 0 }
		});
		session.events.onAny((event) => events.push(event));
		await session.step();

		const reported = events.find((event) => event.type === 'brick.state');
		expect(reported).toMatchObject({
			type: 'brick.state',
			payload: {
				slot: 'planner',
				kind: 'test/reporter',
				state: { steps: ['Find the key'], done: [false] }
			}
		});
	});

	it('emits nothing when the brick has nothing new to report this tick', async () => {
		const events: EngineEvent[] = [];
		const session = createSession({
			spec: specWithReporter(),
			registry: registryWithReporter(undefined),
			provider: createMockProvider({ script: [turn('Ping.', 'ping')] }),
			guardrails: [],
			options: { now: () => '2026-08-20T00:00:00Z', newId: () => 'id', random: () => 0 }
		});
		session.events.onAny((event) => events.push(event));
		await session.step();

		expect(events.some((event) => event.type === 'brick.state')).toBe(false);
	});

	it('emits nothing at all when no fitted brick implements the hook', async () => {
		const { session } = makeSession({ script: [turn('Ping.', 'ping')] });
		const events: EngineEvent[] = [];
		session.events.onAny((event) => events.push(event));
		await session.step();

		expect(events.some((event) => event.type === 'brick.state')).toBe(false);
	});
});

/**
 * **WP30's If/Then sizing, stage A**: `contributeReflex`/`resolveReflex` —
 * the door a fitted brick uses to propose a call *before* the brain is ever
 * asked, and the loop's own branch that skips COMPOSE/THINK/DECIDE when one
 * fires. Proven against a real session, the same reasoning as every other
 * stage-A mechanism proof this WP has used: what matters is that `tick()`
 * genuinely takes the shortcut — no prompt composed, no model called, no
 * tokens spent — and that doing so never becomes a way around the guardrail
 * chain, which is the one property a reflex brick must never be able to
 * break.
 */
describe('reflex — a fitted brick proposing a call before the brain (WP30 stage A)', () => {
	function registryWithReflex(
		proposal:
			{ kind: 'tool' | 'action'; name: string; arguments: unknown; thought: string } | undefined
	): PackRegistry {
		const registry = buildRegistry();
		registry.registerPack({
			id: 'reflex-pack',
			name: 'Reflex pack',
			version: '1.0.0',
			requiresCore: '>=0.0.1',
			brickKinds: [
				{
					id: 'test/if-then',
					slot: 'mobility',
					name: 'test/if-then',
					description: 'test/if-then',
					realName: 'test/if-then',
					realExplanation: 'test/if-then',
					configSchema: z.object({}),
					configVersion: 1,
					defaults: {},
					createRuntime: () => ({ contributeReflex: () => proposal })
				} as BrickKindDefinition
			]
		});
		return registry;
	}

	function specWithReflex(overrides: Partial<AgentSpec['bricks']> = {}) {
		const migrated = migrateAgentSpec(buildSpec(overrides));
		if ('kind' in migrated) throw new Error(migrated.message);
		migrated.bricks.push({
			slot: 'mobility',
			kind: 'test/if-then',
			configVersion: 1,
			config: {}
		});
		return migrated;
	}

	const PING_PROPOSAL = {
		kind: 'action' as const,
		name: 'ping',
		arguments: {},
		thought: 'Rule fired: ping.'
	};

	it('skips COMPOSE/THINK/DECIDE entirely — no prompt.composed, no think.* events', async () => {
		const events: EngineEvent[] = [];
		const session = createSession({
			spec: specWithReflex(),
			registry: registryWithReflex(PING_PROPOSAL),
			// The mock brain would throw on a real request; an empty script is
			// the point — the brain must never be asked.
			provider: createMockProvider({ script: [] }),
			guardrails: [],
			options: { now: () => '2026-08-20T00:00:00Z', newId: () => 'id', random: () => 0 }
		});
		session.events.onAny((event) => events.push(event));
		await session.step();

		expect(events.some((event) => event.type === 'prompt.composed')).toBe(false);
		expect(events.some((event) => event.type === 'think.started')).toBe(false);
		expect(events.some((event) => event.type === 'think.completed')).toBe(false);
	});

	it('the decision event names the reflex as its source, carrying the call and thought it proposed', async () => {
		const events: EngineEvent[] = [];
		const session = createSession({
			spec: specWithReflex(),
			registry: registryWithReflex(PING_PROPOSAL),
			provider: createMockProvider({ script: [] }),
			guardrails: [],
			options: { now: () => '2026-08-20T00:00:00Z', newId: () => 'id', random: () => 0 }
		});
		session.events.onAny((event) => events.push(event));
		await session.step();

		const decisionEvent = events.find((event) => event.type === 'decision');
		expect(decisionEvent).toMatchObject({
			type: 'decision',
			payload: {
				thought: 'Rule fired: ping.',
				call: { kind: 'action', name: 'ping', arguments: {} },
				source: 'reflex'
			}
		});
	});

	it('a brain-driven tick still names its own source, for the trace to tell the two apart', async () => {
		const { session } = makeSession({ script: [turn('Ping.', 'ping')] });
		const events: EngineEvent[] = [];
		session.events.onAny((event) => events.push(event));
		await session.step();

		const decisionEvent = events.find((event) => event.type === 'decision');
		expect(decisionEvent).toMatchObject({ type: 'decision', payload: { source: 'brain' } });
	});

	it('still runs pre-think guardrails — a stop-run rule stops a reflex tick exactly as it would a brain-driven one', async () => {
		const stopper: Guardrail = {
			id: 'test/stop-everything',
			name: 'Stop',
			description: 'Stops everything, always.',
			hooks: ['pre-think'],
			check: () => ({ allow: false, reason: 'Not today.', disposition: 'stop-run' })
		};
		const session = createSession({
			spec: specWithReflex(),
			registry: registryWithReflex(PING_PROPOSAL),
			provider: createMockProvider({ script: [] }),
			guardrails: [stopper],
			options: { now: () => '2026-08-20T00:00:00Z', newId: () => 'id', random: () => 0 }
		});
		const result = await session.step();

		expect(result.outcome).toBe('STOPPED_BY_GUARDRAIL');
	});

	it('still runs pre-act guardrails — a blocklist refuses a reflex-proposed action, and the run carries on', async () => {
		const blocker: Guardrail = {
			id: 'test/no-ping',
			name: 'No Ping',
			description: 'Blocks pinging.',
			hooks: ['pre-act'],
			check: (ctx) =>
				ctx.proposed?.name === 'ping'
					? { allow: false, reason: 'pinging is banned', disposition: 'block-action' }
					: { allow: true }
		};
		const session = createSession({
			spec: specWithReflex(),
			registry: registryWithReflex(PING_PROPOSAL),
			provider: createMockProvider({ script: [] }),
			guardrails: [blocker],
			options: { now: () => '2026-08-20T00:00:00Z', newId: () => 'id', random: () => 0 }
		});
		const result = await session.step();

		expect(result.outcome).toBeUndefined();
	});

	it('fires even with the token budget already exhausted — a reflex spends none', async () => {
		const session = createSession({
			spec: specWithReflex(),
			registry: registryWithReflex(PING_PROPOSAL),
			provider: createMockProvider({ script: [] }),
			guardrails: [],
			options: {
				now: () => '2026-08-20T00:00:00Z',
				newId: () => 'id',
				random: () => 0,
				budgets: { maxTokens: 0 }
			}
		});
		const result = await session.step();

		expect(result.outcome).toBeUndefined();
	});

	it('does nothing different when nothing proposes a reflex — the existing loop is untouched', async () => {
		const session = createSession({
			spec: specWithReflex(),
			registry: registryWithReflex(undefined),
			provider: createMockProvider({ script: [turn('Ping.', 'ping')] }),
			guardrails: [],
			options: { now: () => '2026-08-20T00:00:00Z', newId: () => 'id', random: () => 0 }
		});
		const events: EngineEvent[] = [];
		session.events.onAny((event) => events.push(event));
		await session.step();

		expect(events.some((event) => event.type === 'prompt.composed')).toBe(true);
		const decisionEvent = events.find((event) => event.type === 'decision');
		expect(decisionEvent).toMatchObject({ type: 'decision', payload: { source: 'brain' } });
	});
});

describe('budgets', () => {
	it('ends the run when the token budget is spent', async () => {
		const { session } = makeSession({
			script: () => turn('Ping.', 'ping'),
			budgets: { maxTokens: 1, maxTicks: 50 }
		});
		// The first tick spends tokens; the second finds the budget gone.
		await session.step();
		const second = await session.step();
		expect(second.outcome).toBe('OUT_OF_STEPS');
	});

	it('aborts an in-flight request when the timeout elapses', async () => {
		vi.useFakeTimers();
		try {
			const clock = createTestClock();
			const session = createSession({
				spec: buildSpec(),
				registry: buildRegistry(),
				provider: {
					id: 'slow',
					name: 'Slow brain',
					keyRequirement: 'none',
					validateKey: () => Promise.resolve({ ok: true, message: '' }),
					chat: (_request, opts) =>
						new Promise((_resolve, reject) => {
							opts.signal.addEventListener('abort', () => reject(new Error('aborted by timeout')));
						})
				},
				guardrails: [],
				options: {
					now: clock.now,
					newId: clock.newId,
					random: clock.random,
					budgets: { requestTimeoutMs: 100 }
				}
			});

			const pending = session.step();
			await vi.advanceTimersByTimeAsync(200);
			expect((await pending).outcome).toBe('ERROR');
		} finally {
			vi.useRealTimers();
		}
	});
});

/**
 * **Session I/O** (E2, `14-…` §3, closing `12-…` D2).
 *
 * Two holes in the session's surface: nothing could speak to the bot, and
 * nothing could declare a run finished when the world had no opinion.
 */
describe('talking to the bot', () => {
	it('passes the message to the world and records that it was heard', async () => {
		const { session, seen, log } = makeSession({ script: () => turn('Ping.', 'ping') });
		session.start('step');
		session.deliverInput('Teddy says hello');

		expect(seen).toContain('input.delivered');
		const delivered = log.find((event) => event.type === 'input.delivered');
		expect(delivered?.payload).toMatchObject({ text: 'Teddy says hello', heard: true });
	});

	it('says so when the world has no ears', async () => {
		// The tiny world defines no `receiveInput`, so the message goes nowhere —
		// and the trace says that plainly rather than implying it landed.
		const { session, log } = makeSession({
			spec: buildSpec({}, 'tiny/deaf-goal'),
			script: () => turn('Ping.', 'ping')
		});
		session.start('step');
		session.deliverInput('anyone there?');

		const delivered = log.find((event) => event.type === 'input.delivered');
		expect(delivered?.payload).toMatchObject({ heard: false });
	});

	it('ignores a message once the run has finished', async () => {
		const { session, seen } = makeSession({ script: [turn('Win!', 'win')] });
		await session.step();
		session.deliverInput('too late');
		expect(seen).not.toContain('input.delivered');
	});
});

describe('declaring the outcome from outside', () => {
	it('ends an idle or paused run, and records why', async () => {
		const { session, log } = makeSession({
			script: () => turn('Ping.', 'ping'),
			budgets: { maxTicks: 9 }
		});
		session.start('step');
		await session.step();

		session.declareOutcome('SUCCESS', 'the player said it was finished');

		expect(session.status).toBe('finished');
		const finished = log.find((event) => event.type === 'run.finished');
		expect(finished?.payload).toMatchObject({
			outcome: 'SUCCESS',
			reason: 'the player said it was finished'
		});
	});

	it('waits for a tick in flight rather than abandoning it half-done', async () => {
		const { session, seen } = makeSession({
			script: () => turn('Ping.', 'ping'),
			budgets: { maxTicks: 9 }
		});
		session.start('play');
		session.events.on('action.performed', () => session.declareOutcome('SUCCESS', 'done'));

		// Let the play loop run a tick and settle.
		await vi.waitFor(() => expect(session.status).toBe('finished'));

		// The action completed and was remembered before the run ended.
		expect(seen.indexOf('action.performed')).toBeLessThan(seen.indexOf('run.finished'));
	});

	it('is ignored once the run has already ended', async () => {
		const { session, log } = makeSession({ script: [turn('Win!', 'win')] });
		await session.step();
		session.declareOutcome('ERROR', 'nope');
		expect(log.filter((event) => event.type === 'run.finished')).toHaveLength(1);
	});
});

/**
 * **Bounded retry** (E11, `14-…` §3, closing part of `12-…` D10).
 *
 * `retryAfterMs` was parsed off the wire and then ignored, so "try again in two
 * seconds" ended the run outright.
 */
describe('a provider that asks us to wait', () => {
	class RateLimited extends Error {
		readonly kind = 'rate-limited';
		constructor(readonly retryAfterMs?: number) {
			super('slow down');
		}
	}

	/** Fails the first call with the given error, then behaves. */
	function flakyProvider(error: unknown) {
		let calls = 0;
		return {
			id: 'flaky',
			name: 'Flaky brain',
			keyRequirement: 'none' as const,
			validateKey: () => Promise.resolve({ ok: true, message: 'fine' }),
			chat: () => {
				calls += 1;
				if (calls === 1) return Promise.reject(error);
				return Promise.resolve({
					text: 'Ping.',
					toolCall: { name: 'ping', arguments: {} },
					usage: { inputTokens: 10, outputTokens: 2 },
					raw: {},
					finishReason: 'tool_call' as const
				});
			},
			get calls() {
				return calls;
			}
		};
	}

	function sessionWith(provider: ReturnType<typeof flakyProvider>) {
		const clock = createTestClock();
		const session = createSession({
			spec: buildSpec(),
			registry: buildRegistry(),
			provider,
			guardrails: [],
			options: {
				now: clock.now,
				newId: clock.newId,
				random: clock.random,
				budgets: { maxTicks: 2 }
			}
		});
		const log: EngineEvent[] = [];
		session.events.onAny((event) => log.push(event));
		return { session, log };
	}

	it('waits and asks again, and says so in the trace', async () => {
		const provider = flakyProvider(new RateLimited(5));
		const { session, log } = sessionWith(provider);

		const result = await session.step();

		expect(provider.calls).toBe(2);
		expect(result.outcome).toBeUndefined();
		const retried = log.find((event) => event.type === 'provider.retried');
		expect(retried?.payload).toMatchObject({ kind: 'rate-limited', afterMs: 5, attempt: 1 });
	});

	it('clamps a provider asking for an unreasonable wait', async () => {
		// A server is entitled to say "in an hour"; a child watching a toy is not
		// entitled to be made to wait for it. Fake timers so the test does not
		// sit through even the clamped wait.
		vi.useFakeTimers();
		try {
			const provider = flakyProvider(new RateLimited(3_600_000));
			const { session, log } = sessionWith(provider);

			const pending = session.step();
			await vi.advanceTimersByTimeAsync(5_000);
			await pending;

			const retried = log.find((event) => event.type === 'provider.retried');
			expect((retried?.payload as { afterMs: number }).afterMs).toBe(5_000);
			expect(provider.calls).toBe(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it('retries once and no more — a second failure is a real failure', async () => {
		let calls = 0;
		const clock = createTestClock();
		const session = createSession({
			spec: buildSpec(),
			registry: buildRegistry(),
			provider: {
				id: 'always-limited',
				name: 'Always limited',
				keyRequirement: 'none' as const,
				validateKey: () => Promise.resolve({ ok: true, message: 'fine' }),
				chat: () => {
					calls += 1;
					return Promise.reject(new RateLimited(0));
				}
			},
			guardrails: [],
			options: { now: clock.now, newId: clock.newId, random: clock.random }
		});

		expect((await session.step()).outcome).toBe('ERROR');
		expect(calls).toBe(2);
	});

	it('does not retry a failure that waiting cannot fix', async () => {
		class BadKey extends Error {
			readonly kind = 'bad-key';
		}
		let calls = 0;
		const clock = createTestClock();
		const session = createSession({
			spec: buildSpec(),
			registry: buildRegistry(),
			provider: {
				id: 'wrong-key',
				name: 'Wrong key',
				keyRequirement: 'none' as const,
				validateKey: () => Promise.resolve({ ok: false, message: 'no' }),
				chat: () => {
					calls += 1;
					return Promise.reject(new BadKey('nope'));
				}
			},
			guardrails: [],
			options: { now: clock.now, newId: clock.newId, random: clock.random }
		});

		expect((await session.step()).outcome).toBe('ERROR');
		expect(calls).toBe(1);
	});
});

/**
 * **The post-act hook** (E1, `14-…` §3, closing `12-…` D1).
 *
 * The third hook is where outcome monitors live: rules that judge what
 * actually happened rather than what was proposed. Its verdict used to be
 * computed and discarded, so a rule could fire, be traced, and change nothing.
 */
describe('post-act verdicts', () => {
	function postAct(verdict: () => GuardrailVerdict): Guardrail {
		return {
			id: 'test/monitor',
			name: 'Monitor',
			description: 'Looks at what happened.',
			hooks: ['post-act'],
			check: verdict
		};
	}

	it('ends the run when a monitor says stop', async () => {
		const { session, seen } = makeSession({
			script: () => turn('Ping.', 'ping'),
			guardrails: [
				postAct(() => ({ allow: false, reason: 'I did not like that.', disposition: 'stop-run' }))
			],
			budgets: { maxTicks: 5 }
		});

		const result = await session.step();

		expect(result.outcome).toBe('STOPPED_BY_GUARDRAIL');
		expect(seen).toContain('action.performed'); // the action happened first
		expect(seen.at(-1)).toBe('run.finished');
	});

	it('lets the tick finish normally when the monitor is content', async () => {
		const { session } = makeSession({
			script: () => turn('Ping.', 'ping'),
			guardrails: [postAct(() => ({ allow: true }))],
			budgets: { maxTicks: 5 }
		});

		expect((await session.step()).outcome).toBeUndefined();
	});

	it('refuses a monitor that tries to block, and says why', async () => {
		const { session, seen } = makeSession({
			script: () => turn('Ping.', 'ping'),
			guardrails: [
				postAct(() => ({ allow: false, reason: 'Too late.', disposition: 'block-action' }))
			],
			budgets: { maxTicks: 5 }
		});

		let message = '';
		session.events.on('error', (event) => {
			message = (event.payload as { message: string }).message;
		});

		expect((await session.step()).outcome).toBe('ERROR');
		expect(message).toContain('post-act');
		expect(message).toContain('already happened');
		expect(seen).toContain('error');
	});

	it('refuses a monitor that tries to pause, for the same reason', async () => {
		const { session } = makeSession({
			script: () => turn('Ping.', 'ping'),
			guardrails: [postAct(() => ({ pause: true, reason: 'Hold on.' }))],
			budgets: { maxTicks: 5 }
		});

		let message = '';
		session.events.on('error', (event) => {
			message = (event.payload as { message: string }).message;
		});

		expect((await session.step()).outcome).toBe('ERROR');
		expect(message).toContain('pause');
	});
});

/**
 * **Brain brick charter** (`13-…` §4.1) — the two states nothing else pinned:
 * a brain with no cartridge in it, and a brain that spent its whole output
 * budget thinking and had nothing left to say with.
 */
describe('a brain that cannot answer', () => {
	it('runs a half-built brain rather than refusing to start', () => {
		// An empty cartridge slot is a normal state halfway through a build, and
		// `validateSpec` is what stops GO — the session must not also throw, or
		// the bench cannot hold a spec the user is still working on.
		expect(() =>
			makeSession({
				spec: buildSpec({
					llm: { cartridgeId: '', temperature: 0, maxTokens: 64, personality: '' }
				})
			})
		).not.toThrow();
	});

	it('re-prompts exactly once when the model runs out of room mid-thought', async () => {
		// C5's shape: a reasoning model spends its budget on hidden reasoning and
		// returns `length` with empty text. That is a mumble, so the one permitted
		// re-prompt applies — and it must be one, not a loop.
		const { session, seen } = makeSession({
			script: () => ({ text: '', toolCall: null, finishReason: 'length' }),
			budgets: { maxTicks: 1 }
		});

		await session.step();

		expect(seen.filter((type) => type === 'think.started')).toHaveLength(2);
		expect(seen.filter((type) => type === 'tick.started')).toHaveLength(1);
		expect(seen).not.toContain('action.performed');
	});

	it('still charges the run for both completions', async () => {
		// The tick achieved nothing; it was not free. A budget meter that hides
		// the cost of a starved model teaches the wrong thing about cost.
		const { session } = makeSession({
			script: () => ({
				text: '',
				toolCall: null,
				finishReason: 'length',
				usage: { inputTokens: 50, outputTokens: 64 }
			}),
			budgets: { maxTicks: 1 }
		});

		let finished: { usage: { inputTokens: number; outputTokens: number } } | undefined;
		session.events.on('run.finished', (event) => {
			finished = event.payload as typeof finished;
		});

		await session.step();

		expect(finished?.usage.outputTokens).toBe(128);
		expect(finished?.usage.inputTokens).toBeGreaterThanOrEqual(100);
	});
});

describe('provider failures', () => {
	/** A pack's typed error, as 06-LLM-PROVIDERS.md §7 defines it. */
	class FakeProviderError extends Error {
		readonly kind = 'bad-key';
	}

	function throwingProvider(error: unknown) {
		return {
			id: 'exploding',
			name: 'Exploding brain',
			keyRequirement: 'none' as const,
			validateKey: () => Promise.resolve({ ok: false, message: 'no' }),
			chat: () => Promise.reject(error)
		};
	}

	async function errorEventFor(error: unknown) {
		const clock = createTestClock();
		const session = createSession({
			spec: buildSpec(),
			registry: buildRegistry(),
			provider: throwingProvider(error),
			guardrails: [],
			options: { now: clock.now, newId: clock.newId, random: clock.random }
		});
		let payload: { message: string; kind?: string | undefined } | undefined;
		session.events.on('error', (event) => {
			payload = event.payload;
		});
		await session.step();
		return payload;
	}

	it('carries a provider error kind through to the trace', async () => {
		const payload = await errorEventFor(new FakeProviderError('This battery is not charged.'));
		expect(payload).toMatchObject({ kind: 'bad-key', message: 'This battery is not charged.' });
	});

	it('falls back to engine for a plain error', async () => {
		const payload = await errorEventFor(new Error('something broke'));
		expect(payload?.kind).toBe('engine');
	});

	it('falls back to engine when the kind is not a usable string', async () => {
		const weird = Object.assign(new Error('odd'), { kind: 42 });
		expect((await errorEventFor(weird))?.kind).toBe('engine');
		const blank = Object.assign(new Error('odd'), { kind: '' });
		expect((await errorEventFor(blank))?.kind).toBe('engine');
	});

	it('falls back to engine for something thrown that is not an Error at all', async () => {
		expect((await errorEventFor('just a string'))?.kind).toBe('engine');
	});
});

describe('pause', () => {
	it('marks a step-mode session paused', async () => {
		const { session } = makeSession({ script: () => turn('Ping.', 'ping') });
		session.start('step');
		await session.step();
		session.pause();
		expect(session.status).toBe('paused');
	});

	it('halts a play-mode run after the current tick', async () => {
		const clock = createTestClock();
		const session = createSession({
			spec: buildSpec(),
			registry: buildRegistry(),
			provider: createMockProvider({ script: () => turn('Ping.', 'ping') }),
			guardrails: [],
			options: { now: clock.now, newId: clock.newId, random: clock.random, tickDelayMs: 1 }
		});

		session.start('play');
		session.pause();
		await vi.waitFor(() => expect(session.status).toBe('paused'));
	});

	/**
	 * The seam behind the honest speed dial (`16-…` §1.6, `12-…` D15). The delay
	 * used to be captured when the session was built, so turning the dial
	 * mid-run changed nothing at all and the only honest alternative was to
	 * rebuild the session and lose the trace.
	 *
	 * That the *cadence* really changes is proved where it can be measured, in
	 * the workbench's e2e; what matters here is that the control exists, that it
	 * can be worked while a run is going without disturbing it, and that it
	 * refuses to accept a negative gap.
	 */
	it('takes a new tick delay while a run is in progress', async () => {
		const clock = createTestClock();
		const session = createSession({
			spec: buildSpec(),
			registry: buildRegistry(),
			provider: createMockProvider({ script: () => turn('Ping.', 'ping') }),
			guardrails: [],
			options: { now: clock.now, newId: clock.newId, random: clock.random, tickDelayMs: 1 }
		});

		session.start('play');
		session.setTickDelayMs(0);

		await vi.waitFor(() => expect(session.status).toBe('finished'));
	});

	it('clamps a negative delay to nothing rather than throwing', () => {
		const clock = createTestClock();
		const session = createSession({
			spec: buildSpec(),
			registry: buildRegistry(),
			provider: createMockProvider({ script: () => turn('Ping.', 'ping') }),
			guardrails: [],
			options: { now: clock.now, newId: clock.newId, random: clock.random }
		});

		// A viewing control should never be the thing that ends a run.
		expect(() => session.setTickDelayMs(-1000)).not.toThrow();
	});
});

/** WP39 stage B: the session's own runtime context resolves a registered service. */
it('lets a fitted brick resolve a guardrail service when the session builds it', async () => {
	const registry = buildRegistry();
	const service = stubService({ id: 'tiny/stub' });
	let resolved: string | undefined;
	registry.registerPack({
		id: 'tiny-guard',
		name: 'Tiny guard',
		version: '1.0.0',
		requiresCore: '>=0.0.1',
		guardrailServices: [service],
		brickKinds: [
			{
				id: 'tiny-guard/asks',
				slot: 'safety',
				name: 'Asks',
				description: 'Resolves a service.',
				realName: 'Asks',
				realExplanation: 'Resolves a service.',
				configSchema: z.object({}),
				configVersion: 1,
				defaults: {},
				createRuntime: (_config: unknown, ctx) => {
					resolved = ctx.getGuardrailService('tiny/stub')?.id;
					return {};
				}
			} as BrickKindDefinition
		]
	});
	const spec = toSpecV2(buildSpec());
	spec.bricks.push({ slot: 'safety', kind: 'tiny-guard/asks', configVersion: 1, config: {} });
	const session = createSession({
		spec,
		registry,
		provider: createMockProvider({ script: [turn('Ping.', 'ping')] }),
		guardrails: []
	});
	await session.step();
	expect(resolved).toBe('tiny/stub');
});

/** WP41 (`26-…` §6.6): the session hands out a guarded `fetch`; a call to an undeclared host is refused on the trace. */
describe('egress', () => {
	function callingProvider(url: string) {
		const calls: string[] = [];
		const provider = {
			id: 'caller',
			name: 'Caller',
			keyRequirement: 'none' as const,
			egress: [
				{ host: 'api.declared.test', purpose: 'LLM completions', sends: ['prompt' as const] }
			],
			validateKey: () => Promise.resolve({ ok: true, message: '' }),
			chat: async () => {
				calls.push(url);
				await fetchSeen(url);
				return { text: 'Ping.', toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 } };
			}
		};
		let fetchSeen: (url: string) => Promise<unknown> = () => Promise.resolve();
		return { provider, calls, useFetch: (f: typeof fetchSeen) => (fetchSeen = f) };
	}

	function sessionWith(egress: 'declared' | 'none' | undefined, url: string) {
		const registry = buildRegistry();
		const upstreamCalls: string[] = [];
		const upstream: typeof fetch = (input) => {
			upstreamCalls.push(String(input));
			return Promise.resolve(new Response('{}'));
		};
		const { provider, useFetch } = callingProvider(url);
		let guarded: typeof fetch | undefined;
		// A brick that keeps the session's fetch so the provider stub can use it.
		registry.registerPack({
			id: 'keeper',
			name: 'Keeper',
			version: '1.0.0',
			requiresCore: '>=0.0.1',
			brickKinds: [
				{
					id: 'keeper/keep',
					slot: 'safety',
					name: 'Keep',
					description: 'Keeps the fetch.',
					realName: 'Keep',
					realExplanation: 'Keeps the fetch.',
					configSchema: z.object({}),
					configVersion: 1,
					defaults: {},
					createRuntime: (_config: unknown, ctx) => {
						guarded = ctx.fetch;
						return {
							egress: [
								{ host: 'guard.declared.test', purpose: 'content screening', sends: ['decision'] }
							]
						};
					}
				} as BrickKindDefinition
			]
		});
		useFetch((target) => (guarded ?? upstream)(target));
		const spec = toSpecV2(buildSpec());
		spec.bricks.push({ slot: 'safety', kind: 'keeper/keep', configVersion: 1, config: {} });
		const session = createSession({
			spec,
			registry,
			provider: provider as unknown as Parameters<typeof createSession>[0]['provider'],
			guardrails: [],
			options: { fetch: upstream, ...(egress !== undefined ? { egress } : {}) }
		});
		const log: EngineEvent[] = [];
		session.events.onAny((event) => log.push(event));
		return { session, log, upstreamCalls };
	}

	it('allows a declared host, and records the mode and every declared host on run.started', async () => {
		const { session, log, upstreamCalls } = sessionWith('declared', 'https://api.declared.test/v1');
		await session.step();
		expect(upstreamCalls).toEqual(['https://api.declared.test/v1']);
		const started = log.find((e) => e.type === 'run.started');
		expect(started?.type === 'run.started' ? started.payload.egress : undefined).toEqual({
			mode: 'declared',
			hosts: ['api.declared.test', 'guard.declared.test']
		});
		expect(log.some((e) => e.type === 'error')).toBe(false);
	});

	it('refuses a planted undeclared host with an error event naming it, and no upstream call', async () => {
		const { session, log, upstreamCalls } = sessionWith(
			'declared',
			'https://evil.example.test/exfil'
		);
		await session.step();
		expect(upstreamCalls).toEqual([]);
		const error = log.find((e) => e.type === 'error');
		expect(error?.type === 'error' ? error.payload : undefined).toEqual({
			kind: 'egress-refused',
			message:
				'Refused a call to "evil.example.test": no fitted component declared it (egress: declared).'
		});
	});

	it('under none refuses even a declared host', async () => {
		const { session, log, upstreamCalls } = sessionWith('none', 'https://api.declared.test/v1');
		await session.step();
		expect(upstreamCalls).toEqual([]);
		// One `error` row — the guard's; the run's own terminal error is the same
		// refusal and is not written twice.
		expect(
			log.filter((e) => e.type === 'error').map((e) => (e.type === 'error' ? e.payload.kind : ''))
		).toEqual(['egress-refused']);
		const started = log.find((e) => e.type === 'run.started');
		expect(started?.type === 'run.started' ? started.payload.egress?.mode : undefined).toBe('none');
	});

	it('guards by default, but writes nothing on run.started until a host names a mode', async () => {
		const { session, log, upstreamCalls } = sessionWith(
			undefined,
			'https://evil.example.test/exfil'
		);
		await session.step();
		expect(upstreamCalls).toEqual([]);
		const started = log.find((e) => e.type === 'run.started');
		expect(started?.type === 'run.started' ? 'egress' in started.payload : undefined).toBe(false);
	});
});

describe('guardrails', () => {
	/** WP40 (`26-…` §6.13): a safety stack runs every brick's rules, in fitted order, at every hook, before the host's. */
	it('runs a stack of safety bricks in fitted order at each hook, brick rules before host rules', async () => {
		const registry = buildRegistry();
		const seen: string[] = [];
		const recorder = (id: string): Guardrail => ({
			id,
			name: id,
			description: `Notes when ${id} is asked.`,
			hooks: ['pre-think', 'pre-act', 'post-act'],
			check: (ctx) => {
				seen.push(`${ctx.hook} ${id}`);
				return Promise.resolve({ allow: true });
			}
		});
		registry.registerPack({
			id: 'stack',
			name: 'Stack',
			version: '1.0.0',
			requiresCore: '>=0.0.1',
			brickKinds: ['a', 'b', 'c'].map(
				(name) =>
					({
						id: `stack/${name}`,
						slot: 'safety',
						name,
						description: name,
						realName: name,
						realExplanation: name,
						configSchema: z.object({}),
						configVersion: 1,
						defaults: {},
						createRuntime: () => ({ contributeGuardrails: () => [recorder(`stack/${name}`)] })
					}) as BrickKindDefinition
			)
		});
		const spec = toSpecV2(buildSpec());
		for (const name of ['c', 'a', 'b']) {
			spec.bricks.push({ slot: 'safety', kind: `stack/${name}`, configVersion: 1, config: {} });
		}
		const session = createSession({
			spec,
			registry,
			provider: createMockProvider({ script: [turn('Ping.', 'ping')] }),
			guardrails: [recorder('host')]
		});
		await session.step();
		expect(seen).toEqual([
			'pre-think stack/c',
			'pre-think stack/a',
			'pre-think stack/b',
			'pre-think host',
			'pre-act stack/c',
			'pre-act stack/a',
			'pre-act stack/b',
			'pre-act host',
			'post-act stack/c',
			'post-act stack/a',
			'post-act stack/b',
			'post-act host'
		]);
	});

	/**
	 * WP39 stage A (`29-GUARD-SHELL.md` §4.2): what the tick has in hand
	 * reaches every hook — the observation from SENSE, the composed prompt
	 * from COMPOSE, the brain's answer from THINK — and nothing arrives
	 * before it exists.
	 */
	it('hands each hook the observation, the prompt and the response the tick has so far', async () => {
		const seen: Array<{
			hook: GuardrailHook;
			observation: boolean;
			messages: number | undefined;
			response: string | undefined;
		}> = [];
		const recorder: Guardrail = {
			id: 'test/recorder',
			name: 'Recorder',
			description: 'Notes what each hook is handed.',
			hooks: ['pre-think', 'pre-act', 'post-act'],
			check: (ctx) => {
				seen.push({
					hook: ctx.hook,
					observation: ctx.observation !== undefined && ctx.observation.text.length > 0,
					messages: ctx.messages?.length,
					response: ctx.response?.text
				});
				return Promise.resolve({ allow: true });
			}
		};
		const { session } = makeSession({
			script: [turn('Ping.', 'ping')],
			guardrails: [recorder]
		});
		await session.step();

		expect(seen.map((s) => s.hook)).toEqual(['pre-think', 'pre-act', 'post-act']);
		for (const entry of seen) expect(entry.observation).toBe(true);
		expect(seen[0]?.messages).toBeGreaterThan(0);
		expect(seen[0]?.response).toBeUndefined();
		expect(seen[1]?.response).toBe('Ping.');
		expect(seen[2]?.response).toBe('Ping.');
		expect(seen[2]?.messages).toBe(seen[0]?.messages);
	});

	const stopEverything: Guardrail = {
		id: 'test/stop',
		name: 'Stop',
		description: 'Stops the run before thinking.',
		hooks: ['pre-think'],
		check: () => ({ allow: false, reason: 'not today', disposition: 'stop-run' })
	};

	const blockPing: Guardrail = {
		id: 'test/no-ping',
		name: 'No Ping',
		description: 'Blocks pinging, but lets the run go on.',
		hooks: ['pre-act'],
		check: (ctx) =>
			ctx.proposed?.name === 'ping'
				? { allow: false, reason: 'pinging is banned', disposition: 'block-action' }
				: { allow: true }
	};

	it('stops the run on a pre-think stop-run verdict', async () => {
		const { session, seen } = makeSession({
			script: [turn('Ping.', 'ping')],
			guardrails: [stopEverything]
		});
		const result = await session.step();

		expect(result.outcome).toBe('STOPPED_BY_GUARDRAIL');
		expect(seen).toContain('guardrail.tripped');
		expect(seen).not.toContain('think.started');
	});

	/**
	 * A policy card's own field (`14-…` §4.6, WP22): `compilePolicyCard`
	 * (`@craftabot/governance`) sets `policyCardId` on the guardrails it
	 * produces, and the engine copies it onto both events, unconditionally —
	 * core has no reason to know what a policy card is, only to relay a field
	 * a guardrail chose to carry.
	 */
	it('copies a guardrail’s policyCardId onto both guardrail events, when it has one', async () => {
		const stopFromACard: Guardrail = { ...stopEverything, policyCardId: 'test/policy/stop-early' };
		const { session, log } = makeSession({
			script: [turn('Ping.', 'ping')],
			guardrails: [stopFromACard]
		});
		await session.step();

		const checked = log.find((event) => event.type === 'guardrail.checked');
		const tripped = log.find((event) => event.type === 'guardrail.tripped');
		expect(checked?.type === 'guardrail.checked' ? checked.payload.policyCardId : undefined).toBe(
			'test/policy/stop-early'
		);
		expect(tripped?.type === 'guardrail.tripped' ? tripped.payload.policyCardId : undefined).toBe(
			'test/policy/stop-early'
		);
	});

	it('leaves policyCardId off both events for a hand-written guardrail with no card behind it', async () => {
		const { session, log } = makeSession({
			script: [turn('Ping.', 'ping')],
			guardrails: [stopEverything]
		});
		await session.step();

		const checked = log.find((event) => event.type === 'guardrail.checked');
		const tripped = log.find((event) => event.type === 'guardrail.tripped');
		expect(
			checked?.type === 'guardrail.checked' ? 'policyCardId' in checked.payload : undefined
		).toBe(false);
		expect(
			tripped?.type === 'guardrail.tripped' ? 'policyCardId' in tripped.payload : undefined
		).toBe(false);
	});

	/**
	 * `guardrail.external` (`25-…` §4.7, WP35 stage B): a hosted guardrail's
	 * own network call, emitted immediately before the `guardrail.checked` it
	 * produced — never by the guardrail itself.
	 */
	describe('checkWithRecord and guardrail.external', () => {
		const EXTERNAL_RECORD = {
			service: 'model-armor' as const,
			endpoint: 'https://modelarmor.europe-west2.rep.googleapis.com/v1/…:sanitizeUserPrompt',
			template: 'cab-armour',
			latencyMs: 37,
			charsScreened: 42,
			outcome: 'ok' as const
		};

		const hostedAllow: Guardrail = {
			id: 'test/hosted',
			name: 'Hosted',
			description: 'A hosted guardrail that reports its own call.',
			hooks: ['pre-think'],
			check: () => ({ allow: true }),
			checkWithRecord: () =>
				Promise.resolve({ verdict: { allow: true }, external: EXTERNAL_RECORD })
		};

		it('emits guardrail.external immediately before guardrail.checked', async () => {
			const { session, log } = makeSession({
				script: [turn('Ping.', 'ping')],
				guardrails: [hostedAllow]
			});
			await session.step();

			const types = log.map((event) => event.type);
			const externalIndex = types.indexOf('guardrail.external');
			const checkedIndex = types.indexOf('guardrail.checked');
			expect(externalIndex).toBeGreaterThanOrEqual(0);
			expect(checkedIndex).toBe(externalIndex + 1);
		});

		it("carries the guardrailId, hook and the record's own fields onto the event", async () => {
			const { session, log } = makeSession({
				script: [turn('Ping.', 'ping')],
				guardrails: [hostedAllow]
			});
			await session.step();

			const external = log.find((event) => event.type === 'guardrail.external');
			expect(external?.type === 'guardrail.external' ? external.payload : undefined).toEqual({
				guardrailId: 'test/hosted',
				hook: 'pre-think',
				...EXTERNAL_RECORD
			});
		});

		it('never emits guardrail.external for a check()-only guardrail', async () => {
			const { session, seen } = makeSession({
				script: [turn('Ping.', 'ping')],
				guardrails: [stopEverything]
			});
			await session.step();

			expect(seen).not.toContain('guardrail.external');
		});

		it('a hosted guardrail can still stop the run, with the record on the trace before the stop', async () => {
			const hostedStop: Guardrail = {
				...hostedAllow,
				id: 'test/hosted-stop',
				checkWithRecord: () =>
					Promise.resolve({
						verdict: { allow: false, reason: 'guard says no', disposition: 'stop-run' },
						external: { ...EXTERNAL_RECORD, outcome: 'timeout' as const }
					})
			};
			const { session, log, seen } = makeSession({
				script: [turn('Ping.', 'ping')],
				guardrails: [hostedStop]
			});
			const result = await session.step();

			expect(result.outcome).toBe('STOPPED_BY_GUARDRAIL');
			expect(seen).toContain('guardrail.external');
			expect(seen).toContain('guardrail.tripped');
			const external = log.find((event) => event.type === 'guardrail.external');
			expect(external?.type === 'guardrail.external' ? external.payload.outcome : undefined).toBe(
				'timeout'
			);
		});
	});

	/**
	 * The runtime a *live* session builds gets the same `getPolicyCard` a
	 * build-check runtime does (`validate-spec.test.ts`'s equivalent) — one
	 * `BrickRuntimeContext`, not two implementations that could drift.
	 */
	it('gives a fitted brick’s own runtime a working getPolicyCard', async () => {
		const registry = buildRegistry();
		const seen: (string | undefined)[] = [];
		registry.registerPack({
			id: 'expansion3',
			name: 'Expansion 3',
			version: '1.0.0',
			requiresCore: '>=0.0.1',
			brickKinds: [
				{
					id: 'expansion3/watches',
					slot: 'safety',
					name: 'Watches',
					description: 'Looks up its own card.',
					realName: 'Watches',
					realExplanation: 'Looks up its own card.',
					configSchema: z.object({}),
					configVersion: 1,
					defaults: {},
					createRuntime: (_config: unknown, ctx) => {
						seen.push(ctx.getPolicyCard('nobody/registered-this')?.title);
						return {};
					}
				} as BrickKindDefinition
			]
		});

		createSession({
			spec: {
				id: '22222222-2222-4222-8222-222222222222',
				name: 'Watched Tinybot',
				schemaVersion: 2,
				bricks: [{ slot: 'safety', kind: 'expansion3/watches', configVersion: 1, config: {} }],
				goalCardId: 'tiny/goal',
				identity: { displayName: 'Watched Tinybot', boxArtSeed: 'seed' },
				createdAt: '2026-08-16T09:00:00.000Z',
				updatedAt: '2026-08-16T09:00:00.000Z'
			},
			registry,
			provider: createMockProvider({ script: [turn('Off I go.', 'win')] }),
			guardrails: []
		});
		// Constructing the session already builds every fitted brick's runtime
		// (`14-…` §2.1), so `createRuntime` above has already run.
		expect(seen).toEqual([undefined]);
	});

	/**
	 * Same reasoning as `getPolicyCard` above, for the seam WP24 added:
	 * `approval: 'risky'` needs an action's `riskTier` the moment it builds
	 * its guardrail, not just that the id exists.
	 */
	it('gives a fitted brick’s own runtime a working getAction', async () => {
		const registry = buildRegistry();
		const seen: (string | undefined)[] = [];
		registry.registerPack({
			id: 'expansion4',
			name: 'Expansion 4',
			version: '1.0.0',
			requiresCore: '>=0.0.1',
			brickKinds: [
				{
					id: 'expansion4/watches',
					slot: 'safety',
					name: 'Watches',
					description: 'Looks up an action.',
					realName: 'Watches',
					realExplanation: 'Looks up an action.',
					configSchema: z.object({}),
					configVersion: 1,
					defaults: {},
					createRuntime: (_config: unknown, ctx) => {
						seen.push(ctx.getAction('nobody/registered-this')?.riskTier);
						return {};
					}
				} as BrickKindDefinition
			]
		});

		createSession({
			spec: {
				id: '33333333-3333-4333-8333-333333333333',
				name: 'Watched Tinybot',
				schemaVersion: 2,
				bricks: [{ slot: 'safety', kind: 'expansion4/watches', configVersion: 1, config: {} }],
				goalCardId: 'tiny/goal',
				identity: { displayName: 'Watched Tinybot', boxArtSeed: 'seed' },
				createdAt: '2026-08-16T09:00:00.000Z',
				updatedAt: '2026-08-16T09:00:00.000Z'
			},
			registry,
			provider: createMockProvider({ script: [turn('Off I go.', 'win')] }),
			guardrails: []
		});
		expect(seen).toEqual([undefined]);
	});

	/**
	 * The credential/network seam (`25-…` §4.6, WP35 stage C) — a test-only
	 * kind, the same shape `getPolicyCard`/`getAction`'s own proofs above
	 * use, reading a secret through `ctx.getCredential` and calling
	 * `ctx.fetch` rather than the raw global, so the seam is proven generic
	 * before any real brick (the Armour Brick, stage D) is built on it.
	 */
	describe('the credential/network seam', () => {
		function watchesCredentialKind(seen: (string | undefined)[]): BrickKindDefinition {
			return {
				id: 'expansion5/watches',
				slot: 'safety',
				name: 'Watches',
				description: 'Reads a credential through the seam.',
				realName: 'Watches',
				realExplanation: 'Reads a credential through the seam.',
				configSchema: z.object({}),
				configVersion: 1,
				defaults: {},
				createRuntime: (_config: unknown, ctx) => {
					seen.push(ctx.getCredential('test/cred'));
					return {};
				}
			} as BrickKindDefinition;
		}

		function watchesSpec(kindId: string) {
			return {
				id: '44444444-4444-4444-8444-444444444444',
				name: 'Watched Tinybot',
				schemaVersion: 2 as const,
				bricks: [{ slot: 'safety' as const, kind: kindId, configVersion: 1, config: {} }],
				goalCardId: 'tiny/goal',
				identity: { displayName: 'Watched Tinybot', boxArtSeed: 'seed' },
				createdAt: '2026-08-16T09:00:00.000Z',
				updatedAt: '2026-08-16T09:00:00.000Z'
			};
		}

		it('gives a fitted brick’s own runtime undefined when the host supplies no getCredential', () => {
			const registry = buildRegistry();
			const seen: (string | undefined)[] = [];
			registry.registerPack({
				id: 'expansion5',
				name: 'Expansion 5',
				version: '1.0.0',
				requiresCore: '>=0.0.1',
				brickKinds: [watchesCredentialKind(seen)]
			});

			createSession({
				spec: watchesSpec('expansion5/watches'),
				registry,
				provider: createMockProvider({ script: [turn('Off I go.', 'win')] }),
				guardrails: []
			});
			expect(seen).toEqual([undefined]);
		});

		it('gives a fitted brick’s own runtime the real secret when the host supplies getCredential', () => {
			const registry = buildRegistry();
			const seen: (string | undefined)[] = [];
			registry.registerPack({
				id: 'expansion5',
				name: 'Expansion 5',
				version: '1.0.0',
				requiresCore: '>=0.0.1',
				brickKinds: [watchesCredentialKind(seen)]
			});

			createSession({
				spec: watchesSpec('expansion5/watches'),
				registry,
				provider: createMockProvider({ script: [turn('Off I go.', 'win')] }),
				guardrails: [],
				getCredential: (id) => (id === 'test/cred' ? 'super-secret-token' : undefined)
			});
			expect(seen).toEqual(['super-secret-token']);
		});

		it('gives every runtime the real platform fetch by default', () => {
			const registry = buildRegistry();
			const seenFetch: (typeof globalThis.fetch)[] = [];
			registry.registerPack({
				id: 'expansion6',
				name: 'Expansion 6',
				version: '1.0.0',
				requiresCore: '>=0.0.1',
				brickKinds: [
					{
						id: 'expansion6/watches',
						slot: 'safety',
						name: 'Watches',
						description: 'Notes the fetch it was handed.',
						realName: 'Watches',
						realExplanation: 'Notes the fetch it was handed.',
						configSchema: z.object({}),
						configVersion: 1,
						defaults: {},
						createRuntime: (_config: unknown, ctx) => {
							seenFetch.push(ctx.fetch);
							return {};
						}
					} as BrickKindDefinition
				]
			});

			createSession({
				spec: watchesSpec('expansion6/watches'),
				registry,
				provider: createMockProvider({ script: [turn('Off I go.', 'win')] }),
				guardrails: []
			});
			expect(seenFetch[0]).toBeTypeOf('function');
		});

		it('gives every runtime an injected fetch when options.fetch is supplied, for testability', async () => {
			const registry = buildRegistry();
			const seenFetch: unknown[] = [];
			const fakeFetch = (() =>
				Promise.resolve(new Response('{}'))) as unknown as typeof globalThis.fetch;
			registry.registerPack({
				id: 'expansion7',
				name: 'Expansion 7',
				version: '1.0.0',
				requiresCore: '>=0.0.1',
				brickKinds: [
					{
						id: 'expansion7/watches',
						slot: 'safety',
						name: 'Watches',
						description: 'Notes the fetch it was handed.',
						realName: 'Watches',
						realExplanation: 'Notes the fetch it was handed.',
						configSchema: z.object({}),
						configVersion: 1,
						defaults: {},
						createRuntime: (_config: unknown, ctx) => {
							seenFetch.push(ctx.fetch);
							return {};
						}
					} as BrickKindDefinition
				]
			});

			createSession({
				spec: watchesSpec('expansion7/watches'),
				registry,
				provider: createMockProvider({ script: [turn('Off I go.', 'win')] }),
				guardrails: [],
				options: { fetch: fakeFetch }
			});
			// Since WP41 the runtime gets the egress guard *over* the injected
			// fetch, never the platform global: a declared host reaches the
			// injected one, an undeclared host is refused before it.
			const handed = seenFetch[0] as typeof globalThis.fetch;
			expect(handed).not.toBe(globalThis.fetch);
			await expect(handed('https://anywhere.test/')).rejects.toMatchObject({
				kind: 'egress-refused'
			});
		});
	});

	it('blocks one action without ending the run, and tells the agent why', async () => {
		const { session, seen } = makeSession({
			script: () => turn('Ping.', 'ping'),
			guardrails: [blockPing],
			budgets: { maxTicks: 2 }
		});
		const prompts: string[] = [];
		session.events.on('prompt.composed', (event) => {
			prompts.push(event.payload.messages.at(-1)?.content ?? '');
		});

		await session.step();
		const second = await session.step();

		expect(second.outcome).toBe('OUT_OF_STEPS');
		expect(seen).not.toContain('action.performed');
		expect(prompts[1]).toContain('a safety rule stopped you');
	});

	it('gives the guardrail the proposed call to inspect', async () => {
		const seenProposals: unknown[] = [];
		const spy: Guardrail = {
			id: 'test/spy',
			name: 'Spy',
			description: 'Records what was proposed.',
			hooks: ['pre-act'],
			check: (ctx) => {
				seenProposals.push(ctx.proposed);
				return { allow: true };
			}
		};
		const { session } = makeSession({ script: [turn('Ping.', 'ping')], guardrails: [spy] });
		await session.step();

		expect(seenProposals[0]).toMatchObject({ kind: 'action', name: 'ping' });
	});

	it('runs post-act guardrails too', async () => {
		const hooks: string[] = [];
		const watcher: Guardrail = {
			id: 'test/watcher',
			name: 'Watcher',
			description: 'Watches every hook.',
			hooks: ['pre-think', 'pre-act', 'post-act'],
			check: (ctx) => {
				hooks.push(ctx.hook);
				return { allow: true };
			}
		};
		const { session } = makeSession({ script: [turn('Ping.', 'ping')], guardrails: [watcher] });
		await session.step();

		expect(hooks).toEqual(['pre-think', 'pre-act', 'post-act']);
	});
});

describe('the approval flow', () => {
	const askFirst: Guardrail = {
		id: 'test/ask',
		name: 'Ask First',
		description: 'Pauses for a human.',
		hooks: ['pre-act'],
		check: () => ({ pause: true, reason: 'ask a grown-up' })
	};

	it('suspends the tick, then acts when approved', async () => {
		const { session, seen } = makeSession({
			script: [turn('Ping.', 'ping')],
			guardrails: [askFirst]
		});
		const asked = new Promise<void>((resolve) => {
			session.events.on('approval.requested', () => resolve());
		});

		const pending = session.step();
		await asked;
		expect(session.status).toBe('awaiting-approval');

		session.resolveApproval(true);
		await pending;

		expect(seen).toContain('approval.resolved');
		expect(seen).toContain('action.performed');
	});

	it('skips the action and explains itself when denied', async () => {
		const { session, seen } = makeSession({
			script: () => turn('Ping.', 'ping'),
			guardrails: [askFirst],
			budgets: { maxTicks: 2 }
		});
		const prompts: string[] = [];
		session.events.on('prompt.composed', (event) => {
			prompts.push(event.payload.messages.at(-1)?.content ?? '');
		});
		// Deny synchronously from the handler — the host is entitled to do this,
		// and the session arms its resolver before announcing so it works.
		session.events.on('approval.requested', () => session.resolveApproval(false));

		await session.step();
		await session.step();

		expect(seen).not.toContain('action.performed');
		expect(prompts[1]).toContain('a person said no');
	});
});

describe('resolveApproval', () => {
	it('is harmless when nothing is waiting on it', () => {
		const { session } = makeSession({ script: [turn('Ping.', 'ping')] });
		expect(() => session.resolveApproval(true)).not.toThrow();
	});
});

describe('stop', () => {
	it('ends the run when pulled between ticks', async () => {
		const { session } = makeSession({ script: () => turn('Ping.', 'ping') });
		session.start('step');
		await session.step();
		session.stop('user pressed stop');
		expect(session.status).toBe('finished');
	});

	it('ends the run when pulled during a tick', async () => {
		const { session } = makeSession({ script: () => turn('Ping.', 'ping') });
		session.start('step');
		const pending = session.step();
		session.stop();
		expect((await pending).outcome).toBe('STOPPED_BY_USER');
	});

	it('does nothing once the run has already finished', async () => {
		const { session } = makeSession({ script: [turn('Win!', 'win')] });
		await session.step();
		session.stop();
		expect(session.status).toBe('finished');
	});
});

/**
 * **WP29 stage A** (`23-MULTI-AGENT-DESIGN.md` §4.5, §10): the two additive
 * seams `SessionGroup` will need, proven inert for every session that does
 * not use them — which is every session before this WP and every solo
 * session after it.
 */
describe('a host-supplied world (WP29)', () => {
	it('is used exactly as a session would have built it itself', async () => {
		const script = [turn('Ping.', 'ping'), turn('Win!', 'win')];

		const built = makeSession({ script });
		built.session.start('step');
		await built.session.step();
		await built.session.step();

		const handedIn = makeSession({ script, world: createTinyWorld().create('only') });
		handedIn.session.start('step');
		await handedIn.session.step();
		await handedIn.session.step();

		// Same script, same deterministic clock shape, same registry — a world
		// passed in through `deps.world` produces a byte-identical trace to one
		// the session built for itself, the same "reproduces byte-identically"
		// proof `trace-fixture.test.ts` holds for two independent solo runs.
		expect(JSON.stringify(handedIn.log)).toBe(JSON.stringify(built.log));
	});

	it('is the actual instance used — mutating it outside the session is visible inside', async () => {
		const world = createTinyWorld().create('only');
		const { session } = makeSession({ script: [turn('Win!', 'win')], world });

		session.start('step');
		await session.step();

		// If the session had quietly built its own world instead of using the
		// one handed in, this world's own state would never have moved.
		expect(world.snapshot()).toMatchObject({ won: true });
	});

	/**
	 * **WP31 stage F**: the door a fitted brick's own config crosses into the
	 * world — `AgentHandle` itself never carries it. Proven here rather than
	 * only against `collectWorldConfig` in isolation, because the thing that
	 * actually matters is that `createSession` calls `world.configure` at
	 * all, with the bag the fitted bricks actually produced.
	 */
	it('hands the world whatever the fitted bricks contributed via contributeWorldConfig', async () => {
		const configure = vi.fn();
		const world: WorldInstance = { ...createTinyWorld().create('only'), configure };

		const registry = buildRegistry();
		registry.registerPack({
			id: 'configurer-pack',
			name: 'Configurer pack',
			version: '1.0.0',
			requiresCore: '>=0.0.1',
			brickKinds: [
				{
					id: 'test/configurer',
					slot: 'equipment',
					name: 'Configurer',
					description: 'test/configurer',
					realName: 'test/configurer',
					realExplanation: 'test/configurer',
					configSchema: z.object({}),
					configVersion: 1,
					defaults: {},
					createRuntime: () => ({
						contributeWorldConfig: () => ({ 'tiny/channel': { setting: 'on' } })
					})
				} as BrickKindDefinition
			]
		});

		const spec = {
			...buildSpec(),
			schemaVersion: 2 as const,
			identity: { displayName: 'Tinybot', boxArtSeed: 'seed' },
			bricks: [
				{ slot: 'equipment' as const, kind: 'test/configurer', configVersion: 1, config: {} }
			]
		};

		createSession({
			spec,
			registry,
			provider: createMockProvider({ script: [] }),
			guardrails: [],
			world
		});

		expect(configure).toHaveBeenCalledExactlyOnceWith({ 'tiny/channel': { setting: 'on' } });
	});
});

describe('parentRunId (WP29)', () => {
	it('is absent from every event on an ordinary solo run', async () => {
		const { session, log } = makeSession({ script: [turn('Win!', 'win')] });
		session.start('step');
		await session.step();

		expect(log.length).toBeGreaterThan(0);
		for (const event of log) expect('parentRunId' in event).toBe(false);
	});

	it('is stamped on every event once set, run.started included', async () => {
		const { session, log } = makeSession({
			script: [turn('Win!', 'win')],
			parentRunId: '99999999-9999-4999-8999-999999999999'
		});
		session.start('step');
		await session.step();

		expect(log.length).toBeGreaterThan(0);
		for (const event of log) {
			expect((event as { parentRunId?: string }).parentRunId).toBe(
				'99999999-9999-4999-8999-999999999999'
			);
		}
	});
});
