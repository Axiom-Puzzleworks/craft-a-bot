import { predicateStrings } from '../strings.js';
import { findItem, type WorkshopState } from './state.js';

/** The Workshop's two Goal Card success conditions (WP28). The world judges success, not the LLM. */

export type WorkshopPredicate = (state: WorkshopState) => boolean;

function foundThePaintPot(state: WorkshopState): boolean {
	return state.bot.hasPaint;
}

function birdhousePaintedBlue(state: WorkshopState): boolean {
	const birdhouse = findItem(state, 'birdhouse');
	return birdhouse?.painted?.color === 'blue';
}

export const workshopPredicates: Record<string, WorkshopPredicate> = {
	'found-the-paint-pot': foundThePaintPot,
	'birdhouse-painted-blue': birdhousePaintedBlue
};

export const workshopPredicateDescriptions: Record<string, string> = { ...predicateStrings };
