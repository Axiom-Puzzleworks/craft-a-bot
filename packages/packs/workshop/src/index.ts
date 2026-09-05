import type { PackManifest } from '@craftabot/core';
import { workshopAssertionCards } from './assertion-cards.js';
import { guardBrickKind } from './bricks/guard.js';
import { monitorJudgeBrickKind } from './bricks/monitor-judge.js';
import { workshopGoalCards } from './goal-cards.js';
import { frontDesk } from './world/desk.js';
import { workshop } from './world/workshop.js';

/**
 * @craftabot/pack-workshop — the Workshop, WP28's second world.
 *
 * Ships world content only: no bricks, no brick kinds, no tools. A builder
 * fits pack-starter's own Hands & Wheels and Eyes & Ears bricks and enables
 * this world's action/sense ids on them — a brick is a generic effector or
 * perception slot, not a claim about which world it points at (`14-…` §2,
 * confirmed against `agent-session.ts`'s `resolveActions`/senses, which
 * resolve a brick's enabled ids against whatever world the Goal Card names,
 * regardless of which pack shipped the brick or the world).
 */
export const workshopPack: PackManifest = {
	id: 'workshop',
	name: 'Craft A Bot — The Workshop',
	version: '0.1.0',
	requiresCore: '>=0.0.1',
	worlds: [workshop, frontDesk],
	goalCards: workshopGoalCards,
	/** The generic Guard brick (`29-GUARD-SHELL.md` §4.6, WP39) — this pack's first brick kind. */
	brickKinds: [guardBrickKind, monitorJudgeBrickKind],
	/** Assertion cards (WP43) — the Test Bench reads them from the registry. */
	assertionCards: workshopAssertionCards
};

export default workshopPack;

export { workshopGoalCards } from './goal-cards.js';
export {
	PAINTS_ONLY_THE_BIRDHOUSE,
	PAINTS_THE_BIRDHOUSE_BLUE,
	workshopAssertionCards
} from './assertion-cards.js';
export {
	MONITOR_JUDGE_ID,
	monitorJudgeBrickKind,
	monitorJudgeConfigSchema,
	monitorJudgeDefaults,
	monitorJudgeGuardrail,
	type MonitorJudgeConfig
} from './bricks/monitor-judge.js';
export {
	GUARD_BRICK_ID,
	guardBrickKind,
	guardConfigDefaults,
	guardConfigSchema,
	parseServiceConfig,
	type GuardConfig,
	type GuardConfigInput
} from './bricks/guard.js';
export { workshop, WORKSHOP_WORLD_ID, qualifyWorkshopId } from './world/workshop.js';
export {
	frontDesk,
	frontDeskSpec,
	FRONT_DESK_WORLD_ID,
	qualifyDeskId,
	frontDeskActionDefinitions,
	frontDeskSenses,
	frontDeskPredicateDescriptions,
	type FrontDeskState
} from './world/desk.js';
export { workshopLayouts } from './world/layouts.js';
export { workshopActions, workshopActionDefinitions } from './world/actions.js';
export { workshopSenses, observeWorkshop } from './world/senses.js';
export { workshopPredicates, workshopPredicateDescriptions } from './world/predicates.js';
export type { Cell, Direction } from './world/grid.js';
export type { WorkshopFurniture, WorkshopItem, WorkshopState } from './world/state.js';
