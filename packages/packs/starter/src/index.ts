import type { PackManifest } from '@craftabot/core';
import { starterGoalCards } from './goal-cards.js';
import { playroom } from './world/playroom.js';

/**
 * @craftabot/pack-starter — the content of the V1 box (01-ARCHITECTURE.md §2).
 * WP2 ships the Playroom world and the six starter Goal Cards; the five brick
 * definitions and the toy tools join the manifest in later work packages.
 */
export const starterPack: PackManifest = {
	id: 'starter',
	name: 'My Very First Agent — Starter Parts',
	version: '0.1.0',
	requiresCore: '>=0.0.1',
	worlds: [playroom],
	goalCards: starterGoalCards
};

export default starterPack;

export { starterGoalCards } from './goal-cards.js';
export { playroom, PLAYROOM_WORLD_ID } from './world/playroom.js';
export { playroomLayouts } from './world/layouts.js';
export { playroomActions, playroomActionDefinitions, carriedItem } from './world/actions.js';
export { playroomSenses, observePlayroom } from './world/senses.js';
export { playroomPredicates, BLOCK_IDS } from './world/predicates.js';
export { playroomManual, searchManual, type ManualEntry } from './world/manual.js';
export type { Cell, Direction, RelativeDirection } from './world/grid.js';
export type {
	ContainerState,
	ItemLocation,
	PlayroomCharacter,
	PlayroomContainer,
	PlayroomFurniture,
	PlayroomItem,
	PlayroomState,
	SpokenLine,
	StateChange
} from './world/state.js';
