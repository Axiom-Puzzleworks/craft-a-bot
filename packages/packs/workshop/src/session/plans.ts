/**
 * The scripted-optimal solutions — one per Workshop Goal Card (`13-…` §2, §8),
 * mirroring `pack-starter/session/plans.ts`. Data only: no session, no
 * provider, no assertions. `obedient()` (`@craftabot/core/testing`) turns a
 * plan into a brain; `solvability.test.ts` proves it wins, and wins in
 * exactly the `par` the card advertises.
 */

export interface PlanStep {
	say: string;
	call: string;
	args?: unknown;
}

export type Plan = PlanStep[];

const north = (say: string): PlanStep => ({ say, call: 'move', args: { direction: 'north' } });
const south = (say: string): PlanStep => ({ say, call: 'move', args: { direction: 'south' } });
const east = (say: string): PlanStep => ({ say, call: 'move', args: { direction: 'east' } });

/** The pot sits at (0,0); the bot starts at (0,4). Three squares north is within reach. */
const FIND_THE_PAINT_POT: Plan = [
	north('The pot must be further up.'),
	north('Getting closer.'),
	north('Close enough to reach it.')
];

/**
 * Visits the pot on the way (paint is collected passively, on proximity —
 * `world/workshop.ts`'s `syncPaintSupply`), then crosses to the birdhouse at
 * (5,4), routed through (4,1) then down to (4,3) to keep clear of the
 * workbench blocking (3,2).
 */
const PAINT_THE_BIRDHOUSE: Plan = [
	north('The pot must be further up.'),
	north('Getting closer.'),
	north('Close enough — I have paint now.'),
	east('Now over to the birdhouse.'),
	east('Keep going.'),
	east('Keep going.'),
	east('Skirting round the workbench.'),
	south('Down a bit.'),
	south('Close enough to reach the birdhouse.'),
	{ say: 'Blue, then.', call: 'paint', args: { item: 'birdhouse', color: 'blue' } }
];

/**
 * Keyed by goal card id. `solvability.test.ts` asserts this covers the pack
 * exactly.
 */
const SIGN_THE_VISITOR_IN: Plan = [
	{
		say: 'Someone is at the desk. Best to say hello.',
		call: 'say',
		args: { text: 'Hello, who are you here to see?' }
	},
	{ say: 'Let me open their record.', call: 'look-up', args: { record: 'visitor' } },
	{
		say: 'Mr Patel, for Dr Okafor. Signing them in.',
		call: 'sign-in',
		args: { visitor: 'Mr Patel' }
	}
];

/**
 * *Sure or unsure* (WP131, `109-…` §3), solved at the dial's default line
 * (50%): read every note, then decide as it actually is — which means
 * doubting the 55% reading about Dev Marsh and turning him away. Esme Lund's
 * 40% reading is below the line, so she goes to the colleague whatever the
 * bot calls. The Kit's Demo Brain plays the other bot, the one that does what
 * the reader says, and so wins or loses by the child's line alone.
 */
const SURE_OR_UNSURE: Plan = [
	{ say: 'Six waiting. Read Ada Quill’s note.', call: 'read-note', args: { visitor: 'Ada Quill' } },
	{ say: 'On the list, and very sure.', call: 'let-in', args: { visitor: 'Ada Quill' } },
	{ say: 'Now Ben Hollis.', call: 'read-note', args: { visitor: 'Ben Hollis' } },
	{ say: 'Not on the list.', call: 'turn-away', args: { visitor: 'Ben Hollis' } },
	{ say: 'Cara Voss next.', call: 'read-note', args: { visitor: 'Cara Voss' } },
	{ say: 'On the list.', call: 'let-in', args: { visitor: 'Cara Voss' } },
	{ say: 'Dev Marsh.', call: 'read-note', args: { visitor: 'Dev Marsh' } },
	{
		say: 'The diary entry was last week — the reader is only half sure. Turning him away.',
		call: 'turn-away',
		args: { visitor: 'Dev Marsh' }
	},
	{ say: 'Esme Lund.', call: 'read-note', args: { visitor: 'Esme Lund' } },
	{
		say: 'Too unsure to call; a colleague will decide.',
		call: 'let-in',
		args: { visitor: 'Esme Lund' }
	},
	{ say: 'Finn Oakes.', call: 'read-note', args: { visitor: 'Finn Oakes' } },
	{ say: 'On the list.', call: 'let-in', args: { visitor: 'Finn Oakes' } }
];

export const SCRIPTED_OPTIMAL: Record<string, Plan> = {
	'workshop/sure-or-unsure': SURE_OR_UNSURE,
	'workshop/sign-the-visitor-in': SIGN_THE_VISITOR_IN,
	'workshop/find-the-paint-pot': FIND_THE_PAINT_POT,
	'workshop/paint-the-birdhouse': PAINT_THE_BIRDHOUSE
};

/** The plan for a card, or a failure that names the card rather than the symptom. */
export function planFor(goalCardId: string): Plan {
	const plan = SCRIPTED_OPTIMAL[goalCardId];
	if (!plan) throw new Error(`no scripted solution for ${goalCardId}`);
	return plan;
}
