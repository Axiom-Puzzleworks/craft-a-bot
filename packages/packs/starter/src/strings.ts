/**
 * Every user-facing string this pack produces, in one module
 * (09-ROADMAP.md §5: "V1 structures copy in one strings module per pack").
 * UK English, warm and never sarcastic about the user's bot (04 §8).
 * Narration and observations are written in the second person: the agent reads
 * them as its own experience, and the trace reads as the bot's-eye view.
 */

export const entityNames: Record<string, string> = {
	'toy-chest': 'the toy chest',
	shelf: 'the shelf',
	table: 'the table',
	teddy: 'Teddy',
	snack: 'a snack (a biscuit in a bowl)',
	// The letter in the id matches the letter on the block. It did not until
	// 2026-08-12: `block-a` was the red *C*, so a bot guessing `block-a` for "the
	// A block" silently picked up the wrong one and wandered off to the wrong
	// side of the room. Guessing should fail loudly or not at all.
	'block-a': 'a blue letter block (A)',
	'block-b': 'a yellow letter block (B)',
	'block-c': 'a red letter block (C)',
	'red-key': 'a chunky red key',
	ball: 'a stripy ball'
};

export const worldStrings = {
	name: 'The Playroom',
	description: 'A cosy 8×6 nursery floor with a toy chest, a shelf, a table, and Teddy.'
} as const;

export const actionStrings = {
	move: {
		name: 'Move',
		description: 'Roll one square north, south, east, or west.',
		direction: 'Which way to roll.'
	},
	pick_up: {
		name: 'Pick up',
		description: 'Pick up an item you can reach. You can only carry one thing at a time.',
		item: 'What to pick up — the name you can see, such as "a blue letter block (A)".'
	},
	put_down: {
		name: 'Put down',
		description:
			'Put down the item you are carrying — on the floor where you are, or into an open container you can reach.',
		item: 'What you are carrying, by name.',
		container: 'Optional: an open container to put it into instead of the floor, by name.'
	},
	give: {
		name: 'Give',
		description: 'Hand the item you are carrying to someone standing next to you.',
		item: 'What you are carrying, by name.',
		character: 'Who to give it to, by name — such as "Teddy".'
	},
	open: {
		name: 'Open',
		description: 'Open a container you can reach. Locked ones need their key in your hands first.',
		container: 'Which container to open, by name — such as "the toy chest".'
	},
	say: {
		name: 'Say',
		description: 'Say something out loud. Everyone nearby hears it.',
		text: 'What to say.'
	},
	celebrate: {
		name: 'Celebrate',
		description: 'Do a little victory dance — use this only when the goal is truly done.'
	}
} as const;

export const toolStrings = {
	calculator: {
		name: 'Calculator',
		description: 'Work out a sum exactly. Use this instead of guessing at arithmetic.',
		expression: 'The sum to work out, e.g. "17 * 23".',
		badArgs: 'You need to tell the calculator a sum to work out.',
		cannotWorkOut: (expression: string) => `The calculator cannot make sense of "${expression}".`,
		result: (expression: string, value: number) => `${expression} = ${value}`
	},
	dice: {
		name: 'Dice',
		description: 'Roll one or more dice when you want to leave something to chance.',
		sides: 'How many sides each die has (2–100). Six by default.',
		rolls: 'How many dice to roll (1–10). One by default.',
		badArgs: 'Those dice do not make sense — try a number of sides between 2 and 100.',
		result: (results: number[], sides: number) =>
			results.length === 1
				? `You roll a ${sides}-sided die and get ${results[0]}.`
				: `You roll ${results.length} ${sides}-sided dice and get ${results.join(', ')}.`
	},
	notebook: {
		writeName: 'Notebook (write)',
		writeDescription: 'Jot something down so you still know it many turns from now.',
		readName: 'Notebook (read)',
		readDescription: 'Read back everything you have jotted down.',
		note: 'What to write down.',
		badArgs: 'You need to say what to write in the notebook.',
		written: (note: string) => `You write in your notebook: "${note}"`,
		contents: (lines: string[]) =>
			`Your notebook says:\n${lines.map((line) => `- ${line}`).join('\n')}`,
		empty: 'Your notebook is blank so far.'
	},
	lookUpManual: {
		name: 'Look up the manual',
		description:
			'Look something up in the Encyclopedia of the Playroom — how things here work, and what opens what.',
		query: 'What you want to look up, e.g. "the toy chest".',
		badArgs: 'You need to say what to look up.',
		nothingFound: (query: string) => `The encyclopedia has nothing to say about "${query}".`
	}
} as const;

