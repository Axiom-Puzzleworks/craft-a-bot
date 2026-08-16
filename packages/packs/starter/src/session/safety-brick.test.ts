import { buildRuntimes, collectGuardrails, createSession, type EngineEvent } from '@craftabot/core';
import { createMockProvider, createTestClock, obedient, wanderer } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { buildRegistry, buildSpec, runToCompletion } from './harness.js';

/**
 * **08-GOVERNANCE-GUARDRAILS.md §7.2** — the Safety Brick's three rules work,
 * emit checked/tripped events, and produce their end cards; denied actions are
 * fed back into the next observation.
 *
 * These drive the *real* guardrails from `@craftabot/governance` through a real
 * session over the real Playroom. The hand-written guardrails in
 * `outcomes.test.ts` prove the engine's dispositions; these prove the shipped
 * policy. Both matter — until WP8 the brick's settings were written to the spec
 * and never read by anything.
 */

/** Exactly what the play route does: brick settings in, running rules out. */
const safetySpec = (
	safety: {
		maxTicks: number;
		blockedActions: string[];
		approvalMode: boolean;
		repeatLimit?: number;
	},
	goalCardId?: string
) => buildSpec(goalCardId !== undefined ? { safety, goalCardId } : { safety });

const trippedIds = (events: EngineEvent[]) =>
	events
		.filter((event) => event.type === 'guardrail.tripped')
		.map((event) => (event.type === 'guardrail.tripped' ? event.payload.guardrailId : ''));

/**
 * Every spec here has a step budget fitted, so it will trip at the end of any
 * run long enough to reach it. Assertions about *another* rule therefore have
 * to be scoped, or they end up accidentally asserting the step budget's timing.
 */
const timesTripped = (events: EngineEvent[], guardrailId: string) =>
	trippedIds(events).filter((id) => id === guardrailId).length;

describe('the step budget rule', () => {
	it('stops the run as STOPPED_BY_GUARDRAIL, not OUT_OF_STEPS', async () => {
		// The distinction is the lesson: a rule the builder set stopped this run,
		// so they get the Safety Brick end card rather than the sleepy one.
		const spec = safetySpec({ maxTicks: 4, blockedActions: [], approvalMode: false });
		const run = await runToCompletion({
			script: wanderer(),
			spec
		});

		expect(run.outcome).toBe('STOPPED_BY_GUARDRAIL');
		expect(trippedIds(run.events)).toStrictEqual(['safety/step-budget']);
	});

	it('spends exactly the turns on the dial', async () => {
		const spec = safetySpec({ maxTicks: 4, blockedActions: [], approvalMode: false });
		const run = await runToCompletion({
			script: wanderer(),
			spec
		});

		// Four `tick.started` events, the last stopped before it thinks — the same
		// timing the engine budget had, only a different outcome.
		expect(run.byType('tick.started')).toHaveLength(4);
		expect(run.byType('think.started')).toHaveLength(3);
	});

	it('reports every passing check too, so the trace shows governance working', async () => {
		const spec = safetySpec({ maxTicks: 3, blockedActions: [], approvalMode: false });
		const run = await runToCompletion({
			script: wanderer(),
			spec
		});

		// One check per tick: two allowed, then the trip (08 §2).
		expect(run.byType('guardrail.checked')).toHaveLength(3);
		expect(run.byType('guardrail.tripped')).toHaveLength(1);
	});
});

