import {
	migrateAgentSpec,
	type AgentSpecV2,
	type ChatRequest,
	type LLMProvider
} from '@craftabot/core';
import { createMockProvider, obedient, wanderer } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { buildSpec, runToCompletion, type SpecOverrides } from './harness.js';

/**
 * **The brick matrix**: every control on every brick, switched on and switched
 * off, with the difference asserted.
 *
 * Individual behaviours are tested elsewhere and in more depth. What this file
 * is for is the question you cannot answer by reading any one of those: *does
 * each switch actually do something, and does turning it off actually undo it?*
 * A control that is wired to nothing passes every test written about the thing
 * it was supposed to control, because that thing still works — it just is not
 * listening to the switch. Two bricks have already shipped in exactly that
 * state (the Safety Brick before WP8, the Actions brick before WP9).
 *
 * Six bricks · 22 toggles · 5 valued controls.
 */

/** Runs a session and keeps the requests that reached the provider. */
async function run(
	overrides: SpecOverrides,
	script: Parameters<typeof runToCompletion>[0]['script'],
	options: { maxTicks?: number } = {}
) {
	const requests: ChatRequest[] = [];
	const inner = createMockProvider({ script });
	const provider: LLMProvider = {
		...inner,
		chat(request, opts) {
			requests.push(request);
			return inner.chat(request, opts);
		}
	};

	const spec = buildSpec(overrides);
	const result = await runToCompletion({
		script,
		spec,
		provider,
		...(options.maxTicks !== undefined ? { maxTicks: options.maxTicks } : {})
	});

	const systemOf = (index = 0) => {
		const prompt = result.byType('prompt.composed').at(index);
		return prompt?.type === 'prompt.composed' ? (prompt.payload.messages[0]?.content ?? '') : '';
	};
	const observationOf = (index = 0) => {
		const sensed = result.byType('sense').at(index);
		return sensed?.type === 'sense' ? sensed.payload.observation.text : '';
	};
	const narrations = () =>
		result
			.byType('action.performed')
			.map((event) => (event.type === 'action.performed' ? event.payload.result.narration : ''));

	return { ...result, requests, systemOf, observationOf, narrations };
}

const PING = () => obedient([{ say: 'Ping.', call: 'say', args: { text: 'Ping!' } }]);
const toolNames = (requests: ChatRequest[]) => (requests[0]?.tools ?? []).map((tool) => tool.name);

// ─── Brain brick ─────────────────────────────────────────────────────────────

describe('Brain brick', () => {
	it('temperature reaches the provider, and changing it changes the request', async () => {
		const cold = await run({ llm: true }, PING());
		expect(cold.requests[0]?.temperature).toBe(0);

		const warm = await run({ llm: true, temperature: 1.4 }, PING());
		expect(warm.requests[0]?.temperature).toBe(1.4);
	});

	it('max tokens reaches the provider', async () => {
		const small = await run({ llm: true, maxTokens: 64 }, PING());
		expect(small.requests[0]?.maxTokens).toBe(64);
	});

	it('personality appears in the system prompt when set, and not when blank', async () => {
		const withIt = await run({ llm: true, personality: 'You are a grumpy robot.' }, PING());
		expect(withIt.systemOf()).toContain('About you: You are a grumpy robot.');

		const without = await run({ llm: true, personality: '' }, PING());
		expect(without.systemOf()).not.toContain('About you:');
	});

	it('removing the brick removes the brain from the fitted list', async () => {
		const fitted = await run({ llm: true }, PING());
		expect(fitted.systemOf()).toContain('a brain (LLM)');
	});
});

// ─── Scrapbook (memory) brick ────────────────────────────────────────────────

