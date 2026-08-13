import { createSession, type Guardrail } from '@craftabot/core';
import {
	createMockProvider,
	createTestClock,
	mumbling,
	obedient,
	turn,
	wanderer
} from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { buildRegistry, buildSpec, runToCompletion } from './harness.js';

/**
 * Every terminal state is a first-class outcome with its own end card
 * (02-AGENT-MODEL.md §5), so every one of them gets a test.
 */

const alwaysStop: Guardrail = {
	id: 'test/always-stop',
	name: 'Always Stop',
	description: 'Refuses everything, to prove the disposition works.',
	hooks: ['pre-think'],
	check: () => ({ allow: false, reason: 'Testing the stop disposition.', disposition: 'stop-run' })
};

const blockOpening: Guardrail = {
	id: 'test/no-opening',
	name: 'No Opening Things',
	description: 'Blocks the open action but lets the run continue.',
	hooks: ['pre-act'],
	check: (ctx) =>
		ctx.proposed?.name === 'open'
			? {
					allow: false,
					reason: 'Opening the chest is not allowed today.',
					disposition: 'block-action'
				}
			: { allow: true }
};

const askFirst: Guardrail = {
	id: 'test/ask-first',
	name: 'Ask First',
	description: 'Pauses for human approval before any action.',
	hooks: ['pre-act'],
	check: () => ({ pause: true, reason: 'A grown-up should check this first.' })
};

describe('OUT_OF_STEPS', () => {
	it('ends the run when the tick budget is spent', async () => {
		const run = await runToCompletion({ script: wanderer(), maxTicks: 5 });
		expect(run.outcome).toBe('OUT_OF_STEPS');
		expect(run.byType('tick.started')).toHaveLength(5);
	});

	/**
	 * The Safety Brick's dial used to be enforced here, as a budget. WP8 moved it
	 * to the `safety/step-budget` guardrail so a run stopped by the builder's own
	 * rule gets a different outcome and end card from one stopped by the platform
	 * — see `safety-brick.test.ts`. What is left in the engine is the floor.
	 *
	 * > **Amended 2026-08-13 (WP14 slice 3d):** this used to be phrased as *"a
	 * > brick is fitted but its rules are not"*, and ran a bot with a dial of 3 to
	 * > prove it still went 30 ticks. That state cannot happen any more, and its
	 * > existence was the bug: whether a fitted brick's rules ran depended on
	 * > whether the host remembered to compile them, so a brick on the baseplate
	 * > could be pure decoration. Bricks install their own rules now, and that bot
	 * > correctly stops at 3 with `STOPPED_BY_GUARDRAIL`.
	 * >
	 * > What is still worth pinning is the floor itself, so it is pinned in the
	 * > one case that still reaches it: nobody set a limit at all.
	 */
	it('falls back to the engine floor when nothing sets a limit', async () => {
		const run = await runToCompletion({
			script: wanderer(),
			spec: buildSpec({ safety: null })
		});
		expect(run.outcome).toBe('OUT_OF_STEPS');
		expect(run.byType('tick.started')).toHaveLength(30);
	});

	/** The other half of that amendment: a fitted dial now genuinely governs. */
	it('lets a fitted brick’s own rule stop the run before the floor', async () => {
		const run = await runToCompletion({
			script: wanderer(),
			spec: buildSpec({ safety: { maxTicks: 3, blockedActions: [], approvalMode: false } })
		});
		expect(run.outcome).toBe('STOPPED_BY_GUARDRAIL');
		expect(run.byType('tick.started').length).toBeLessThan(30);
	});
});

