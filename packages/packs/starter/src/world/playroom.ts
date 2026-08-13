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
import { SENSE_SIGHT, observePlayroom, playroomSenses } from './senses.js';
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

		describeProgress(predicate, channels): string | undefined {
			// Everything the Playroom can say about progress is something you would
			// have to look at, so it is gated on Sight exactly as the observation is.
			if (!channels.includes(SENSE_SIGHT)) return undefined;
			return playroomProgress[predicate]?.(state);
		}
	};
}

/**
 * A world's own content, named so a second world cannot collide with it
 * (E6, `14-…` §3, closing `12-…` D4).
 *
 * The Playroom used to register its actions as bare `move`, `say`, `open` and
 * its senses as `sight`, `compass` — against the `{packId}/{localId}` rule
 * every other kind of content follows (`01-…` §4). Nothing broke, because
 * there has only ever been one world; the moment a second ships its own
 * `move`, `registry.getAction('move')` starts answering with whichever world
 * it happened to meet first.
 *
 * Qualification happens here, at the definition, rather than in `actions.ts`
 * and `senses.ts`: inside the world, `move` *is* the action's name, and making
 * every internal reference carry the world's own id would be noise. The
 * session translates in both directions — the model is still offered a plain
 * `move`, because provider tool names must be plain identifiers.
 */
export const qualifyPlayroomId = (localId: string): string => `${PLAYROOM_WORLD_ID}/${localId}`;

export const playroom: WorldDefinition = {
	id: PLAYROOM_WORLD_ID,
	name: worldStrings.name,
	layouts: playroomLayouts,
	actions: playroomActionDefinitions.map((action) => ({
		...action,
		id: qualifyPlayroomId(action.id)
	})),
	senses: playroomSenses.map((sense) => ({ ...sense, id: qualifyPlayroomId(sense.id) })),
	predicates: playroomPredicateDescriptions,
	create: createPlayroomInstance
};
