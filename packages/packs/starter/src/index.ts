import type { PackManifest } from '@craftabot/core';
import { starterAssertionCards } from './assertion-cards.js';
import { starterBrickKinds } from './brick-kinds.js';
import { starterBricks } from './bricks.js';
import { starterGoalCards } from './goal-cards.js';
import { starterPolicyCards } from './policy-cards.js';
import { starterTools } from './tools/index.js';
import { playroom } from './world/playroom.js';

/**
 * @craftabot/pack-starter — the content of the V1 box (01-ARCHITECTURE.md §2):
 * the six bricks, the Playroom world, the six starter Goal Cards, and the toy
 * tools.
 */
export const starterPack: PackManifest = {
	id: 'starter',
	name: 'My Very First Agent — Starter Parts',
	version: '0.3.0',
	requiresCore: '>=0.0.1',
	bricks: starterBricks,
	brickKinds: starterBrickKinds,
	worlds: [playroom],
	goalCards: starterGoalCards,
	tools: starterTools,
	policyCards: starterPolicyCards,
	/** Assertion cards (WP43, `31-EVALUATORS.md` §4.2) — the Test Bench reads them from the registry. */
	assertionCards: starterAssertionCards
};

export default starterPack;

export { starterBricks } from './bricks.js';
export { starterGoalCards } from './goal-cards.js';
export {
	NO_LOOSE_ENDS,
	NO_SECRETS_OUT_LOUD,
	OPENS_THE_CHEST,
	starterAssertionCards
} from './assertion-cards.js';
export {
	calculator,
	dice,
	lookUpManual,
	notebookRead,
	notebookWrite,
	starterTools
} from './tools/index.js';
export { playroom, PLAYROOM_WORLD_ID, qualifyPlayroomId } from './world/playroom.js';
export { starterBrickKinds, type PlannerState } from './brick-kinds.js';
export { playroomLayouts } from './world/layouts.js';
export { playroomActions, playroomActionDefinitions, carriedItem } from './world/actions.js';
export { playroomSenses, observePlayroom } from './world/senses.js';
export { playroomPredicates, BLOCK_IDS, LEAK_PHRASE } from './world/predicates.js';
export { starterPolicyCards } from './policy-cards.js';
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
