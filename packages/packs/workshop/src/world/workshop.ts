import type {
	ActionCall,
	ActionResult,
	Observation,
	WorldDefinition,
	WorldInstance,
	WorldState
} from '@craftabot/core';
import { worldStrings } from '../strings.js';
import { findAction, unknownActionNarration, workshopActionDefinitions } from './actions.js';
import { withinReach } from './grid.js';
import { workshopLayouts } from './layouts.js';
import { workshopPredicateDescriptions, workshopPredicates } from './predicates.js';
import { observeWorkshop, workshopSenses } from './senses.js';
import { findFurniture, type WorkshopState } from './state.js';

export const WORKSHOP_WORLD_ID = 'workshop/the-workshop';

/** Qualifies this world's own content ids (E6, `14-…` §3) — the Playroom's own convention. */
export const qualifyWorkshopId = (localId: string): string => `${WORKSHOP_WORLD_ID}/${localId}`;

/**
 * The pot is bottomless and paint, once had, is never lost — so "have you
 * ever stood beside the pot" is checked passively after every action, not
 * gated behind a pickup action of its own.
 */
function syncPaintSupply(state: WorkshopState): void {
	if (state.bot.hasPaint) return;
	const paintPot = findFurniture(state, 'paint-pot');
	if (paintPot && withinReach(state.bot.position, paintPot.position)) {
		state.bot.hasPaint = true;
	}
}

function createWorkshopInstance(layoutId: string): WorldInstance {
	const layout = workshopLayouts.find((candidate) => candidate.id === layoutId);
	if (!layout) {
		throw new Error(
			`Unknown Workshop layout "${layoutId}". Known layouts: ${workshopLayouts
				.map((candidate) => candidate.id)
				.join(', ')}.`
		);
	}

	const initial = layout.initialState as WorkshopState;
	let state: WorkshopState = structuredClone(initial);
	syncPaintSupply(state);

	return {
		snapshot(): WorldState {
			return structuredClone(state);
		},

		observe(channels): Observation {
			return observeWorkshop(state, [...channels]);
		},

		perform(action: ActionCall): ActionResult {
			state.tick += 1;
			const handler = findAction(action.name);
			if (!handler) {
				return { ok: false, narration: unknownActionNarration(action.name), stateDiff: [] };
			}
			const outcome = handler.perform(state, action.arguments);
			syncPaintSupply(state);
			return { ok: outcome.ok, narration: outcome.narration, stateDiff: outcome.stateDiff };
		},

		test(predicate): boolean {
			const check = workshopPredicates[predicate];
			return check ? check(state) : false;
		},

		reset(): void {
			state = structuredClone(initial);
			syncPaintSupply(state);
		}
	};
}

export const workshop: WorldDefinition = {
	id: WORKSHOP_WORLD_ID,
	name: worldStrings.name,
	layouts: workshopLayouts,
	actions: workshopActionDefinitions.map((action) => ({
		...action,
		id: qualifyWorkshopId(action.id)
	})),
	senses: workshopSenses.map((sense) => ({ ...sense, id: qualifyWorkshopId(sense.id) })),
	predicates: workshopPredicateDescriptions,
	create: createWorkshopInstance
};
