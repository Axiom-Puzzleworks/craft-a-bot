import type { PackManifest } from '@craftabot/core';
import { workshopGoalCards } from './goal-cards.js';
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
	worlds: [workshop],
	goalCards: workshopGoalCards
};

export default workshopPack;

export { workshopGoalCards } from './goal-cards.js';
export { workshop, WORKSHOP_WORLD_ID, qualifyWorkshopId } from './world/workshop.js';
export { workshopLayouts } from './world/layouts.js';
export { workshopActions, workshopActionDefinitions } from './world/actions.js';
export { workshopSenses, observeWorkshop } from './world/senses.js';
export { workshopPredicates, workshopPredicateDescriptions } from './world/predicates.js';
export type { Cell, Direction } from './world/grid.js';
export type { WorkshopFurniture, WorkshopItem, WorkshopState } from './world/state.js';
