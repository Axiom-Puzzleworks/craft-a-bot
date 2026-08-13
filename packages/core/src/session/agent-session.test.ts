import { describe, expect, it, vi } from 'vitest';
import { createSession } from './agent-session.js';
import { createPackRegistry, type PackRegistry } from '../pack-registry.js';
import { createMockProvider, createTestClock, turn, v1BrickKinds } from '../testing/index.js';
import type { AgentSpec } from '../schemas/agent-spec.js';
import type { EngineEvent } from '../schemas/events.js';
import type { Guardrail, GuardrailVerdict } from '../types/guardrail.js';
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
}) {
	const clock = createTestClock();
	const session = createSession({
		spec: config.spec ?? buildSpec(),
		registry: buildRegistry(),
		provider: createMockProvider({ script: config.script ?? [] }),
		guardrails: config.guardrails ?? [],
		options: {
			now: clock.now,
			newId: clock.newId,
			random: clock.random,
			...(config.budgets ? { budgets: config.budgets } : {})
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
});

describe('guardrails', () => {
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
