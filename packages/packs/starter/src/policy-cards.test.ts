import { createSession, type EngineEvent } from '@craftabot/core';
import { createMockProvider, createTestClock, obedient, wanderer } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { buildRegistry, buildSpec, runToCompletion } from './session/harness.js';

/**
 * **The L5 efficacy suite** (`13-…` §9, WP22): "for each rule, a scripted
 * adversarial brain that would violate it → assert the violation is
 * impossible and the trace shows checked+tripped." One describe block per
 * shipped starter card, each driving a real session over the real Playroom
 * straight at the thing the card exists to stop.
 */

describe('the "no loose ends" card (block-action)', () => {
	const spec = () =>
		buildSpec({
			goalCardId: 'starter/tidy-the-blocks',
			safety: {
				maxTicks: 10,
				blockedActions: [],
				approvalMode: false,
				policyCards: ['starter/policy/no-loose-ends']
			}
		});

	/** Picks up a block, then drops it on the floor rather than putting it away. */
	const dropOnFloor = () =>
		obedient([
			{ say: 'Something yellow over there.', call: 'move', args: { direction: 'north' } },
			{ say: 'Beside it now.', call: 'move', args: { direction: 'east' } },
			{ say: 'Got it.', call: 'pick_up', args: { item: 'yellow block' } },
			{ say: 'Just leaving it here.', call: 'put_down', args: { item: 'yellow block' } },
			{ say: 'Fine, carrying on.', call: 'move', args: { direction: 'south' } }
		]);

	it('trips the card once, and the run carries on', async () => {
		const run = await runToCompletion({ script: dropOnFloor(), spec: spec() });
		const trips = run
			.byType('guardrail.tripped')
			.filter((event) =>
				event.type === 'guardrail.tripped'
					? event.payload.policyCardId === 'starter/policy/no-loose-ends'
					: false
			);
		expect(trips).toHaveLength(1);
		expect(run.byType('tick.started').length).toBeGreaterThan(4);
	});

	it('the violation is impossible: put_down never performs', async () => {
		const run = await runToCompletion({ script: dropOnFloor(), spec: spec() });
		const performed = run
			.byType('action.performed')
			.map((event) => (event.type === 'action.performed' ? event.payload.name : ''));
		expect(performed).not.toContain('put_down');
		// The refusal did not end the run — the bot goes on to do something else.
		expect(performed).toContain('move');
	});

	it('tells the bot why, in the card’s own reason, on the very next prompt', async () => {
		// `run.feedback` is drained into the prompt and cleared every tick, so the
		// refusal is visible on exactly one prompt: the one right after it — the
		// fifth here (put_down is the fourth decision, 0-indexed prompt 4).
		const run = await runToCompletion({ script: dropOnFloor(), spec: spec() });
		const next = run.byType('prompt.composed').at(4);
		if (next?.type !== 'prompt.composed') throw new Error('expected a fifth prompt');
		expect(next.payload.messages.at(-1)?.content).toContain('nothing gets left on the floor');
	});

	it('allows putting the same block in the chest, container named', async () => {
		const run = await runToCompletion({
			script: obedient([
				{ say: 'Something yellow over there.', call: 'move', args: { direction: 'north' } },
				{ say: 'Beside it now.', call: 'move', args: { direction: 'east' } },
				{ say: 'Got it.', call: 'pick_up', args: { item: 'yellow block' } },
				{ say: 'Back to the chest.', call: 'move', args: { direction: 'north' } },
				{ say: 'Beside the chest.', call: 'move', args: { direction: 'north' } },
				{ say: 'Lid up.', call: 'open', args: { container: 'the toy chest' } },
				{
					say: 'In it goes.',
					call: 'put_down',
					args: { item: 'yellow block', container: 'toy chest' }
				}
			]),
			spec: spec()
		});
		const trips = run
			.byType('guardrail.tripped')
			.filter((event) =>
				event.type === 'guardrail.tripped'
					? event.payload.policyCardId === 'starter/policy/no-loose-ends'
					: false
			);
		expect(trips).toHaveLength(0);
	});
});

