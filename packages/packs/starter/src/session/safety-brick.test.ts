import { createSession, type EngineEvent } from '@craftabot/core';
import { createMockProvider, createTestClock, obedient, wanderer } from '@craftabot/core/testing';
import { guardrailsForSpec } from '@craftabot/governance';
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
	safety: { maxTicks: number; blockedActions: string[]; approvalMode: boolean },
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
			spec,
			guardrails: guardrailsForSpec(spec)
		});

		expect(run.outcome).toBe('STOPPED_BY_GUARDRAIL');
		expect(trippedIds(run.events)).toStrictEqual(['safety/step-budget']);
	});

	it('spends exactly the turns on the dial', async () => {
		const spec = safetySpec({ maxTicks: 4, blockedActions: [], approvalMode: false });
		const run = await runToCompletion({
			script: wanderer(),
			spec,
			guardrails: guardrailsForSpec(spec)
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
			spec,
			guardrails: guardrailsForSpec(spec)
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
			spec,
			guardrails: guardrailsForSpec(spec)
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
			spec,
			guardrails: guardrailsForSpec(spec)
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
			spec,
			guardrails: guardrailsForSpec(spec)
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
			guardrails: guardrailsForSpec(spec),
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
			guardrails: guardrailsForSpec(spec),
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
		expect(guardrailsForSpec(spec)).toStrictEqual([]);

		const run = await runToCompletion({
			script: wanderer(),
			spec,
			guardrails: guardrailsForSpec(spec)
		});
		expect(run.outcome).toBe('OUT_OF_STEPS');
		expect(run.byType('guardrail.checked')).toHaveLength(0);
	});
});
