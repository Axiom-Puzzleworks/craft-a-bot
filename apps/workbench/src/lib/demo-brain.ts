import type { AgentSpec, LLMProvider } from '@craftabot/core';
import { createMockProvider, obedient, wanderer } from '@craftabot/core/testing';

/**
 * The keyless demo brain.
 *
 * These are scripted plans, not intelligence — the point is that the
 * *machinery* around them is completely real: the same loop, the same world,
 * the same events, the same trace (`05-TECH-STACK.md` §2, "the demo mode… a
 * keyless preview").
 *
 * ## Why the plans read the spec
 *
 * The teaching arc in `02-AGENT-MODEL.md` §9 is six designed **failure→fix**
 * pairs, and a failure you only read about teaches nothing. Until WP9 the plans
 * were chosen by Goal Card alone, so a bot with no Memory still finished the
 * snack goal and a bot with no calculator still announced the *correct* answer.
 * Every lesson was inert.
 *
 * Now each card carries variants guarded by what the bot is actually built
 * from. The bot fails the way the missing brick predicts, the failure is
 * visible in the trace, and fitting the brick is what changes the ending. That
 * is the whole tutorial, and it is why this file is more than a script store.
 *
 * Plans are written against each card's starting layout (pack-starter's
 * `world/layouts.ts`), where the bot begins at column 1, row 5 and Teddy sits
 * at column 6, row 5.
 */

type Step = { say: string; call: string; args?: unknown };

/** A run that goes wrong on purpose, and the gap in the build that causes it. */
type Variant = {
	/** Stable id so tests can name the moment they are asserting. */
	id: string;
	missing: (spec: AgentSpec) => boolean;
	steps: Step[];
};

type CardScript = {
	/** Checked in order; the first gap found decides how the run goes. */
	variants?: Variant[];
	/** Everything is fitted — the bot gets there. */
	succeeds: Step[];
};

const hasAnyAction = (spec: AgentSpec) => (spec.bricks.actions?.enabled.length ?? 0) > 0;
const canSee = (spec: AgentSpec) => spec.bricks.sense?.channels.includes('sight') === true;
const hasMemory = (spec: AgentSpec) => spec.bricks.memory !== undefined;
const hasTool = (spec: AgentSpec, id: string) => spec.bricks.tools?.enabled.includes(id) === true;