describe('STOPPED_BY_GUARDRAIL', () => {
	it('stops the run on a stop-run verdict, and records the trip', async () => {
		const run = await runToCompletion({ script: wanderer(), guardrails: [alwaysStop] });

		expect(run.outcome).toBe('STOPPED_BY_GUARDRAIL');
		const tripped = run.byType('guardrail.tripped').at(0);
		if (tripped?.type !== 'guardrail.tripped')
			throw new Error('expected a guardrail.tripped event');
		expect(tripped.payload.guardrailId).toBe('test/always-stop');
		expect(tripped.payload.disposition).toBe('stop-run');
	});

	it('records passing checks too, so the trace shows governance working', async () => {
		const run = await runToCompletion({
			script: obedient([{ say: 'Off I go.', call: 'move', args: { direction: 'east' } }]),
			guardrails: [blockOpening],
			maxTicks: 2
		});
		expect(run.byType('guardrail.checked').length).toBeGreaterThan(0);
		expect(run.byType('guardrail.tripped')).toHaveLength(0);
	});
});

describe('a blocked action', () => {
	it('does not stop the run, and tells the agent why in the next observation', async () => {
		const run = await runToCompletion({
			script: obedient([
				{ say: 'Let me open the chest.', call: 'open', args: { container: 'toy-chest' } },
				{ say: 'Fine, I will move instead.', call: 'move', args: { direction: 'east' } }
			]),
			spec: buildSpec({ goalCardId: 'starter/tidy-the-blocks' }),
			guardrails: [blockOpening],
			maxTicks: 2
		});

		expect(run.outcome).toBe('OUT_OF_STEPS');
		expect(run.byType('guardrail.tripped')).toHaveLength(1);
		// The refusal is fed back into the agent's very next prompt (08 §2).
		const secondPrompt = run.byType('prompt.composed').at(1);
		if (secondPrompt?.type !== 'prompt.composed') throw new Error('expected a second prompt');
		expect(secondPrompt.payload.messages.at(-1)?.content).toContain('a safety rule stopped you');
	});
});

describe('STOPPED_BY_USER', () => {
	it('ends the run when the user pulls STOP between ticks', async () => {
		const clock = createTestClock();
		const session = createSession({
			spec: buildSpec(),
			registry: buildRegistry(),
			provider: createMockProvider({ script: wanderer() }),
			guardrails: [],
			options: { now: clock.now, newId: clock.newId, random: clock.random }
		});

		session.start('step');
		await session.step();
		session.stop('user pressed stop');

		expect(session.status).toBe('finished');
	});

	it('ends the run when STOP lands during a tick', async () => {
		const clock = createTestClock();
		const session = createSession({
			spec: buildSpec(),
			registry: buildRegistry(),
			provider: createMockProvider({
				script: () => turn('Thinking...', 'move', { direction: 'east' })
			}),
			guardrails: [],
			options: { now: clock.now, newId: clock.newId, random: clock.random }
		});

		session.start('step');
		const pending = session.step();
		session.stop();
		const result = await pending;

		expect(result.outcome).toBe('STOPPED_BY_USER');
		expect(session.status).toBe('finished');
	});
});

describe('ERROR', () => {
	it('ends the run and records the failure when the provider throws', async () => {
		const run = await runToCompletion({
			script: [],
			provider: {
				id: 'exploding',
				name: 'Exploding brain',
				keyRequirement: 'none',
				validateKey: () => Promise.resolve({ ok: false, message: 'no' }),
				chat: () => Promise.reject(new Error('the brain factory is on fire'))
			}
		});

		expect(run.outcome).toBe('ERROR');
		const error = run.byType('error').at(0);
		if (error?.type !== 'error') throw new Error('expected an error event');
		expect(error.payload.message).toContain('brain factory');
	});
});

