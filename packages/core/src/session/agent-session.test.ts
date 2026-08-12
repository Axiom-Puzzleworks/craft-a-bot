import { describe, expect, it, vi } from 'vitest';
import { createSession } from './agent-session.js';
import { createPackRegistry, type PackRegistry } from '../pack-registry.js';
import { createMockProvider, createTestClock, turn } from '../testing/index.js';
import type { AgentSpec } from '../schemas/agent-spec.js';
import type { Guardrail } from '../types/guardrail.js';
import type { ToolDefinition } from '../types/tool.js';
import type { WorldDefinition, WorldInstance } from '../types/world.js';

/**
 * The loop, tested against a deliberately trivial world rather than the
 * Playroom. `core` must never depend on a pack (01-ARCHITECTURE.md §1.3), so
 * proving the engine works has to be possible without one — these cover the
 * mechanics, while pack-starter's session tests cover realistic goal runs.
 */

/** A one-cell world: `ping` does nothing much, `win` satisfies the goal. */
function createTinyWorld(): WorldDefinition {
	return {
		id: 'tiny/world',
		name: 'Tiny world',
		layouts: [{ id: 'only', name: 'Only layout', initialState: { pings: 0, won: false } }],
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
		predicates: { 'has-won': 'The goal is met.' },
		create(): WorldInstance {
			const state = { pings: 0, won: false };
			return {
				snapshot: () => ({ ...state }),
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
					return { ok: false, narration: `you cannot ${action.name}`, stateDiff: [] };
				},
				test: (predicate) => predicate === 'has-won' && state.won,
				reset: () => {
					state.pings = 0;
					state.won = false;
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
		worlds: [createTinyWorld()],
		tools: [echoTool, secretTool],
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
	session.events.onAny((event) => seen.push(event.type));
	return { session, seen };
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