describe('the action blocklist rule', () => {
	const openThenMove = () =>
		obedient([
			{ say: 'Let me open the chest.', call: 'open', args: { container: 'toy-chest' } },
			{ say: 'Fine, I will move instead.', call: 'move', args: { direction: 'east' } }
		]);

	it('blocks the action without ending the run', async () => {
		const spec = safetySpec(
			{ maxTicks: 4, blockedActions: ['open'], approvalMode: false },
			'starter/tidy-the-blocks'
		);
		const run = await runToCompletion({
			script: openThenMove(),
			spec
		});

		expect(timesTripped(run.events, 'safety/action-blocklist')).toBe(1);

		// A refused step, not a failed run. The proof is that the run went on to
		// take another turn and do something else.
		expect(run.byType('tick.started').length).toBeGreaterThan(1);
		const performed = run
			.byType('action.performed')
			.map((event) => (event.type === 'action.performed' ? event.payload.name : ''));
		expect(performed).not.toContain('open');
		expect(performed).toContain('move');
	});

	it('tells the agent why, in its very next observation', async () => {
		const spec = safetySpec(
			{ maxTicks: 4, blockedActions: ['open'], approvalMode: false },
			'starter/tidy-the-blocks'
		);
		const run = await runToCompletion({
			script: openThenMove(),
			spec
		});

		const secondPrompt = run.byType('prompt.composed').at(1);
		if (secondPrompt?.type !== 'prompt.composed') throw new Error('expected a second prompt');
		const latest = secondPrompt.payload.messages.at(-1)?.content ?? '';
		expect(latest).toContain('a safety rule stopped you');
		expect(latest).toContain('open is on the blocked list.');
	});

	it('leaves an action that is not on the list alone', async () => {
		const spec = safetySpec({ maxTicks: 3, blockedActions: ['throw'], approvalMode: false });
		const run = await runToCompletion({
			script: obedient([{ say: 'Off I go.', call: 'move', args: { direction: 'east' } }]),
			spec
		});

		expect(timesTripped(run.events, 'safety/action-blocklist')).toBe(0);
	});
});

describe('the approval mode rule', () => {
	/**
	 * Approval needs the session directly, because the run suspends *mid-step*.
	 *
	 * The answer has to come from the `approval.requested` handler rather than
	 * from after `step()`: by the time the awaited step returns, the run is
	 * already parked on the approval promise and nothing will ever resolve it.
	 * The engine arms its resolver before emitting precisely so that answering
	 * from the handler works (see `agent-session.ts`), and this is what that
	 * comment was protecting.
	 */
	function approvalSession(answer: boolean) {
		const clock = createTestClock();
		const spec = safetySpec({ maxTicks: 5, blockedActions: [], approvalMode: true });
		const events: EngineEvent[] = [];
		const seen: { statusWhileWaiting?: string } = {};

		const session = createSession({
			spec,
			registry: buildRegistry(),
			provider: createMockProvider({
				script: obedient([{ say: 'Saying hello.', call: 'say', args: { text: 'Hello!' } }])
			}),
			options: { now: clock.now, newId: clock.newId, random: clock.random }
		});

		session.events.onAny((event) => {
			events.push(event);
			if (event.type === 'approval.requested') {
				seen.statusWhileWaiting = session.status;
				session.resolveApproval(answer);
			}
		});
		return { session, events, seen };
	}

	it('suspends the run and announces what the bot wants to do', async () => {
		const { session, events, seen } = approvalSession(true);
		session.start('step');
		await session.step();

		const requested = events.find((event) => event.type === 'approval.requested');
		if (requested?.type !== 'approval.requested') throw new Error('no approval requested');
		expect(requested.payload.proposed.name).toBe('say');
		expect(requested.payload.reason).toContain('Approval mode is switched on');
		// The run really had stopped at the moment it asked.
		expect(seen.statusWhileWaiting).toBe('awaiting-approval');
	});

	it('performs the action when a person allows it', async () => {
		const { session, events } = approvalSession(true);
		session.start('step');
		await session.step();

		expect(events.some((event) => event.type === 'action.performed')).toBe(true);
		const resolved = events.find((event) => event.type === 'approval.resolved');
		if (resolved?.type !== 'approval.resolved') throw new Error('no resolution recorded');
		expect(resolved.payload.approved).toBe(true);
	});

	it('refuses the action when a person denies it, and says so kindly', async () => {
		const { session, events } = approvalSession(false);
		session.start('step');
		await session.step();

		expect(events.some((event) => event.type === 'action.performed')).toBe(false);

		// The denial reaches the bot as information, not as an ending.
		await session.step();

		const prompts = events.filter((event) => event.type === 'prompt.composed');
		const latest = prompts.at(-1);
		if (latest?.type !== 'prompt.composed') throw new Error('expected a later prompt');
		expect(latest.payload.messages.at(-1)?.content).toContain('a person said no');
	});

	it('does not pause for a tool, only for world actions', async () => {
		const clock = createTestClock();
		const spec = safetySpec({ maxTicks: 5, blockedActions: [], approvalMode: true });
		const events: EngineEvent[] = [];
		const session = createSession({
			// The brick lists tool *ids*; `dice` is the wire name the model calls.
			spec: { ...spec, bricks: { ...spec.bricks, tools: { enabled: ['starter/dice'] } } },
			registry: buildRegistry(),
			provider: createMockProvider({
				script: obedient([{ say: 'Rolling.', call: 'dice', args: { sides: 6 } }])
			}),
			options: { now: clock.now, newId: clock.newId, random: clock.random }
		});
		// Answer anyway, so a regression fails this assertion instead of hanging
		// the suite on a promise nobody will ever resolve.
		session.events.onAny((event) => {
			events.push(event);
			if (event.type === 'approval.requested') session.resolveApproval(true);
		});

		session.start('step');
		await session.step();

		// Looking is free; changing things is what needs a signature.
		const proposed = events
			.filter((event) => event.type === 'decision')
			.map((event) => (event.type === 'decision' ? event.payload.call : null));
		expect(proposed[0]).toMatchObject({ kind: 'tool', name: 'dice' });
		expect(events.some((event) => event.type === 'approval.requested')).toBe(false);
		expect(events.some((event) => event.type === 'tool.executed')).toBe(true);
	});
});

