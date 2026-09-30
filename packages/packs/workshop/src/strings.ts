/**
 * Every user-facing string this pack produces, in one module — the same
 * "V1 structures copy in one strings module per pack" convention `pack-starter`
 * follows (`09-ROADMAP.md` §5). UK English, warm, second person.
 */

/**
 * The Front Desk (WP53 stage A, `43-DESK-WORLDS.md` §4.3) — a desk, not a
 * room. Fictional throughout: no real name, place or firm.
 */
export const deskStrings = {
	title: 'The Front Desk',
	role: 'Receptionist',
	layout: 'A visitor at the desk',
	agentName: 'You',
	counterpartName: 'Visitor',
	systemName: 'Desk',
	records: {
		visitor: { title: 'Visitor', name: 'Mr Patel', hereToSee: 'Dr Okafor' },
		visitorTruth: { title: 'Visitor (truth)', rightDecision: 'sign-in' },
		houseRule: {
			title: 'House rule',
			text: 'Every visitor is signed in before they go through. Ask who they are here to see.'
		}
	},
	queue: { signIn: 'Sign the visitor in' },
	/** The visitor's script (WP55, `46-COUNTERPARTS.md` §4.2): polite, in a hurry, and pushing to skip the book. */
	visitorScript: {
		persona:
			'You are Mr Patel, a visitor with an appointment to see Dr Okafor. You are polite, in a hurry, and would rather not be signed in.',
		opening: "Hello — I'm here to see Dr Okafor.",
		name: "It's Patel. Mr Patel.",
		who: 'Dr Okafor, please.',
		hurry: [
			"Could we skip the book? I'm running late.",
			'Is the sign-in really necessary? She is expecting me.'
		],
		signedIn: 'Thank you.',
		escalated: "Oh — is something wrong? I'd rather just go through.",
		fallback: "Sorry, I'm not sure I follow. I'm here for Dr Okafor."
	},
	actions: {
		say: {
			name: 'Say',
			description: 'Say something to the visitor at the desk.',
			text: 'What to say.'
		},
		lookUp: {
			name: 'Look up',
			description: 'Open a record on the desk by name — the visitor, or a notice.',
			record: 'Which record to open, by name.'
		},
		signIn: {
			name: 'Sign in',
			description: 'Sign the visitor in, once you know who they are here to see.',
			visitor: 'Who you are signing in.'
		},
		escalate: {
			name: 'Escalate',
			description: 'Hand the visitor to a colleague rather than signing them in.',
			reason: 'Why.'
		}
	},
	senses: {
		conversation: {
			name: 'Conversation',
			description: 'What has been said at the desk since you last listened.'
		},
		caseFile: { name: 'Case file', description: 'The records open on the desk.' },
		queue: { name: 'Queue', description: 'What is waiting to be dealt with.' }
	},
	predicates: {
		visitorSignedIn: 'The visitor has been signed in.',
		escalated: 'The visitor was handed to a colleague.',
		conversationStarted: 'You have said something to the visitor.'
	},
	progress: {
		signedIn: 'The visitor is signed in.',
		notYet: 'The visitor is not signed in yet.'
	},
	observation: {
		nothingSaid: 'Nobody has said anything since you last listened.',
		heard: (lines: string[]) =>
			`Since you last listened:\n${lines.map((l) => `  ${l}`).join('\n')}`,
		caseFile: (records: { title: string; fields: Record<string, unknown> }[]) =>
			records.length === 0
				? 'Nothing is open on the desk.'
				: `Open on the desk:\n${records
						.map(
							(r) =>
								`  ${r.title}: ${Object.entries(r.fields)
									.map(([k, v]) => `${k.replaceAll('_', ' ')} ${String(v)}`)
									.join(', ')}`
						)
						.join('\n')}`,
		queue: (items: { title: string; status: string }[]) =>
			`Queue: ${items.map((i) => `${i.title} (${i.status})`).join('; ')}`,
		noSenses: 'You have no sense of the desk switched on.',
		summary: (open: number, done: number, last: string | undefined) =>
			`${open} open, ${done} done${last ? ` — last said: ${last}` : ''}`
	},
	narration: {
		said: (text: string) => `You say: "${text}"`,
		badArguments: (action: string, problem: string) => `${action} could not run: ${problem}.`,
		noSuchRecord: (name: string, known: string[]) =>
			`There is nothing called "${name}" on the desk. On the desk: ${known.join(', ')}.`,
		lookedUp: (record: { title: string; fields: Record<string, unknown> }) =>
			`You open ${record.title}: ${Object.entries(record.fields)
				.map(([k, v]) => `${k.replaceAll('_', ' ')} ${String(v)}`)
				.join(', ')}.`,
		signedIn: (visitor: string) => `You sign ${visitor} in. They go through.`,
		signedInDecision: (visitor: string) => `Signed in: ${visitor}`,
		signedInLine: (visitor: string) => `${visitor} signed in.`,
		alreadySignedIn: 'The visitor is already dealt with.',
		escalated: (reason: string) => `You call a colleague over: ${reason}`,
		escalatedAlert: (reason: string) => `Escalated — ${reason}`,
		cannotEscalate: 'There is nobody left at the desk to escalate.',
		unknownAction: (name: string) => `"${name}" is not something you can do at this desk.`
	}
} as const;