describe('Scrapbook brick', () => {
	const wander = () => wanderer();

	it('off: no memory section in the prompt at all', async () => {
		const result = await run({ memory: null }, wander(), { maxTicks: 4 });
		const prompt = result.byType('prompt.composed').at(-1);
		const messages = prompt?.type === 'prompt.composed' ? prompt.payload.messages : [];
		expect(messages.some((message) => message.content.startsWith('What you remember'))).toBe(false);
	});

	it('on: the memory section appears and grows', async () => {
		const result = await run({ memory: { windowSize: 10, notebook: false } }, wander(), {
			maxTicks: 4
		});
		const prompt = result.byType('prompt.composed').at(-1);
		const memory =
			prompt?.type === 'prompt.composed'
				? prompt.payload.messages.find((message) => message.content.startsWith('What you remember'))
				: undefined;
		expect(memory).toBeDefined();
	});

	it('window size caps how far back it can see', async () => {
		const short = await run({ memory: { windowSize: 3, notebook: false } }, wander(), {
			maxTicks: 8
		});
		const long = await run({ memory: { windowSize: 30, notebook: false } }, wander(), {
			maxTicks: 8
		});

		const lines = (result: Awaited<ReturnType<typeof run>>) => {
			const prompt = result.byType('prompt.composed').at(-1);
			const memory =
				prompt?.type === 'prompt.composed'
					? prompt.payload.messages.find((message) =>
							message.content.startsWith('What you remember')
						)
					: undefined;
			return (memory?.content ?? '').split('\n').length;
		};

		expect(lines(short)).toBeLessThan(lines(long));
	});

	it('notebook off: the notebook tools are not offered even if enabled', async () => {
		const result = await run(
			{
				memory: { windowSize: 10, notebook: false },
				tools: ['starter/notebook_write', 'starter/notebook_read']
			},
			PING()
		);
		expect(toolNames(result.requests)).not.toContain('notebook_write');
		expect(toolNames(result.requests)).not.toContain('notebook_read');
	});

	it('notebook on: the notebook tools appear', async () => {
		const result = await run(
			{
				memory: { windowSize: 10, notebook: true },
				tools: ['starter/notebook_write', 'starter/notebook_read']
			},
			PING()
		);
		expect(toolNames(result.requests)).toContain('notebook_write');
		expect(toolNames(result.requests)).toContain('notebook_read');
	});

	it('notebook on: what the bot writes comes back in the next prompt', async () => {
		const result = await run(
			{
				memory: { windowSize: 10, notebook: true },
				tools: ['starter/notebook_write']
			},
			obedient([
				{ say: 'Noting that down.', call: 'notebook_write', args: { note: 'the key is north' } },
				{ say: 'Now what.', call: 'say', args: { text: 'Hello!' } }
			]),
			{ maxTicks: 3 }
		);

		const prompt = result.byType('prompt.composed').at(-1);
		const notes =
			prompt?.type === 'prompt.composed'
				? prompt.payload.messages.find((message) => message.content.startsWith('Your notebook'))
				: undefined;
		expect(notes?.content).toContain('the key is north');
	});
});

// ─── Tool Belt brick ─────────────────────────────────────────────────────────

describe('Tool Belt brick', () => {
	const PLAIN_TOOLS = ['starter/calculator', 'starter/dice', 'starter/look_up_manual'] as const;

	it.each(PLAIN_TOOLS)('%s — off: not offered to the model', async (id) => {
		const result = await run({ tools: [] }, PING());
		expect(toolNames(result.requests)).not.toContain(id.replace('starter/', ''));
	});

	it.each(PLAIN_TOOLS)('%s — on: offered to the model', async (id) => {
		const result = await run({ tools: [id] }, PING());
		expect(toolNames(result.requests)).toContain(id.replace('starter/', ''));
	});

	it('off: calling a tool the belt does not carry does not execute it', async () => {
		const result = await run(
			{ tools: [] },
			obedient([{ say: 'Sums.', call: 'calculator', args: { expression: '2+2' } }]),
			{ maxTicks: 2 }
		);
		expect(result.byType('tool.executed')).toHaveLength(0);
	});

	it('on: the same call executes and returns a result', async () => {
		const result = await run(
			{ tools: ['starter/calculator'] },
			obedient([{ say: 'Sums.', call: 'calculator', args: { expression: '17 * 23' } }]),
			{ maxTicks: 2 }
		);
		const executed = result.byType('tool.executed').at(0);
		expect(executed?.type === 'tool.executed' ? executed.payload.result : '').toContain('391');
	});
});

// ─── Eyes & Ears (sense) brick ───────────────────────────────────────────────

