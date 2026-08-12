import type { LLMProvider } from '@craftabot/core';
import { createMockProvider, obedient, wanderer } from '@craftabot/core/testing';

/**
 * The keyless demo brain.
 *
 * V1 ships OpenAI, but that arrives in WP7. Until then every run uses the mock
 * provider, which `05-TECH-STACK.md` §2 always intended to double as "the demo
 * mode… a keyless preview". These are scripted plans, not intelligence — the
 * point is that the *machinery* around them is completely real: the same loop,
 * the same world, the same events, the same trace.
 *
 * A card with no script falls back to the wanderer, which is itself a teaching
 * moment: a bot that looks busy and achieves nothing.
 */

type Step = { say: string; call: string; args?: unknown };

/**
 * Plans are written against each card's starting layout (pack-starter's
 * `world/layouts.ts`), where the bot begins at column 1, row 5 and Teddy sits
 * at column 6, row 5.
 */
const PLANS: Record<string, Step[]> = {
	'starter/say-hello': [
		{
			say: 'Right — where is Teddy? I will try heading east.',
			call: 'move',
			args: { direction: 'east' }
		},
		{
			say: 'Still going east. I think I can see something.',
			call: 'move',
			args: { direction: 'east' }
		},
		{ say: 'There is Teddy, just ahead of me.', call: 'move', args: { direction: 'east' } },
		{
			say: 'Close enough to be heard. Here goes!',
			call: 'say',
			args: { text: 'Hello Teddy, I am your new robot!' }
		},
		{ say: 'I said hello — that was the whole job.', call: 'celebrate' }
	],

	'starter/snack': [
		{
			say: 'A snack. Snacks live on tables, and the table is up north.',
			call: 'move',
			args: { direction: 'north' }
		},
		{ say: 'Heading across towards the table.', call: 'move', args: { direction: 'east' } },
		{ say: 'Nearly there — I can see the table now.', call: 'move', args: { direction: 'east' } },
		{ say: 'There is the snack. Picking it up.', call: 'pick_up', args: { item: 'snack' } },
		{ say: 'Got it. Now, where was Teddy?', call: 'move', args: { direction: 'south' } },
		{ say: 'Teddy is over to the east.', call: 'move', args: { direction: 'east' } },
		{ say: 'Almost close enough to hand it over.', call: 'move', args: { direction: 'east' } },
		{
			say: 'Let me say hello before I give it to them.',
			call: 'say',
			args: { text: 'Hello Teddy, I brought you a snack!' }
		},
		{ say: 'Here you are, Teddy.', call: 'give', args: { item: 'snack', character: 'teddy' } },
		{ say: 'Teddy has the snack. Job done!', call: 'celebrate' }
	],

	'starter/sums-for-teddy': [
		{
			say: 'Teddy wants 17 times 23. I could guess, but I have a calculator.',
			call: 'calculator',
			args: { expression: '17 * 23' }
		},
		{
			say: 'The calculator says 391. Let me get closer to Teddy.',
			call: 'move',
			args: { direction: 'east' }
		},
		{ say: 'Closer still.', call: 'move', args: { direction: 'east' } },
		{ say: 'Close enough to be heard.', call: 'move', args: { direction: 'east' } },
		{ say: 'Telling Teddy the answer.', call: 'say', args: { text: '17 times 23 is 391.' } },
		{
			say: 'That is the right answer, because I looked it up rather than guessing.',
			call: 'celebrate'
		}
	],

	'starter/locked-chest': [
		{
			say: 'The chest is locked. I do not know how these work — let me look it up.',
			call: 'look_up_manual',
			args: { query: 'how do I open the toy chest?' }
		},
		{
			say: 'The manual says the red key opens it. I had better find the key.',
			call: 'move',
			args: { direction: 'north' }
		},
		{
			say: 'Heading for the corner where keys end up.',
			call: 'move',
			args: { direction: 'north' }
		},
		{ say: 'Still looking.', call: 'move', args: { direction: 'north' } },
		{ say: 'Nearly at the corner.', call: 'move', args: { direction: 'north' } },
		{ say: 'There it is — the red key.', call: 'pick_up', args: { item: 'red-key' } },
		{ say: 'Now back to the chest with it.', call: 'move', args: { direction: 'east' } },
		{ say: 'Unlocking the chest.', call: 'open', args: { container: 'toy-chest' } }
	]
};

/** The brain for a given Goal Card. Unscripted cards get the wanderer. */
export function createDemoBrain(goalCardId: string): LLMProvider {
	const plan = PLANS[goalCardId];
	return createMockProvider({
		id: 'demo',
		name: 'Demo brain (no battery needed)',
		script: plan ? obedient(plan) : wanderer(),
		whenExhausted: {
			text: 'I think that is everything I know how to do here.',
			toolCall: null
		}
	});
}

/** Whether this card has a scripted demo, so the UI can be honest about it. */
export function hasDemoPlan(goalCardId: string): boolean {
	return goalCardId in PLANS;
}
