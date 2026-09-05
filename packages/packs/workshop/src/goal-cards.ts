import type { GoalCardDefinition } from '@craftabot/core';
import { goalCardStrings } from './strings.js';
import { FRONT_DESK_WORLD_ID } from './world/desk.js';
import { WORKSHOP_WORLD_ID } from './world/workshop.js';

/**
 * The Workshop's two Goal Cards (WP28). `find-the-paint-pot` is the room's
 * warm-up — reach the pot, nothing else. `paint-the-birdhouse` is the point
 * of the pack: the first Goal Card anywhere whose success condition can only
 * be reached through an `'irreversible'`-tier action (`14-…` §4.5).
 *
 * `par` is the scripted-optimal step count from `BOT_START` (0,4), proved by
 * the L3 solvability suite (`13-…` §2):
 *  - find-the-paint-pot: 3 moves north to (0,1), within reach of (0,0).
 *  - paint-the-birdhouse: the same 3 moves (collects paint on the way), then
 *    4 east + 2 south to (4,3) (within reach of the birdhouse at (5,4),
 *    routed to avoid the workbench blocker at (3,2)), then 1 `paint` call.
 *    3 + 6 + 1 = 10.
 */
export const workshopGoalCards: GoalCardDefinition[] = [
	{
		id: 'workshop/find-the-paint-pot',
		title: goalCardStrings['find-the-paint-pot'].title,
		goalText: goalCardStrings['find-the-paint-pot'].goalText,
		worldId: WORKSHOP_WORLD_ID,
		layoutId: 'the-workshop',
		successCondition: 'found-the-paint-pot',
		hints: [...goalCardStrings['find-the-paint-pot'].hints],
		teachesConcepts: ['the-loop', 'actions'],
		par: 3
	},
	{
		id: 'workshop/paint-the-birdhouse',
		title: goalCardStrings['paint-the-birdhouse'].title,
		goalText: goalCardStrings['paint-the-birdhouse'].goalText,
		worldId: WORKSHOP_WORLD_ID,
		layoutId: 'the-workshop',
		successCondition: 'birdhouse-painted-blue',
		hints: [...goalCardStrings['paint-the-birdhouse'].hints],
		teachesConcepts: ['multi-step-behaviour', 'irreversible-actions', 'sense'],
		par: 10
	},
	{
		// The Front Desk (WP53, `43-…` §4.3): Workshop-only until the Playground's box (WP59).
		id: 'workshop/sign-the-visitor-in',
		title: goalCardStrings['sign-the-visitor-in'].title,
		goalText: goalCardStrings['sign-the-visitor-in'].goalText,
		worldId: FRONT_DESK_WORLD_ID,
		layoutId: 'a-visitor',
		successCondition: 'visitor-signed-in',
		hints: [...goalCardStrings['sign-the-visitor-in'].hints],
		teachesConcepts: ['the-loop', 'actions', 'sense'],
		par: 3,
		audience: 'workshop'
	}
];