describe('the malformed-output re-prompt rule (03-UI-UX-DESIGN.md §9)', () => {
	it('re-prompts exactly once, then recovers', async () => {
		// Mumbles on turn 0, pulls itself together on turn 1 — the re-prompt.
		const run = await runToCompletion({
			script: mumbling(1),
			spec: buildSpec({ goalCardId: 'starter/say-hello' }),
			maxTicks: 1
		});

		// Two provider calls inside a single tick: the original and the re-prompt.
		expect(run.byType('tick.started')).toHaveLength(1);
		expect(run.byType('think.started')).toHaveLength(2);
		const prompts = run.byType('prompt.composed');
		expect(prompts).toHaveLength(2);
		const second = prompts.at(1);
		if (second?.type !== 'prompt.composed') throw new Error('expected a second prompt');
		expect(second.payload.messages.at(-1)?.content).toContain('Your last reply was empty');
	});

	it('counts a wasted tick when the bot mumbles twice', async () => {
		const run = await runToCompletion({
			script: mumbling(),
			spec: buildSpec({ goalCardId: 'starter/say-hello' }),
			maxTicks: 1
		});

		expect(run.byType('think.started')).toHaveLength(2);
		const decision = run.byType('decision').at(0);
		if (decision?.type !== 'decision') throw new Error('expected a decision event');
		expect(decision.payload.call).toBeNull();
		expect(decision.payload.thought).toBe('');
		expect(run.byType('action.performed')).toHaveLength(0);
		expect(run.outcome).toBe('OUT_OF_STEPS');
	});
});

describe('the approval flow', () => {
	it('pauses for a human, then acts when approved', async () => {
		const clock = createTestClock();
		const session = createSession({
			spec: buildSpec({ goalCardId: 'starter/say-hello' }),
			registry: buildRegistry(),
			provider: createMockProvider({
				script: () => turn('Off to the east.', 'move', { direction: 'east' })
			}),
			guardrails: [askFirst],
			options: { now: clock.now, newId: clock.newId, random: clock.random }
		});

		const seen: string[] = [];
		session.events.onAny((event) => seen.push(event.type));

		// Wait on the event rather than on a microtask — this is exactly how the
		// UI will learn that the run needs a human.
		const asked = new Promise<void>((resolve) => {
			session.events.on('approval.requested', () => resolve());
		});

		session.start('step');
		const pending = session.step();
		await asked;
		// The tick is suspended mid-flight, waiting on a person.
		expect(session.status).toBe('awaiting-approval');

		session.resolveApproval(true);
		await pending;

		expect(seen).toContain('approval.requested');
		expect(seen).toContain('approval.resolved');
		expect(seen).toContain('action.performed');
	});

	it('skips the action and explains itself when denied', async () => {
		const clock = createTestClock();
		const session = createSession({
			spec: buildSpec({ goalCardId: 'starter/say-hello' }),
			registry: buildRegistry(),
			provider: createMockProvider({
				script: () => turn('Off to the east.', 'move', { direction: 'east' })
			}),
			guardrails: [askFirst],
			options: { now: clock.now, newId: clock.newId, random: clock.random }
		});

		const seen: string[] = [];
		session.events.onAny((event) => seen.push(event.type));

		const asked = new Promise<void>((resolve) => {
			session.events.on('approval.requested', () => resolve());
		});

		session.start('step');
		const pending = session.step();
		await asked;
		session.resolveApproval(false);
		await pending;

		expect(seen).toContain('approval.resolved');
		expect(seen).not.toContain('action.performed');
	});
});

describe('play mode', () => {
	it('runs ticks continuously until the goal is met', async () => {
		const clock = createTestClock();
		const session = createSession({
			spec: buildSpec({ goalCardId: 'starter/say-hello' }),
			registry: buildRegistry(),
			provider: createMockProvider({
				script: obedient([
					{ say: 'East.', call: 'move', args: { direction: 'east' } },
					{ say: 'East again.', call: 'move', args: { direction: 'east' } },
					{ say: 'And again.', call: 'move', args: { direction: 'east' } },
					{ say: 'Hello!', call: 'say', args: { text: 'Hello Teddy!' } }
				])
			}),
			guardrails: [],
			options: { now: clock.now, newId: clock.newId, random: clock.random }
		});

		const finished = new Promise<string>((resolve) => {
			session.events.on('run.finished', (event) => resolve(event.payload.outcome));
		});

		session.start('play');
		expect(await finished).toBe('SUCCESS');
		expect(session.status).toBe('finished');
	});
});
