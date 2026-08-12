import type {
	ActionCall,
	ActionResult,
	Observation,
	WorldDefinition,
	WorldInstance,
	WorldState
} from '@craftabot/core';
import { worldStrings } from '../strings.js';
import { findAction, playroomActionDefinitions, unknownActionNarration } from './actions.js';
import { playroomLayouts } from './layouts.js';
import {
	playroomPredicateDescriptions,
	playroomPredicates,
	playroomProgress
} from './predicates.js';
import { observePlayroom, playroomSenses } from './senses.js';
import type { PlayroomState } from './state.js';

export const PLAYROOM_WORLD_ID = 'starter/playroom';

/**
 * The Playroom (02-AGENT-MODEL.md §4): an 8×6 turn-based grid world with zero
 * randomness — every source of it lives in the `dice` tool instead (hard rule 5).
 * That is what makes a recorded action list replay to an identical final state,
 * which is the reproducibility purpose 2 depends on (08-GOVERNANCE-GUARDRAILS.md §4).
 */
function createPlayroomInstance(layoutId: string): WorldInstance {
	const layout = playroomLayouts.find((candidate) => candidate.id === layoutId);
	if (!layout) {
		throw new Error(
			`Unknown Playroom layout "${layoutId}". Known layouts: ${playroomLayouts
				.map((candidate) => candidate.id)
				.join(', ')}.`
		);
	}

	// Cast: core types `WorldLayout.initialState` as the deliberately opaque
	// `WorldState`; the Playroom authored these layouts and knows their real shape.
	const initial = layout.initialState as PlayroomState;
	// That template is shared by every instance, so the first state and every
	// reset take a fresh deep copy of it.
	let state: PlayroomState = structuredClone(initial);

	return {
		snapshot(): WorldState {
			return structuredClone(state);
		},

		observe(channels): Observation {
			return observePlayroom(state, [...channels]);
		},

		perform(action: ActionCall): ActionResult {
			// Turn-based: the clock advances whenever the bot acts, whether or not
			// the action turns out to be legal — a wasted turn is still a turn.
			state.tick += 1;
			const handler = findAction(action.name);
			if (!handler) {
				return { ok: false, narration: unknownActionNarration(action.name), stateDiff: [] };
			}
			const outcome = handler.perform(state, action.arguments);
			return { ok: outcome.ok, narration: outcome.narration, stateDiff: outcome.stateDiff };
		},

		test(predicate): boolean {
			const check = playroomPredicates[predicate];
			return check ? check(state) : false;
		},

		reset(): void {
			state = structuredClone(initial);
		},

		receiveInput(text: string): void {
			state.heard.push(text);
		},

		describeProgress(predicate): string | undefined {
			return playroomProgress[predicate]?.(state);
		}
	};
}

export const playroom: WorldDefinition = {
	id: PLAYROOM_WORLD_ID,
	name: worldStrings.name,
	layouts: playroomLayouts,
	actions: playroomActionDefinitions,
	senses: playroomSenses,
	predicates: playroomPredicateDescriptions,
	create: createPlayroomInstance
};