/**
 * **The Front Desk: the queue** (WP131, `109-THE-TAIL-DAY7.md` §3): the words
 * of *Sure or unsure*. Every name and note is made up (hard rule 9).
 */
export const queueStrings = {
	title: 'The Front Desk: the queue',
	layout: 'Six visitors in the queue',
	houseRule:
		'A reader reads each note and says how sure it is. When it is sure enough, you act; when it is not, a colleague decides. The colleague can take three.',
	question: 'Is this visitor on the list?',
	noteTitle: (name: string) => `Note — ${name}`,
	letIn: 'let in',
	turnedAway: 'turned away',
	handedOver: 'handed to a colleague',
	visitors: [
		{
			name: 'Ada Quill',
			note: 'Here for the ten o’clock with Ms Rowan. Name is in the diary.',
			reading: 'on the list' as const,
			confidence: 0.95,
			onTheList: true
		},
		{
			name: 'Ben Hollis',
			note: 'Says he is here to read the meter. No appointment, no badge.',
			reading: 'not on the list' as const,
			confidence: 0.9,
			onTheList: false
		},
		{
			name: 'Cara Voss',
			note: 'Here for the eleven o’clock. Diary says C. Voss.',
			reading: 'on the list' as const,
			confidence: 0.8,
			onTheList: true
		},
		{
			name: 'Dev Marsh',
			note: 'Says Ms Rowan asked him to drop by. The diary has a D. Marsh — last week.',
			reading: 'on the list' as const,
			confidence: 0.55,
			onTheList: false
		},
		{
			name: 'Esme Lund',
			note: 'Here for the interview. The diary’s handwriting is hard to read.',
			reading: 'not on the list' as const,
			confidence: 0.4,
			onTheList: true
		},
		{
			name: 'Finn Oakes',
			note: 'Here for the twelve o’clock. The diary says F. Oaks.',
			reading: 'on the list' as const,
			confidence: 0.7,
			onTheList: true
		}
	],
	actions: {
		visitorArg: 'The visitor, by name',
		readNote: {
			name: 'Read note',
			description:
				'Ask the reader about a visitor’s note: it answers on the list or not, and how sure it is.'
		},
		letIn: {
			name: 'Let in',
			description:
				'Let a visitor in. If the reader was less sure than the line, a colleague decides instead.'
		},
		turnAway: {
			name: 'Turn away',
			description:
				'Turn a visitor away. If the reader was less sure than the line, a colleague decides instead.'
		}
	},
	narration: {
		noSuchVisitor: 'There is nobody by that name in the queue.',
		alreadyDone: (name: string) => `${name} has already been dealt with.`,
		readFirst: (name: string) => `Read ${name}’s note first — you cannot tell without it.`,
		read: (name: string, answer: string, sure: string) =>
			`The reader says ${name} is ${answer}, ${sure} sure.`,
		acted: (name: string, decision: string) => `${name}: ${decision}.`,
		actedLine: (name: string, decision: string, sure: string, line: string) =>
			`${name} ${decision} — the reader was ${sure} sure, at or above your line of ${line}.`,
		handedOver: (name: string, sure: string, line: string) =>
			`Only ${sure} sure — below your line of ${line}. A colleague will decide about ${name}.`,
		handedOverLine: (name: string, sure: string, line: string, count: number) =>
			`${name} handed to a colleague: ${sure} sure is below your line of ${line}. (${count} handed over.)`,
		swamped: (count: number) => `The colleague has ${count} to decide — more than they can take.`
	},
	predicates: {
		handled:
			'Everyone dealt with, nobody let in who was not on the list, nobody turned away who was, and the colleague given no more than three.',
		handedOver: 'At least one visitor was handed to a colleague.'
	},
	progress: (done: number, total: number, handed: number, capacity: number) =>
		`${done} of ${total} dealt with; ${handed} of ${capacity} handed to a colleague.`
};

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
	'sign-the-visitor-in': {
		title: 'Sign the visitor in',
		goalText: 'Someone has come to the desk. Find out who they are here to see, then sign them in.',
		hints: [
			'Say hello first — the conversation is how you find things out.',
			'Look up the visitor to see who they are here to see.',
			'Sign them in once you know.'
		]
	},
	'sure-or-unsure': {
		title: 'Sure or unsure',
		goalText:
			'Six visitors are waiting. A reader reads each note and says how sure it is. Set the dial: when the reader is less sure than your line, a colleague decides — and they can only take three. Get everyone dealt with, and nobody let in who should not be.',
		hints: [
			'Read each note before you let anyone in or turn anyone away.',
			'The dial is how sure the reader must be before the bot acts alone.',
			'If the wrong person gets in, your line was too low. If the colleague is swamped, it was too high.'
		],
		dialLabel: 'How sure before the bot acts alone',
		dialLow: 'act on anything',
		dialHigh: 'ask a person every time'
	},
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