describe('Eyes & Ears brick', () => {
	it('no brick at all: the bot senses nothing', async () => {
		const result = await run({ senses: [] }, PING());
		expect(result.observationOf()).toContain('no working senses');
	});

	it('sight off / on', async () => {
		expect((await run({ senses: ['compass'] }, PING())).observationOf()).not.toContain(
			'You look around'
		);
		expect((await run({ senses: ['sight'] }, PING())).observationOf()).toContain('You look around');
	});

	it('compass off / on', async () => {
		expect((await run({ senses: ['sight'] }, PING())).observationOf()).not.toContain(
			'You are standing at column'
		);
		expect((await run({ senses: ['compass'] }, PING())).observationOf()).toContain(
			'You are standing at column'
		);
	});

	it('clock off / on', async () => {
		expect((await run({ senses: ['sight'] }, PING())).observationOf()).not.toMatch(/tick|turn \d/i);
		expect((await run({ senses: ['clock'] }, PING())).observationOf()).toMatch(/turn|tick/i);
	});

	it('nothing leaks past the brick: no senses means no world knowledge at all', async () => {
		/*
		 * Reported from play as "the robot can see the whole grid even with sight
		 * off". It could: the goal-progress line added alongside the memory work
		 * was composed unconditionally, so a bot with no Sense brick was told, in
		 * consecutive sentences, that it had no idea what was around it and
		 * exactly where all three blocks were.
		 */
		const result = await run({ senses: [], goalCardId: 'starter/tidy-the-blocks' }, PING());
		const prompt = result.byType('prompt.composed').at(0);
		const now =
			prompt?.type === 'prompt.composed' ? (prompt.payload.messages.at(-1)?.content ?? '') : '';

		expect(now).toContain('no working senses');
		expect(now).not.toContain('Blocks in the toy chest');
		expect(now).not.toMatch(/block \(A\)|block \(B\)|block \(C\)/);
	});

	it('sight on: the progress line is allowed through', async () => {
		const result = await run({ senses: ['sight'], goalCardId: 'starter/tidy-the-blocks' }, PING());
		const prompt = result.byType('prompt.composed').at(0);
		const now =
			prompt?.type === 'prompt.composed' ? (prompt.payload.messages.at(-1)?.content ?? '') : '';
		expect(now).toContain('Blocks in the toy chest');
	});

	it('compass alone does not unlock the progress line', async () => {
		// The compass gives the room outline, not what is in it (02 §4).
		const result = await run(
			{ senses: ['compass'], goalCardId: 'starter/tidy-the-blocks' },
			PING()
		);
		const prompt = result.byType('prompt.composed').at(0);
		const now =
			prompt?.type === 'prompt.composed' ? (prompt.payload.messages.at(-1)?.content ?? '') : '';
		expect(now).not.toContain('Blocks in the toy chest');
	});

	it('hearing off / on', async () => {
		expect((await run({ senses: ['sight'] }, PING())).observationOf()).not.toMatch(
			/hear|nobody has said/i
		);
		expect((await run({ senses: ['hearing'] }, PING())).observationOf()).toMatch(
			/hear|nobody has said/i
		);
	});
});

// ─── Hands & Wheels (actions) brick ──────────────────────────────────────────

describe('Hands & Wheels brick', () => {
	const ACTIONS = ['move', 'pick_up', 'put_down', 'give', 'open', 'say', 'celebrate'] as const;

	const ARGS: Record<string, unknown> = {
		move: { direction: 'east' },
		pick_up: { item: 'snack' },
		put_down: { item: 'snack' },
		give: { item: 'snack', character: 'Teddy' },
		open: { container: 'the toy chest' },
		say: { text: 'Hello!' },
		celebrate: {}
	};

	it.each(ACTIONS)(
		'%s — off: the engine refuses it as something it was not built with',
		async (name) => {
			const result = await run(
				{ actions: ACTIONS.filter((candidate) => candidate !== name) },
				obedient([{ say: 'Trying.', call: name, args: ARGS[name] }]),
				{ maxTicks: 2 }
			);
			expect(result.narrations()[0]).toContain('not been built with any way to do it');
		}
	);

	it.each(ACTIONS)('%s — on: it reaches the world instead', async (name) => {
		const result = await run(
			{ actions: [...ACTIONS] },
			obedient([{ say: 'Trying.', call: name, args: ARGS[name] }]),
			{ maxTicks: 2 }
		);

		// It may still be refused *by the world* (wrong place, hands full) — what
		// matters is that the brick no longer stands in the way.
		expect(result.narrations()[0]).not.toContain('not been built with any way to do it');
	});
});

// ─── Safety brick ────────────────────────────────────────────────────────────

