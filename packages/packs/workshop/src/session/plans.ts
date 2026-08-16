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
export const SCRIPTED_OPTIMAL: Record<string, Plan> = {
	'workshop/find-the-paint-pot': FIND_THE_PAINT_POT,
	'workshop/paint-the-birdhouse': PAINT_THE_BIRDHOUSE
};

/** The plan for a card, or a failure that names the card rather than the symptom. */
export function planFor(goalCardId: string): Plan {
	const plan = SCRIPTED_OPTIMAL[goalCardId];
	if (!plan) throw new Error(`no scripted solution for ${goalCardId}`);
	return plan;
}