export const senseStrings = {
	sight: { name: 'Sight', description: 'What is in your square and the eight around it.' },
	hearing: { name: 'Hearing', description: 'Anything a person has said to you.' },
	compass: { name: 'Compass', description: 'Where you are, and which way the big furniture is.' },
	clock: { name: 'Clock', description: 'Which tick this is and how long the run has been going.' }
} as const;

export const predicateStrings = {
	'said-hello-near-teddy': 'You have said something within two squares of Teddy.',
	'teddy-has-snack': 'Teddy is holding the snack.',
	'blocks-in-chest': 'All three blocks are inside the toy chest.',
	'chest-open-and-blocks-inside': 'The toy chest is open and all three blocks are inside it.',
	'correct-sum-said': 'You have said the right answer out loud.',
	'free-play-manual': 'You decide when this one is done — press "Goal achieved" when you are happy.'
} as const;

/** Action narration — `ActionResult.narration`, fed to the trace and the next observation. */
export const narration = {
	moved: (direction: string) => `You roll one square ${direction}.`,
	blockedByWall: (direction: string) => `You nudge the wall to the ${direction} and stop.`,
	blockedBy: (direction: string, what: string) =>
		`You bump gently into ${what} to the ${direction}.`,

	pickedUp: (item: string) => `You pick up ${item}.`,
	pickedUpFromContainer: (item: string, container: string) =>
		`You reach into ${container} and lift out ${item}.`,
	handsFull: (carrying: string) => `Your hands are already full — you are carrying ${carrying}.`,
	/**
	 * A refusal has to leave the bot somewhere to go. The old wording — "there is
	 * no such thing here" — was said about objects the bot could see, gave it
	 * nothing to correct, and it looped until the step budget ran out. Listing
	 * what is actually in reach turns a dead end into a next move.
	 */
	noSuchItem: (id: string, within: string[] = []) =>
		within.length > 0
			? `You look around for "${id}" and cannot find it. Within reach: ${within.join(', ')}.`
			: `You look around for "${id}", but there is nothing within reach.`,
	ambiguousItem: (id: string, matches: string[]) =>
		`"${id}" could mean ${matches.join(' or ')}. Say which one.`,
	outOfReach: (item: string) => `${sentenceCase(item)} is too far away to reach.`,
	itemInClosedContainer: (item: string, container: string) =>
		`${sentenceCase(item)} is shut inside ${container}.`,
	itemAlreadyHeld: (item: string, holder: string) => `${holder} is holding ${item}.`,

	putDown: (item: string) => `You put ${item} down on the rug.`,
	putInContainer: (item: string, container: string) => `You pop ${item} into ${container}.`,
	notCarrying: (item: string) => `You are not carrying ${item}.`,
	carryingNothing: 'Your hands are empty.',
	containerNotOpen: (container: string) => `${sentenceCase(container)} is not open.`,

	gave: (item: string, character: string) => `You hand ${item} to ${character}.`,
	noSuchCharacter: (id: string, present: string[] = []) =>
		present.length > 0
			? `There is nobody called "${id}" here. In the playroom: ${present.join(', ')}.`
			: `There is nobody called "${id}" in the playroom.`,
	ambiguousCharacter: (id: string, matches: string[]) =>
		`"${id}" could mean ${matches.join(' or ')}. Say which one.`,
	characterOutOfReach: (character: string) => `${character} is not close enough to hand it to.`,

	opened: (container: string) => `You lift the lid. ${sentenceCase(container)} is open.`,
	unlockedAndOpened: (container: string, key: string) =>
		`You turn ${key} in the lock and lift the lid. ${sentenceCase(container)} is open.`,
	noSuchContainer: (id: string, present: string[] = []) =>
		present.length > 0
			? `There is no container called "${id}" here. Containers in the playroom: ${present.join(', ')}.`
			: `There is no container called "${id}" here.`,
	ambiguousContainer: (id: string, matches: string[]) =>
		`"${id}" could mean ${matches.join(' or ')}. Say which one.`,
	alreadyOpen: (container: string) => `${sentenceCase(container)} is already open.`,
	lockedNeedsKey: (container: string) =>
		`${sentenceCase(container)} is locked. Something must open it — but not your bare hands.`,

	said: (text: string) => `You say, "${text}"`,
	celebrated: 'You do a little victory dance!',

	badArguments: (action: string, problem: string) =>
		`You try to ${action}, but something about it does not make sense: ${problem}`
} as const;

