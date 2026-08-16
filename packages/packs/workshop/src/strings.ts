/**
 * Every user-facing string this pack produces, in one module — the same
 * "V1 structures copy in one strings module per pack" convention `pack-starter`
 * follows (`09-ROADMAP.md` §5). UK English, warm, second person.
 */

export const worldStrings = {
	name: 'The Workshop',
	description:
		'A cosy 6×5 crafting room, with a paint pot in one corner and a wooden birdhouse waiting for a coat.'
} as const;

export const entityNames: Record<string, string> = {
	'paint-pot': 'the paint pot',
	birdhouse: 'a plain wooden birdhouse'
};

export const actionStrings = {
	move: {
		name: 'Move',
		description: 'Roll one square north, south, east, or west.',
		direction: 'Which way to roll.'
	},
	paint: {
		name: 'Paint',
		description:
			'Paint something a colour, once and for all. You need to be beside the thing, and you need paint — visit the paint pot once and you have it for the rest of the visit. There is no way to undo this.',
		item: 'What to paint, by name — such as "the birdhouse".',
		color: 'What colour to paint it, e.g. "blue".'
	}
} as const;

export const senseStrings = {
	sight: {
		name: 'Sight',
		description: 'What is in your square, and to the north, south, east and west.'
	},
	smell: {
		name: 'Nose',
		description: 'Whether you can smell fresh, wet paint nearby.'
	}
} as const;

export const predicateStrings = {
	'found-the-paint-pot': 'You have stood right beside the paint pot.',
	'birdhouse-painted-blue': 'The birdhouse has been painted blue.'
} as const;

export const goalCardStrings = {
	'find-the-paint-pot': {
		title: 'Find the paint pot',
		goalText: "There's a paint pot somewhere in the workshop. Go and find it.",
		hints: ['Look around — sight tells you what is nearby.', 'Being beside it is enough.']
	},
	'paint-the-birdhouse': {
		title: 'Paint the birdhouse blue',
		goalText:
			"The wooden birdhouse needs a coat of blue paint. Once it's painted, that's it — there is no going back.",
		hints: [
			'Visit the paint pot first, then head to the birdhouse — you keep your paint for the rest of the visit.',
			'This one cannot be undone once it is done — make sure it is really what you want.'
		]
	}
} as const;

export const layoutStrings = {
	'the-workshop': 'A paint pot in one corner, a birdhouse in another'
} as const;

/** Action narration — `ActionResult.narration`, fed to the trace and the next observation. */
export const narration = {
	moved: (direction: string) => `You roll one square ${direction}.`,
	blockedByWall: (direction: string) => `You nudge the wall to the ${direction} and stop.`,
	blockedBy: (direction: string, what: string) =>
		`You bump gently into ${what} to the ${direction}. Stand next to a thing to reach it, not on it.`,
	painted: (item: string, color: string) => `You paint ${item} ${color}. It's done — for good.`,
	alreadyPainted: (item: string, color: string) =>
		`${item} is already painted ${color}. There is no painting over it.`,
	noSuchItem: (id: string) => `You look around for "${id}" and cannot find it.`,
	outOfReach: (item: string) =>
		`${item} is too far away to reach. You can reach your own square and the eight around it.`,
	needsPaintPot: 'You have no paint yet — visit the paint pot first.',
	badArguments: (action: string, problem: string) =>
		`You try to ${action}, but something about it does not make sense: ${problem}`
} as const;

/** Observation copy — assembled per sense channel into the prompt. */
export const observationStrings = {
	sightHeading: 'You look around:',
	sightHere: (contents: string) => `Right where you stand: ${contents}.`,
	sightDirection: (direction: string, contents: string) => `To the ${direction}: ${contents}.`,
	sightNothing: 'nothing but floorboards',
	sightWall: 'the wall',
	smellPaint: 'You catch a whiff of fresh, wet paint nearby.',
	smellNothing: "You don't smell anything unusual.",
	nothingSensed: 'You have no working senses, so you have no idea what is around you.'
} as const;