describe('no Safety Brick at all', () => {
	it('installs no guardrails, and the engine floor still applies', async () => {
		const spec = buildSpec();
		// Nothing in the safety socket, so nothing installs a rule (slice 3d).
		expect(
			collectGuardrails(
				buildRuntimes({
					spec,
					registry: buildRegistry(),
					context: { random: () => 0, getPolicyCard: () => undefined }
				})
			)
		).toStrictEqual([]);

		const run = await runToCompletion({
			script: wanderer(),
			spec
		});
		expect(run.outcome).toBe('OUT_OF_STEPS');
		expect(run.byType('guardrail.checked')).toHaveLength(0);
	});
});

/**
 * A refused attempt has to survive into memory, not just into the next
 * observation.
 *
 * Before this, the tick loop recorded `action`/`result` only when the call was
 * actually performed — so a blocked call produced a memory entry showing the
 * bot thinking and doing nothing at all. It saw the refusal once, in the
 * following turn's feedback, and then had no record of it ever again. Watching
 * a bot rediscover the same forbidden idea every few turns is how this was
 * found.
 */
describe('refusals are remembered', () => {
	const openThenOpen = () =>
		obedient([
			{ say: 'I will open the chest.', call: 'open', args: { container: 'toy-chest' } },
			{ say: 'Let me try that again.', call: 'open', args: { container: 'toy-chest' } },
			{ say: 'And again.', call: 'open', args: { container: 'toy-chest' } }
		]);

	it('keeps a blocked action in the memory window, turn after turn', async () => {
		const spec = safetySpec(
			{ maxTicks: 5, blockedActions: ['open'], approvalMode: false },
			'starter/tidy-the-blocks'
		);
		const run = await runToCompletion({
			script: openThenOpen(),
			spec
		});

		// By the third prompt the first refusal is two turns old — exactly the
		// point at which it used to have vanished.
		const third = run.byType('prompt.composed').at(2);
		if (third?.type !== 'prompt.composed') throw new Error('expected a third prompt');
		const memory = third.payload.messages.find((message) =>
			message.content.startsWith('What you remember')
		);

		expect(memory?.content).toContain('refused');
		expect(memory?.content).toContain('open is on the blocked list.');
	});

	it('remembers a denial by a person too', async () => {
		const clock = createTestClock();
		const spec = safetySpec({ maxTicks: 5, blockedActions: [], approvalMode: true });
		const events: EngineEvent[] = [];
		const session = createSession({
			spec,
			registry: buildRegistry(),
			provider: createMockProvider({
				script: obedient([
					{ say: 'Saying hello.', call: 'say', args: { text: 'Hello!' } },
					{ say: 'Trying again.', call: 'say', args: { text: 'Hello?' } }
				])
			}),
			options: { now: clock.now, newId: clock.newId, random: clock.random }
		});
		session.events.onAny((event) => {
			events.push(event);
			if (event.type === 'approval.requested') session.resolveApproval(false);
		});

		session.start('step');
		await session.step();
		await session.step();

		const second = events.filter((event) => event.type === 'prompt.composed').at(-1);
		if (second?.type !== 'prompt.composed') throw new Error('expected a later prompt');
		const memory = second.payload.messages.find((message) =>
			message.content.startsWith('What you remember')
		);
		expect(memory?.content).toContain('a person said no');
	});
});