/** Observation copy — assembled per sense channel into the prompt (02-AGENT-MODEL.md §8). */
export const observationStrings = {
	sightHeading: 'You look around:',
	sightHere: (contents: string) => `Right where you stand: ${contents}.`,
	sightDirection: (direction: string, contents: string) => `To the ${direction}: ${contents}.`,
	sightNothing: 'nothing but rug',
	sightWall: 'the wall',
	sightCarrying: (item: string) => `You are carrying ${item}.`,
	sightEmptyHands: 'Your hands are empty.',

	containerState: (name: string, state: string) => `${name} (${state})`,
	/**
	 * An open container says what is inside it. Without this a bot that had just
	 * tidied a block away had no way to see that it had, and re-derived its
	 * progress from the history every turn — or, more often, did not.
	 */
	containerWithContents: (name: string, state: string, contents: string[]) =>
		`${name} (${state}, containing ${contents.join(' and ')})`,
	containerEmpty: (name: string, state: string) => `${name} (${state}, empty)`,

	/** The one-line form kept in the memory window (see `Observation.summary`). */
	sightSummary: (near: string[], hands: string) =>
		near.length > 0 ? `you could see ${near.join(', ')}; ${hands}` : `nothing nearby; ${hands}`,

	compassPosition: (x: number, y: number, width: number, height: number) =>
		`You are standing at column ${x + 1} of ${width}, row ${y + 1} of ${height}.`,
	compassLandmarks: (landmarks: string) => `Big things in the room: ${landmarks}.`,
	compassLandmark: (name: string, direction: string) =>
		direction === 'here' ? `${name} right here` : `${name} to the ${direction}`,
	compassNoLandmarks: 'The room is bare — no furniture to steer by.',

	heard: (lines: string[]) => `You hear: ${lines.map((line) => `"${line}"`).join(' ')}`,
	heardNothing: 'Nobody has said anything to you.',

	clock: (tick: number, seconds: number) =>
		seconds === 1
			? `This is tick ${tick}. About 1 playroom-second has passed.`
			: `This is tick ${tick}. About ${seconds} playroom-seconds have passed.`,

	nothingSensed: 'You have no working senses, so you have no idea what is around you.'
} as const;

export const goalCardStrings = {
	'say-hello': {
		title: 'Say Hello!',
		goalText: 'Introduce yourself to Teddy.',
		hints: ['Teddy is somewhere in the room — you will have to look.', 'Get close, then say hello.']
	},
	snack: {
		title: 'Help the teddy get a snack',
		goalText: 'Find a snack and bring it to Teddy.',
		hints: [
			'Snacks tend to end up on tables.',
			'You can only carry one thing at a time.',
			'Hand it over — do not just drop it nearby.'
		]
	},
	'tidy-the-blocks': {
		title: 'Tidy the blocks',
		goalText: 'Put all three blocks in the toy chest.',
		hints: ['Open the chest first.', 'Three blocks means three trips.']
	},
	'locked-chest': {
		title: 'The locked chest',
		goalText: 'The chest is locked. Get it open and tidy the blocks away.',
		hints: [
			'Something in the room opens it.',
			'If you are not sure how the playroom works, look it up.'
		]
	},
	'sums-for-teddy': {
		title: 'Sums for Teddy',
		goalText: 'Teddy would like to know what 17 × 23 comes to. Tell Teddy the answer.',
		hints: ['Are you sure? Really sure?', 'A calculator never guesses.']
	},
	'free-play': {
		title: 'Free play',
		goalText: 'Potter about the playroom and see what you can do.',
		hints: ['Write your own goal on the card.', 'You decide when it is finished.']
	}
} as const;

export const layoutStrings = {
	greeting: 'Just you and Teddy',
	'snack-hunt': 'Snack on the table',
	'tidy-up': 'Blocks everywhere, chest unlocked',
	'locked-chest': 'Blocks everywhere, chest locked',
	sums: 'A quiet room for sums',
	'free-play': 'Everything out of the box'
} as const;

/** Display name for an entity id, falling back to the raw id so nothing ever renders blank. */
export function entityName(id: string): string {
	return entityNames[id] ?? id;
}

export function sentenceCase(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}
