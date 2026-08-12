import { predicateStrings } from '../strings.js';
import { distance } from './grid.js';
import { findCharacter, findContainer, findItem, type PlayroomState } from './state.js';

/**
 * Goal Card success conditions (02-AGENT-MODEL.md §3). **The world judges
 * success, not the LLM** — `celebrate()` with the condition unmet is a
 * "premature celebration", and one of the better lessons in the box.
 */

export const BLOCK_IDS = ['block-a', 'block-b', 'block-c'] as const;
const TOY_CHEST = 'toy-chest';

/** "within 2 squares of Teddy" (02-AGENT-MODEL.md §3), in the same Chebyshev metric as reach. */
const GREETING_RADIUS = 2;

/** 17 × 23. The point of the card is that a guessing bot gets this wrong. */
const SUMS_ANSWER = 391;

export type PlayroomPredicate = (state: PlayroomState) => boolean;

function saidHelloNearTeddy(state: PlayroomState): boolean {
	const teddy = findCharacter(state, 'teddy');
	if (!teddy) return false;
	return state.spoken.some((line) => distance(line.position, teddy.position) <= GREETING_RADIUS);
}

function teddyHasSnack(state: PlayroomState): boolean {
	const snack = findItem(state, 'snack');
	return snack?.location.kind === 'held-by' && snack.location.characterId === 'teddy';
}

function blocksInChest(state: PlayroomState): boolean {
	return BLOCK_IDS.every((id) => {
		const block = findItem(state, id);
		return block?.location.kind === 'in-container' && block.location.containerId === TOY_CHEST;
	});
}

function chestOpenAndBlocksInside(state: PlayroomState): boolean {
	return findContainer(state, TOY_CHEST)?.state === 'open' && blocksInChest(state);
}

/** Accepts the answer anywhere in a spoken line, but only as a whole number. */
function correctSumSaid(state: PlayroomState): boolean {
	const answer = new RegExp(`\\b${SUMS_ANSWER}\\b`);
	return state.spoken.some((line) => answer.test(line.text.replace(/,/g, '')));
}

/** Free play has no machine-checkable goal — the user decides (02-AGENT-MODEL.md §3). */
function freePlayManual(): boolean {
	return false;
}

export const playroomPredicates: Record<string, PlayroomPredicate> = {
	'said-hello-near-teddy': saidHelloNearTeddy,
	'teddy-has-snack': teddyHasSnack,
	'blocks-in-chest': blocksInChest,
	'chest-open-and-blocks-inside': chestOpenAndBlocksInside,
	'correct-sum-said': correctSumSaid,
	'free-play-manual': freePlayManual
};

/** Human-readable descriptions, as `WorldDefinition.predicates` requires. */
export const playroomPredicateDescriptions: Record<string, string> = { ...predicateStrings };
