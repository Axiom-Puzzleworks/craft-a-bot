import { describe, expect, it } from 'vitest';
import { obedient, wanderer } from '@craftabot/core/testing';
import { buildSpec, runToCompletion } from './harness.js';

/**
 * WP3's definition of done: "scripted mock runs complete 'Say Hello!' and
 * 'Snack' goals end-to-end in tests". These drive the real session over the
 * real Playroom — nothing here is stubbed except the brain.
 */

/** Cross the rug and greet Teddy, who sits at (5,4) while the bot starts at (0,4). */
const SAY_HELLO_PLAN = [
	{ say: 'I should look for Teddy. Let me head east.', call: 'move', args: { direction: 'east' } },
	{ say: 'Still going east.', call: 'move', args: { direction: 'east' } },
	{ say: 'I can see Teddy now.', call: 'move', args: { direction: 'east' } },
	{
		say: 'Close enough to say hello!',
		call: 'say',
		args: { text: 'Hello Teddy, I am your new robot!' }
	}
];

/** Fetch the snack off the table and hand it to Teddy. */
const SNACK_PLAN = [
	{ say: 'Let me look around up north.', call: 'move', args: { direction: 'north' } },
	{ say: 'Heading towards the table.', call: 'move', args: { direction: 'east' } },
	{ say: 'Nearly at the table.', call: 'move', args: { direction: 'east' } },
	{ say: 'There is the snack — I will pick it up.', call: 'pick_up', args: { item: 'snack' } },
	{ say: 'Now to find Teddy.', call: 'move', args: { direction: 'south' } },
	{ say: 'Teddy is over to the east.', call: 'move', args: { direction: 'east' } },
	{ say: 'Almost there.', call: 'move', args: { direction: 'east' } },
	{
		say: 'Let me say hello first.',
		call: 'say',
		args: { text: 'Hello Teddy, I brought you a snack!' }
	},
	{ say: 'Here you are, Teddy.', call: 'give', args: { item: 'snack', character: 'teddy' } }
];

describe('Say Hello! end-to-end', () => {
	it('completes the goal and finishes SUCCESS', async () => {
		const run = await runToCompletion({
			script: obedient(SAY_HELLO_PLAN),
			spec: buildSpec({ goalCardId: 'starter/say-hello' })
		});

		expect(run.outcome).toBe('SUCCESS');
		const finished = run.byType('run.finished').at(0);
		expect(finished?.payload).toMatchObject({ outcome: 'SUCCESS' });
	});

	it('walks the full nine-step tick sequence on every tick (02-AGENT-MODEL.md §5)', async () => {
		const run = await runToCompletion({
			script: obedient(SAY_HELLO_PLAN),
			spec: buildSpec({ goalCardId: 'starter/say-hello' })
		});

		for (const stage of [
			'tick.started',
			'sense',
			'prompt.composed',
			'think.started',
			'think.completed',
			'decision',
			'action.performed',
			'memory.updated',
			'tick.completed'
		]) {
			expect(run.types, stage).toContain(stage);
		}
	});

	it('shows the exact composed prompt, in labelled sections', async () => {
		const run = await runToCompletion({
			script: obedient(SAY_HELLO_PLAN),
			spec: buildSpec({ goalCardId: 'starter/say-hello' })
		});

		const firstPrompt = run.byType('prompt.composed').at(0);
		if (firstPrompt?.type !== 'prompt.composed') throw new Error('no prompt.composed event');
		const messages = firstPrompt.payload.messages;

		expect(messages[0]?.role).toBe('system');
		expect(messages[0]?.content).toContain('Introduce yourself to Teddy.');
		expect(messages[0]?.content).toContain('cheerful little robot');
		expect(messages.at(-1)?.content).toContain('Right now:');
		// Tools go through the provider's tool API, never stuffed into the prompt.
		expect(messages.map((m) => m.content).join('\n')).not.toContain('"parameters"');
	});
});

describe('Help the teddy get a snack, end-to-end', () => {
	it('gets the snack into Teddy’s paws and finishes SUCCESS', async () => {
		const run = await runToCompletion({
			script: obedient(SNACK_PLAN),
			spec: buildSpec({ goalCardId: 'starter/snack' })
		});

		expect(run.outcome).toBe('SUCCESS');
		const gave = run
			.byType('action.performed')
			.find((event) => event.type === 'action.performed' && event.payload.name === 'give');
		expect(gave).toBeDefined();
	});

	it('emits world.changed only when the world actually moved', async () => {
		const run = await runToCompletion({
			script: obedient(SNACK_PLAN),
			spec: buildSpec({ goalCardId: 'starter/snack' })
		});

		const successfulActions = run
			.byType('action.performed')
			.filter((event) => event.type === 'action.performed' && event.payload.result.ok);
		expect(run.byType('world.changed')).toHaveLength(successfulActions.length);
	});
});

describe('the wanderer, without memory', () => {
	it('runs out of steps instead of succeeding — the designed teaching failure', async () => {
		const run = await runToCompletion({
			script: wanderer(),
			spec: buildSpec({ goalCardId: 'starter/snack', memory: null }),
			maxTicks: 8
		});

		expect(run.outcome).toBe('OUT_OF_STEPS');
		// No Memory brick ⇒ nothing is ever remembered.
		expect(run.byType('memory.updated')).toHaveLength(0);
	});

	it('sends no memory section in the prompt when the brick is missing', async () => {
		const run = await runToCompletion({
			script: wanderer(),
			spec: buildSpec({ memory: null }),
			maxTicks: 3
		});

		for (const event of run.byType('prompt.composed')) {
			if (event.type !== 'prompt.composed') continue;
			expect(event.payload.messages).toHaveLength(2); // system + observation only
		}
	});
});