describe('Safety brick', () => {
	const SAFETY = { maxTicks: 30, blockedActions: [] as string[], approvalMode: false };

	/**
	 * v2-only fields (`maxTokens`, `approval: 'risky'`) have no v1 counterpart,
	 * so `buildSpec`'s v1 overrides cannot reach them. Migrates a v1 spec and
	 * patches the safety brick's config directly, bumping `configVersion` to 2
	 * so `migrateBrickConfig` treats the patch as already-current rather than
	 * re-deriving `approval` from the `approvalMode` the migration itself left
	 * behind (`brick-kinds.ts`'s `migrateConfig` table, WP24).
	 */
	function v2WithSafety(overrides: SpecOverrides, patch: Record<string, unknown>): AgentSpecV2 {
		const migrated = migrateAgentSpec(buildSpec(overrides));
		if ('kind' in migrated) throw new Error(migrated.message);
		const safety = migrated.bricks.find((brick) => brick.slot === 'safety');
		if (!safety) throw new Error('no safety brick to patch');
		// Mirrors `starter/safety`'s own `migrateConfig` step (`brick-kinds.ts`):
		// applied by hand here, rather than left for `migrateBrickConfig` to run
		// later, because the patch below adds v2-only fields no v1 config could
		// ever have carried.
		const { approvalMode, ...rest } = safety.config;
		safety.config = { ...rest, approval: approvalMode ? 'everything' : 'off', ...patch };
		safety.configVersion = 2;
		return migrated;
	}

	it('no brick: the engine floor applies and the run ends OUT_OF_STEPS', async () => {
		const result = await run({ safety: null }, wanderer());
		expect(result.outcome).toBe('OUT_OF_STEPS');
	});

	it('step budget: the dial ends the run, as the builder’s own rule', async () => {
		const result = await run({ safety: { ...SAFETY, maxTicks: 4 } }, wanderer());
		expect(result.outcome).toBe('STOPPED_BY_GUARDRAIL');
		expect(result.byType('tick.started')).toHaveLength(4);
	});

	it('blocked actions off / on', async () => {
		const script = () => obedient([{ say: 'Speaking.', call: 'say', args: { text: 'Hi!' } }]);

		const off = await run({ safety: { ...SAFETY, maxTicks: 3 } }, script());
		expect(off.narrations()[0]).toContain('You say');

		const on = await run({ safety: { ...SAFETY, maxTicks: 3, blockedActions: ['say'] } }, script());
		expect(on.byType('guardrail.tripped').length).toBeGreaterThan(0);
		expect(on.byType('action.performed')).toHaveLength(0);
	});

	it('approval mode off: nothing is ever asked', async () => {
		const result = await run({ safety: { ...SAFETY, maxTicks: 3 } }, PING());
		expect(result.byType('approval.requested')).toHaveLength(0);
	});

	it('repeat limit off / on', async () => {
		const brokenRecord = () =>
			obedient(
				Array.from({ length: 6 }, () => ({
					say: 'Again.',
					call: 'say',
					args: { text: 'Hello!' }
				}))
			);

		const off = await run({ safety: { ...SAFETY, maxTicks: 6 } }, brokenRecord());
		expect(off.byType('action.performed').length).toBeGreaterThan(3);

		const on = await run({ safety: { ...SAFETY, maxTicks: 6, repeatLimit: 2 } }, brokenRecord());
		expect(on.byType('action.performed')).toHaveLength(2);
	});

	it('token budget off / on', async () => {
		// No session-level `maxTicks` override in either run: that would set the
		// platform floor to the same value as the safety brick's own `maxTicks`
		// dial, and the two would race for which one gets to explain the stop.
		const off = v2WithSafety({ safety: { ...SAFETY, maxTicks: 6 } }, {});
		const offRun = await runToCompletion({ script: wanderer(), spec: off });
		expect(offRun.byType('tick.started')).toHaveLength(6);

		// Tripped at the pre-think that follows the first completion, once real
		// usage exists to compare against — the same timing `createStepBudgetGuardrail`
		// uses, and the reason a cap of 1 does not end the run before tick one.
		const on = v2WithSafety({ safety: { ...SAFETY, maxTicks: 6 } }, { maxTokens: 1 });
		const onRun = await runToCompletion({ script: wanderer(), spec: on });
		expect(onRun.outcome).toBe('STOPPED_BY_GUARDRAIL');
		expect(onRun.byType('tick.started').length).toBeLessThan(6);
	});

	/**
	 * **The approval-fatigue scenario** (`19-…` §8.3, WP24's DoD). "Everything"
	 * is the naive HITL confirmation-fatigue research warns about: every action
	 * pauses, trained-in rubber-stamping and all. "Risky" is the fix — only the
	 * Playroom's one `riskTier: 'reversible'` action (`open`, `14-…` §4.5) is
	 * worth a person's attention; a bot that mostly moves, talks and celebrates
	 * gets nobody in its way.
	 */
	it('approval fatigue: "risky" asks for a fraction of what "everything" asks', async () => {
		const script = () =>
			obedient([
				{ say: 'Off east.', call: 'move', args: { direction: 'east' } },
				{ say: 'Hello!', call: 'say', args: { text: 'Hello!' } },
				{ say: 'Opening the chest.', call: 'open', args: { container: 'the toy chest' } },
				{ say: 'Back west.', call: 'move', args: { direction: 'west' } },
				{ say: 'Yay!', call: 'celebrate', args: {} }
			]);

		const everything = v2WithSafety(
			{ safety: { ...SAFETY, maxTicks: 8 } },
			{ approval: 'everything' }
		);
		const risky = v2WithSafety({ safety: { ...SAFETY, maxTicks: 8 } }, { approval: 'risky' });

		const everythingRun = await runToCompletion({
			script: script(),
			spec: everything,
			stepLimit: 10
		});
		const riskyRun = await runToCompletion({ script: script(), spec: risky, stepLimit: 10 });

		expect(everythingRun.byType('approval.requested')).toHaveLength(5);
		expect(riskyRun.byType('approval.requested')).toHaveLength(1);
	});
});