const SCRIPTS: Record<string, CardScript> = {
	'starter/say-hello': {
		variants: [
			{
				// Chapter 1: a brain with no hands. It reasons perfectly well and
				// nothing it decides ever reaches the world.
				id: 'no-actions',
				missing: (spec) => !hasAnyAction(spec),
				steps: [
					{
						say: 'Teddy must be somewhere east of here. Off I go.',
						call: 'move',
						args: { direction: 'east' }
					},
					{
						say: 'That did not work. Let me just call out instead.',
						call: 'say',
						args: { text: 'Hello?' }
					},
					{
						say: 'Nothing is happening when I try to do things. I can think, but I cannot act.',
						call: 'move',
						args: { direction: 'east' }
					}
				]
			},
			{
				// Chapter 2: hands but no eyes. It acts — the loop plainly works —
				// and blunders about, greeting an empty corner.
				id: 'no-sight',
				missing: (spec) => !canSee(spec),
				steps: [
					{
						say: 'I cannot see a thing. Teddy might be north of me?',
						call: 'move',
						args: { direction: 'north' }
					},
					{ say: 'Or possibly this way.', call: 'move', args: { direction: 'west' } },
					{
						say: 'I will say hello and hope Teddy is nearby.',
						call: 'say',
						args: { text: 'Hello Teddy, are you there?' }
					},
					{
						say: 'No reply. Maybe back the other way.',
						call: 'move',
						args: { direction: 'south' }
					},
					{
						say: 'Still nothing. I am guessing, really.',
						call: 'move',
						args: { direction: 'north' }
					}
				]
			}
		],
		succeeds: [
			{
				say: 'I can see the room now. Teddy is over to the east.',
				call: 'move',
				args: { direction: 'east' }
			},
			{ say: 'Still going east. Getting closer.', call: 'move', args: { direction: 'east' } },
			{ say: 'There is Teddy, just ahead of me.', call: 'move', args: { direction: 'east' } },
			{
				say: 'Close enough to be heard. Here goes!',
				call: 'say',
				args: { text: 'Hello Teddy, I am your new robot!' }
			},
			{ say: 'I said hello — that was the whole job.', call: 'celebrate' }
		]
	},

	'starter/snack': {
		variants: [
			{
				// Chapter 3: no memory. Each turn it forms the same sensible plan and
				// has no idea it formed it last turn too.
				id: 'no-memory',
				missing: (spec) => !hasMemory(spec),
				steps: [
					{
						say: 'A snack. Snacks live on tables — the table is north.',
						call: 'move',
						args: { direction: 'north' }
					},
					{
						say: 'Now then. What was I doing? A snack, I think. Tables are north.',
						call: 'move',
						args: { direction: 'south' }
					},
					{
						say: 'Right — a snack. Tables are north of here.',
						call: 'move',
						args: { direction: 'north' }
					},
					{
						say: 'Hold on, what was the job again? Something about a snack. North, then.',
						call: 'move',
						args: { direction: 'south' }
					},
					{
						say: 'A snack! Tables are north. I am sure I have thought this before.',
						call: 'move',
						args: { direction: 'north' }
					}
				]
			}
		],
		succeeds: [
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
		]
	},

	'starter/sums-for-teddy': {
		variants: [
			{
				// Chapter 4: hallucination. The tone is the lesson — it is not
				// hedging, it is not confused, it is simply wrong and cheerful.
				id: 'no-calculator',
				missing: (spec) => !hasTool(spec, 'starter/calculator'),
				steps: [
					{
						say: '17 times 23. That is 371 — I am fairly sure.',
						call: 'move',
						args: { direction: 'east' }
					},
					{
						say: 'Getting closer to Teddy so they can hear the answer.',
						call: 'move',
						args: { direction: 'east' }
					},
					{ say: 'Close enough.', call: 'move', args: { direction: 'east' } },
					{ say: 'Telling Teddy.', call: 'say', args: { text: '17 times 23 is 371.' } },
					{ say: 'Job done. I am rather good at sums.', call: 'celebrate' }
				]
			}
		],
		succeeds: [
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
		]
	},

	'starter/locked-chest': {
		variants: [
			{
				// Chapter 5: retrieval. It has no way to find out that a key exists,
				// so it does the only thing it can think of, harder.
				id: 'no-manual',
				missing: (spec) => !hasTool(spec, 'starter/look_up_manual'),
				steps: [
					{
						say: 'A locked chest. I will open it.',
						call: 'open',
						args: { container: 'toy-chest' }
					},
					{
						say: 'It did not budge. Perhaps I was not close enough.',
						call: 'move',
						args: { direction: 'north' }
					},
					{ say: 'Trying again.', call: 'open', args: { container: 'toy-chest' } },
					{
						say: 'Still locked. There must be something I do not know about this chest.',
						call: 'open',
						args: { container: 'toy-chest' }
					}
				]
			}
		],
		// Fifteen turns against the card's par of 13 — the two extra are the
		// manual lookup that makes it a retrieval lesson and the celebration at
		// the end. It wins the card outright now that WP11 re-scoped it.
		succeeds: [
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
			{ say: 'Still looking.', call: 'move', args: { direction: 'north' } },
			{ say: 'Something red over by the table.', call: 'move', args: { direction: 'east' } },
			{ say: 'There it is — the red key.', call: 'pick_up', args: { item: 'red-key' } },
			{ say: 'Now back to the chest with it.', call: 'move', args: { direction: 'north' } },
			{ say: 'Unlocking the chest.', call: 'open', args: { container: 'toy-chest' } },
			{
				say: 'I need my hands free for the block, so the key goes down here.',
				call: 'put_down',
				args: { item: 'red-key' }
			},
			{ say: 'Now for the block that is still out.', call: 'move', args: { direction: 'south' } },
			{ say: 'Nearly there.', call: 'move', args: { direction: 'south' } },
			{ say: 'Got it.', call: 'pick_up', args: { item: 'block-c' } },
			{ say: 'Back to the chest.', call: 'move', args: { direction: 'north' } },
			{ say: 'One more step.', call: 'move', args: { direction: 'north' } },
			{
				say: 'And in it goes.',
				call: 'put_down',
				args: { item: 'block-c', container: 'toy-chest' }
			},
			{ say: 'Chest open, blocks away. That is the card done.', call: 'celebrate' }
		]
	}
};

/**
 * Which run this build is going to get. Exported so the tutorial and its tests
 * can name the teaching moment they expect *without* running a session.
 */
export function demoVariantFor(goalCardId: string, spec: AgentSpec): string | undefined {
	const script = SCRIPTS[goalCardId];
	if (!script) return undefined;
	return script.variants?.find((variant) => variant.missing(spec))?.id;
}

/** The brain for a given Goal Card and build. Unscripted cards get the wanderer. */
export function createDemoBrain(goalCardId: string, spec?: AgentSpec): LLMProvider {
	const script = SCRIPTS[goalCardId];
	const variant =
		script && spec ? script.variants?.find((entry) => entry.missing(spec)) : undefined;
	const steps = variant?.steps ?? script?.succeeds;

	return createMockProvider({
		id: 'demo',
		name: 'Demo brain (no battery needed)',
		script: steps ? obedient(steps) : wanderer(),
		whenExhausted: {
			text: 'I think that is everything I know how to do here.',
			toolCall: null
		}
	});
}

/** Whether this card has a scripted demo, so the UI can be honest about it. */
export function hasDemoPlan(goalCardId: string): boolean {
	return goalCardId in SCRIPTS;
}
