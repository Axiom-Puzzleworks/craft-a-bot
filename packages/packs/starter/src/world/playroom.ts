import type {
	ActionCall,
	ActionResult,
	AgentHandle,
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
import type { PlayroomAgent, PlayroomState, RadioConfig } from './state.js';

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

	function resetState(): void {
		state = structuredClone(initial);
	}

	function performOn(action: ActionCall): ActionResult {
		// Turn-based: the clock advances whenever the bot acts, whether or not
		// the action turns out to be legal — a wasted turn is still a turn.
		state.tick += 1;
		const handler = findAction(action.name);
		if (!handler) {
			return { ok: false, narration: unknownActionNarration(action.name), stateDiff: [] };
		}
		const outcome = handler.perform(state, action.arguments);
		return { ok: outcome.ok, narration: outcome.narration, stateDiff: outcome.stateDiff };
	}

	/**
	 * Assigns `handle` a permanent seat in `state.agents` the first time it is
	 * seen, then stages `state.bot` to be that seat for the call about to
	 * happen (WP29, `23-…` §4.8) — the trick every action handler is written
	 * against without knowing it: `move` reads and writes plain
	 * `state.bot.position`, exactly as it always has, and none of the seven
	 * actions ever learns a second robot exists.
	 */
	function seat(handle: AgentHandle): PlayroomAgent {
		state.agents ??= [];
		let mine = state.agents.find((agent) => agent.id === handle.agentId);
		if (!mine) {
			const startIndex = state.agents.length;
			const start = state.coopStarts?.[startIndex] ?? { ...state.bot.position };
			mine = { id: handle.agentId, name: handle.name, position: { ...start } };
			state.agents.push(mine);
		}
		state.bot = { position: { ...mine.position }, id: mine.id };
		return mine;
	}

	/** After the acting agent's turn, its seat catches up to wherever `perform` left `state.bot`. */
	function writeSeatBack(mine: PlayroomAgent): void {
		mine.position = { ...state.bot.position };
	}

	/**
	 * A pick-up during this agent's turn leaves the item `carried` with no
	 * owner yet, because `pick_up`'s handler (`actions.ts`) never learns a
	 * second robot exists — claim it on the acting agent's behalf. Idempotent:
	 * an item this agent already claimed on an earlier turn is left alone.
	 */
	function claimCarriedItems(agentId: string): void {
		for (const item of state.items) {
			if (item.location.kind === 'carried' && item.location.agentId === undefined) {
				item.location = { kind: 'carried', agentId };
			}
		}
	}

	/**
	 * The one thing `configure()` currently does: absorb this agent's own
	 * Radio brick config, keyed by `qualifyPlayroomId('radio')` — the same
	 * key `starter/radio`'s `contributeWorldConfig` writes it under (WP31
	 * stage F). Ignored entirely for a bot with no Radio brick fitted, since
	 * the bag simply has nothing under that key.
	 */
	function applyWorldConfig(agentId: string, config: Record<string, unknown>): void {
		const radioConfig = config[qualifyPlayroomId('radio')] as RadioConfig | undefined;
		if (!radioConfig) return;
		state.radioConfigs ??= {};
		state.radioConfigs[agentId] = radioConfig;
	}

	function facadeFor(handle: AgentHandle): WorldInstance {
		// Reserved at bind time, not on first use: `SessionGroup` calls
		// `forAgent` for every member synchronously, in member order, before any
		// of them takes a turn (`23-…` §4.4) — that is the order `coopStarts`
		// must be handed out in. Deferring the reservation to whichever facade
		// happens to be *used* first would make seating depend on scheduling,
		// not on who the world was told about first.
		seat(handle);
		return {
			snapshot(): WorldState {
				seat(handle);
				return structuredClone(state);
			},
			observe(channels): Observation {
				seat(handle);
				return observePlayroom(state, [...channels]);
			},
			perform(action: ActionCall): ActionResult {
				const mine = seat(handle);
				const result = performOn(action);
				writeSeatBack(mine);
				claimCarriedItems(handle.agentId);
				return result;
			},
			test(predicate): boolean {
				seat(handle);
				const check = playroomPredicates[predicate];
				return check ? check(state) : false;
			},
			reset(): void {
				resetState();
			},
			receiveInput(text: string): void {
				state.heard.push(text);
			},
			describeProgress(predicate, channels): string | undefined {
				seat(handle);
				if (!channels.includes(SENSE_SIGHT)) return undefined;
				return playroomProgress[predicate]?.(state);
			},
			configure(config): void {
				applyWorldConfig(handle.agentId, config);
			}
		};
	}

	return {
		snapshot(): WorldState {
			return structuredClone(state);
		},

		observe(channels): Observation {
			return observePlayroom(state, [...channels]);
		},

		perform: performOn,

		test(predicate): boolean {
			const check = playroomPredicates[predicate];
			return check ? check(state) : false;
		},

		reset(): void {
			resetState();
		},

		receiveInput(text: string): void {
			state.heard.push(text);
		},

		describeProgress(predicate, channels): string | undefined {
			// Everything the Playroom can say about progress is something you would
			// have to look at, so it is gated on Sight exactly as the observation is.
			if (!channels.includes(SENSE_SIGHT)) return undefined;
			return playroomProgress[predicate]?.(state);
		},

		configure(config): void {
			// No `handle` on the solo path — `'solo'` is the same fallback key
			// `state.bot.id ?? 'solo'` already uses everywhere else a Radio-aware
			// handler needs one (`actions.ts`, `senses.ts`).
			applyWorldConfig('solo', config);
		},

		forAgent: facadeFor
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