/**
 * The loop-breaker, end to end.
 *
 * Reported from real play: a bot at the toy chest calling out to Teddy over and
 * over until its steps ran out. Deliberately *not* engine behaviour — a rule
 * baked into every bot would hide the very failure the simulator exists to
 * show. The builder fits it, picks the number, and lives with the trade-off.
 */
describe('the no-repetition rule', () => {
	/** A bot that has one idea and will not let it go. */
	const brokenRecord = () =>
		obedient(
			Array.from({ length: 8 }, () => ({
				say: 'I will call out to Teddy.',
				call: 'say',
				args: { text: 'Hello Teddy!' }
			}))
		);

	it('lets the loop run when nobody has fitted the rule', async () => {
		const spec = safetySpec({ maxTicks: 8, blockedActions: [], approvalMode: false });
		const run = await runToCompletion({
			script: brokenRecord(),
			spec
		});

		// Eight turns of the same thing, all performed. This is the reported bug,
		// and it is still exactly what happens by default.
		const said = run
			.byType('action.performed')
			.filter((event) => event.type === 'action.performed' && event.payload.result.ok);
		expect(said.length).toBeGreaterThan(3);
		expect(timesTripped(run.events, 'safety/no-repetition')).toBe(0);
	});

	it('blocks the fourth identical move once the rule is fitted', async () => {
		const spec = safetySpec({
			maxTicks: 8,
			blockedActions: [],
			approvalMode: false,
			repeatLimit: 3
		});
		const run = await runToCompletion({
			script: brokenRecord(),
			spec
		});

		const performed = run
			.byType('action.performed')
			.filter((event) => event.type === 'action.performed' && event.payload.result.ok);

		// Three got through; everything after that was refused.
		expect(performed).toHaveLength(3);
		expect(timesTripped(run.events, 'safety/no-repetition')).toBeGreaterThan(0);
	});

	it('refuses without ending the run, and tells the bot why', async () => {
		const spec = safetySpec({
			maxTicks: 8,
			blockedActions: [],
			approvalMode: false,
			repeatLimit: 3
		});
		const run = await runToCompletion({
			script: brokenRecord(),
			spec
		});

		// A loop is a wasted turn, not a failed run. The run does end as
		// STOPPED_BY_GUARDRAIL here, but that is the *step budget* running out —
		// so assert on the loop-breaker's own disposition rather than the outcome.
		const dispositions = run.events
			.filter(
				(event) =>
					event.type === 'guardrail.tripped' && event.payload.guardrailId === 'safety/no-repetition'
			)
			.map((event) => (event.type === 'guardrail.tripped' ? event.payload.disposition : ''));
		expect(dispositions.length).toBeGreaterThan(0);
		expect(new Set(dispositions)).toStrictEqual(new Set(['block-action']));

		const latest = run.byType('prompt.composed').at(-1);
		if (latest?.type !== 'prompt.composed') throw new Error('expected a prompt');
		expect(latest.payload.messages.at(-1)?.content).toContain('Try something different');
	});

	it('is remembered, so the bot can see it has been told before', async () => {
		// Leans on the refusal-memory fix: without it the bot forgets it was
		// stopped and rediscovers the same idea a few turns later.
		const spec = safetySpec({
			maxTicks: 8,
			blockedActions: [],
			approvalMode: false,
			repeatLimit: 3
		});
		const run = await runToCompletion({
			script: brokenRecord(),
			spec
		});

		const latest = run.byType('prompt.composed').at(-1);
		if (latest?.type !== 'prompt.composed') throw new Error('expected a prompt');
		const memory = latest.payload.messages.find((message) =>
			message.content.startsWith('What you remember')
		);
		expect(memory?.content).toContain('refused');
	});

	it('leaves a bot that varies what it does alone', async () => {
		const spec = safetySpec({
			maxTicks: 6,
			blockedActions: [],
			approvalMode: false,
			repeatLimit: 3
		});
		const run = await runToCompletion({
			script: obedient([
				{ say: 'East.', call: 'move', args: { direction: 'east' } },
				{ say: 'North.', call: 'move', args: { direction: 'north' } },
				{ say: 'East again.', call: 'move', args: { direction: 'east' } },
				{ say: 'Hello!', call: 'say', args: { text: 'Hello Teddy!' } }
			]),
			spec
		});

		expect(timesTripped(run.events, 'safety/no-repetition')).toBe(0);
	});
});