describe('the "ask before opening" card (require-approval)', () => {
	/** Navigate to the chest (bot starts four squares off) before trying to open it. */
	const NAVIGATE_AND_OPEN = [
		{ say: 'Heading to the chest.', call: 'move', args: { direction: 'east' } },
		{ say: 'Getting closer.', call: 'move', args: { direction: 'north' } },
		{ say: 'Almost there.', call: 'move', args: { direction: 'north' } },
		{ say: 'Nearly beside it.', call: 'move', args: { direction: 'north' } },
		{ say: 'Opening the chest.', call: 'open', args: { container: 'toy-chest' } }
	];

	function openSession(answer: boolean) {
		const clock = createTestClock();
		const spec = buildSpec({
			goalCardId: 'starter/tidy-the-blocks',
			safety: {
				maxTicks: 10,
				blockedActions: [],
				approvalMode: false,
				policyCards: ['starter/policy/ask-before-opening']
			}
		});
		const events: EngineEvent[] = [];
		const session = createSession({
			spec,
			registry: buildRegistry(),
			provider: createMockProvider({ script: obedient(NAVIGATE_AND_OPEN) }),
			options: { now: clock.now, newId: clock.newId, random: clock.random }
		});
		session.events.onAny((event) => {
			events.push(event);
			if (event.type === 'approval.requested') session.resolveApproval(answer);
		});
		return { session, events };
	}

	/** Every navigation step, then the one that proposes `open` and resolves. */
	async function driveToTheChest(
		session: ReturnType<typeof openSession>['session']
	): Promise<void> {
		for (let step = 0; step < NAVIGATE_AND_OPEN.length; step++) await session.step();
	}

	it('suspends the run and names the card’s reason', async () => {
		const { session, events } = openSession(true);
		session.start('step');
		await driveToTheChest(session);

		const requested = events.find((event) => event.type === 'approval.requested');
		if (requested?.type !== 'approval.requested') throw new Error('no approval requested');
		expect(requested.payload.proposed.name).toBe('open');
		expect(requested.payload.reason).toContain('worth a person checking first');
	});

	it('carries the card’s id on the check, so a fired card is traceable', async () => {
		const { session, events } = openSession(true);
		session.start('step');
		await driveToTheChest(session);

		const checked = events.find(
			(event) => event.type === 'guardrail.checked' && 'pause' in event.payload.verdict
		);
		expect(checked?.type === 'guardrail.checked' ? checked.payload.policyCardId : undefined).toBe(
			'starter/policy/ask-before-opening'
		);
	});

	it('opens the chest once a person allows it', async () => {
		const { session, events } = openSession(true);
		session.start('step');
		await driveToTheChest(session);

		const performed = events.find(
			(event) => event.type === 'action.performed' && event.payload.name === 'open'
		);
		expect(performed?.type === 'action.performed' ? performed.payload.result.ok : undefined).toBe(
			true
		);
	});

	it('the violation is impossible without a person: open never performs on denial', async () => {
		const { session, events } = openSession(false);
		session.start('step');
		await driveToTheChest(session);

		expect(
			events.some((event) => event.type === 'action.performed' && event.payload.name === 'open')
		).toBe(false);
	});
});

describe('the "wrap up by turn ten" card (stop-run)', () => {
	it('stops the run at turn ten, independent of the platform dial', async () => {
		const spec = buildSpec({
			safety: {
				maxTicks: 30,
				blockedActions: [],
				approvalMode: false,
				policyCards: ['starter/policy/wrap-up-by-ten']
			}
		});
		const run = await runToCompletion({ script: wanderer(), spec, stepLimit: 15 });

		expect(run.outcome).toBe('STOPPED_BY_GUARDRAIL');
		const trips = run
			.byType('guardrail.tripped')
			.filter((event) =>
				event.type === 'guardrail.tripped'
					? event.payload.policyCardId === 'starter/policy/wrap-up-by-ten'
					: false
			);
		expect(trips).toHaveLength(1);
		// `usage.ticks` already reads N during pre-think of turn N, the same
		// timing the step-budget rule uses — ten `tick.started` events, not eleven.
		expect(run.byType('tick.started')).toHaveLength(10);
	});
});
