import type { EngineEvent } from '../schemas/events.js';
import type { RunOutcome } from '../schemas/shared.js';
import type { GridWorldState } from '../types/grid-world.js';

/**
 * **What a run looks like, folded up from its events** (`15-…` §3).
 *
 * This is the one place that turns an event stream into the things the
 * Playroom draws — the world, the thought, the speech bubble, the tick, the
 * outcome. It exists as its own module because **two** callers need it and
 * they must not disagree: the live session (`session.svelte.ts`) folding
 * events as they arrive, and the replay viewer folding the same events back
 * out of storage.
 *
 * `16-…` §1.4 asks for a replay that is "pixel-consistent with a live run".
 * A second reducer written for replay would satisfy that on the day it was
 * written and drift the first time either changed. Sharing this one makes the
 * property true by construction, and leaves the tests to prove it stays true
 * rather than to establish it in the first place.
 *
 * Deliberately **not** reactive and deliberately free of any session handle.
 * It is a plain fold over plain data: `$state` proxies mutate happily through
 * it, and a replay that has no session at all can use it unchanged.
 */
export interface RunProjection {
	world: GridWorldState | undefined;
	thought: string;
	saying: string | undefined;
	narration: string;
	tick: number;
	usage: { inputTokens: number; outputTokens: number };
	outcome: RunOutcome | undefined;
	/**
	 * Why the run ended, when the outcome alone does not say (E2). A goal met by
	 * the world's predicate and one a person declared finished are both SUCCESS,
	 * and `16-…` §2.5 wants the end card to tell them apart.
	 */
	finishedReason: string | undefined;
	events: EngineEvent[];
	tripped: boolean;
	thinking: boolean;
	started: boolean;
	/** Tokens arriving right now, before the decision lands. */
	streaming: string;
	pendingApproval: PendingApproval | undefined;
	/** Whether the world took the last action; `undefined` before any. */
	lastActionOk: boolean | undefined;
	/**
	 * Things the bot might have meant, when a name matched several (`16-…` §2.4).
	 * Empty unless the most recent action came back ambiguous.
	 */
	didYouMean: string[];
}

/**
 * An action paused for a person to allow or deny (08 §3, 03 §7). Built from the
 * `approval.requested` event like everything else here — the UI never peers
 * into the session to find it.
 */
export interface PendingApproval {
	kind: 'tool' | 'action';
	name: string;
	arguments: unknown;
	reason: string;
}

export function emptyProjection(): RunProjection {
	return {
		world: undefined,
		thought: '',
		saying: undefined,
		narration: '',
		tick: 0,
		usage: { inputTokens: 0, outputTokens: 0 },
		outcome: undefined,
		finishedReason: undefined,
		events: [],
		tripped: false,
		thinking: false,
		started: false,
		streaming: '',
		pendingApproval: undefined,
		lastActionOk: undefined,
		didYouMean: []
	};
}

/**
 * Fold one event into the projection. Mutates, because the live caller holds a
 * `$state` object whose whole job is to be mutated and observed.
 */
export function applyEvent(state: RunProjection, event: EngineEvent): void {
	state.events.push(event);
	state.tick = event.tick;

	switch (event.type) {
		case 'run.started':
			state.started = true;
			break;
		case 'world.changed':
			// Cast: the Playroom authored this state; the event carries it opaquely.
			state.world = event.payload.state as GridWorldState;
			break;
		case 'think.started':
			state.thinking = true;
			// A new thought starts blank so the streamed one does not append to
			// the last turn's.
			state.streaming = '';
			break;
		case 'think.token':
			// Streaming tokens land in the thought bubble as they arrive
			// (09-ROADMAP.md WP7 DoD) — the whole point of SSE is watching the
			// bot think rather than waiting for it to finish.
			state.streaming += event.payload.delta;
			break;
		case 'think.completed':
			state.thinking = false;
			state.usage = {
				inputTokens: state.usage.inputTokens + event.payload.response.usage.inputTokens,
				outputTokens: state.usage.outputTokens + event.payload.response.usage.outputTokens
			};
			break;
		case 'decision':
			// The final text replaces the streamed one, which may have been cut
			// short or re-prompted.
			if (event.payload.thought !== '') state.thought = event.payload.thought;
			state.streaming = '';
			break;
		case 'action.performed': {
			state.narration = event.payload.result.narration;
			// Whether the world took it or refused it — the input the bot's face
			// needs and the only one the session was not already keeping.
			state.lastActionOk = event.payload.result.ok;
			// Cleared on every action, so the chips belong to the turn that raised
			// them rather than hanging about after the bot has moved on.
			state.didYouMean = event.payload.result.didYouMean ?? [];
			// A `say` becomes a speech bubble in the world view (03 §5.1).
			const args = event.payload.arguments;
			state.saying =
				event.payload.name === 'say' && args !== null && typeof args === 'object'
					? String((args as { text?: unknown }).text ?? '')
					: undefined;
			break;
		}
		case 'guardrail.tripped':
			state.tripped = true;
			break;
		case 'approval.requested':
			state.pendingApproval = { ...event.payload.proposed, reason: event.payload.reason };
			break;
		case 'approval.resolved':
			state.pendingApproval = undefined;
			break;
		case 'run.finished':
			state.outcome = event.payload.outcome;
			state.finishedReason = event.payload.reason;
			break;
	}
}

/**
 * Fold a whole stored trace, or the first `throughTick` turns of one — the
 * scrubber's one operation (`16-…` §1.4).
 *
 * Replaying from the start each time rather than stepping backwards and
 * forwards: a fold is cheap over the tens-to-hundreds of events a Playroom run
 * produces, and an inverse for every case is a second implementation to keep
 * honest. Dragging the scrubber left has to land on exactly the state the run
 * passed through, and the only way to be sure of that is to arrive the same way.
 */
export function projectThrough(
	events: readonly EngineEvent[],
	throughTick?: number
): RunProjection {
	const state = emptyProjection();
	for (const event of events) {
		if (throughTick !== undefined && event.tick > throughTick) break;
		applyEvent(state, event);
	}
	return state;
}
