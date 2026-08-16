import {
	createSession,
	displayedTickBudget,
	type AnyAgentSpec,
	type EngineEvent,
	type Guardrail,
	type LLMProvider,
	type RunMode,
	type RunOutcome,
	type SessionStatus
} from '@craftabot/core';
import type { GridWorldState } from '@craftabot/core';
import { botExpression, type BotExpression } from '$lib/bot-expression.js';
import { createRegistry } from '$lib/packs.js';
import {
	applyEvent,
	emptyProjection,
	type PendingApproval,
	type RunProjection
} from './run-projection.js';

/**
 * **The one seam between the engine and the UI** (05-TECH-STACK.md §4).
 *
 * Everything the Playroom draws is built here, from the event stream and
 * nothing else — not by reaching into the session's world object. That is hard
 * rule 3 taken literally ("if it isn't in an event, it didn't happen"), and it
 * is what makes an exported trace genuinely enough to replay a run: if this
 * adapter can render from events alone, so can anything else.
 */

export type LampState = 'idle' | 'thinking' | 'acting' | 'paused' | 'tripped' | 'finished';

/**
 * What the bot has asked permission to do (08-GOVERNANCE-GUARDRAILS.md §3,
 * 03-UI-UX-DESIGN.md §7). Re-exported from the projection, which is where it
 * is built, so that live and replayed runs speak of an approval in exactly one
 * type — every existing importer keeps its import path.
 */
export type { PendingApproval };

export interface SessionView {
	readonly status: SessionStatus;
	readonly lamp: LampState;
	/** The bot's face — how the run is going, where `lamp` is what it is doing. */
	readonly expression: BotExpression;
	readonly world: GridWorldState | undefined;
	readonly thought: string;
	/** True while tokens are still arriving for this turn. */
	readonly streamingNow: boolean;
	readonly saying: string | undefined;
	readonly narration: string;
	readonly tick: number;
	readonly maxTicks: number;
	readonly usage: { inputTokens: number; outputTokens: number };
	readonly outcome: RunOutcome | undefined;
	/** Why it ended, when the outcome alone does not say — see `RunProjection`. */
	readonly finishedReason: string | undefined;
	/** Things the bot might have meant, when a name matched several (`16-…` §2.4). */
	readonly didYouMean: string[];
	readonly events: EngineEvent[];
	readonly runId: string | undefined;
	readonly started: boolean;
	/** Set while the run is suspended waiting for a human (approval mode). */
	readonly pendingApproval: PendingApproval | undefined;

	/** Answer an approval request. Ignored when nothing is pending. */
	resolveApproval(approved: boolean): void;
	/**
	 * End the run on a judgement the world cannot make (`16-…` §2.5). Free Play
	 * has no predicate but `celebrate`, so somebody has to decide it is done —
	 * and both the person and the bot are allowed to.
	 */
	declareOutcome(outcome: RunOutcome, reason?: string): void;
	/**
	 * Say something to the bot from outside the world (`16-…` §2.6). A world
	 * with no ears ignores it and the trace records that it did.
	 */
	deliverInput(text: string): void;
	start(mode: RunMode): void;
	step(): Promise<void>;
	pause(): void;
	stop(): void;
	setSpeed(multiplier: number): void;
	/** Throw the world back to its opening state and forget the run. */
	reset(): void;
}

export interface SessionViewDeps {
	/** Either spec shape — `createSession` normalises at its own door (WP14). */
	spec: AnyAgentSpec;
	provider: LLMProvider;
	/**
	 * Policy the *host* adds on top of the bot's own (WP14 slice 3d).
	 *
	 * The play screen passes none: the fitted bricks install their rules
	 * themselves, so a bot carries its policy wherever it is run. This stays open
	 * for the Workshop's policy cards (`08-…` §5) and for tests.
	 */
	guardrails?: Guardrail[];
	maxTicks?: number;
	/** Base delay between ticks in play mode, before the speed dial divides it. */
	baseTickDelayMs?: number;
	onEvent?: (event: EngineEvent) => void;
}

const BASE_TICK_DELAY_MS = 700;

export function createSessionView(deps: SessionViewDeps): SessionView {
	const registry = createRegistry();

	/**
	 * The projection, plus the one thing events cannot tell you: whether the
	 * session is running right now. Status is the session's own, not a fold —
	 * which is exactly why it is not in `RunProjection`, where a replay with no
	 * session would have nothing to put in it.
	 */
	const state = $state<RunProjection & { status: SessionStatus }>({
		status: 'idle',
		...emptyProjection()
	});

	let speed = $state(1);
	let session = build();
	let runId = $state<string | undefined>(undefined);

	/** One place that knows how the dial becomes a delay, so build and setSpeed agree. */
	function tickDelayFor(multiplier: number): number {
		return Math.round((deps.baseTickDelayMs ?? BASE_TICK_DELAY_MS) / multiplier);
	}

	function build() {
		const created = createSession({
			spec: deps.spec,
			registry,
			provider: deps.provider,
			guardrails: deps.guardrails ?? [],
			options: {
				tickDelayMs: tickDelayFor(speed),
				...(deps.maxTicks !== undefined ? { budgets: { maxTicks: deps.maxTicks } } : {})
			}
		});
		created.events.onAny(absorb);
		return created;
	}

	/** The whole UI model, derived from one event at a time. */
	function absorb(event: EngineEvent): void {
		// The fold itself is shared with replay (`run-projection.ts`); what stays
		// here is what only a live session knows — which run this is, the host's
		// listener, and the session's own status.
		applyEvent(state, event);
		runId ??= event.runId;
		deps.onEvent?.(event);
		state.status = session.status;
	}

	return {
		get status() {
			return state.status;
		},
		/**
		 * The bot's face (`16-…` §1.6). Derived, never stored, so it cannot drift
		 * from the run it is describing — and derived from fields that are
		 * themselves absorbed from events, so slice e's replay viewer can build
		 * the same mood from a stored trace and get the same face.
		 */
		get expression(): BotExpression {
			return botExpression({
				tripped: state.tripped,
				outcome: state.outcome,
				thinking: state.thinking,
				lastActionOk: state.lastActionOk
			});
		},
		/** Status lamp (03 §5.1). Always paired with a word in the UI, never colour alone. */
		get lamp(): LampState {
			if (state.tripped) return 'tripped';
			if (state.outcome !== undefined) return 'finished';
			// Waiting on a person is a pause, and reads as one: the run really has
			// stopped, and nothing moves until someone answers.
			if (state.pendingApproval !== undefined) return 'paused';
			if (state.thinking) return 'thinking';
			if (state.status === 'running') return 'acting';
			if (state.status === 'paused' || state.status === 'awaiting-approval') return 'paused';
			return 'idle';
		},
		get world() {
			return state.world;
		},
		/** The streamed thought while one is arriving, otherwise the settled one. */
		get thought() {
			return state.streaming !== '' ? state.streaming : state.thought;
		},
		get streamingNow() {
			return state.streaming !== '';
		},
		get saying() {
			return state.saying;
		},
		get narration() {
			return state.narration;
		},
		get tick() {
			return state.tick;
		},
		get maxTicks() {
			// The gauge counts down the *dial*, not the engine's backstop — see
			// `displayedTickBudget`. Previously this repeated the floor as a
			// literal 30, which would now disagree with core.
			return displayedTickBudget(
				deps.spec,
				registry,
				deps.maxTicks !== undefined ? { maxTicks: deps.maxTicks } : {}
			);
		},
		get usage() {
			return state.usage;
		},
		get outcome() {
			return state.outcome;
		},
		get finishedReason() {
			return state.finishedReason;
		},
		get didYouMean() {
			return state.didYouMean;
		},
		get events() {
			return state.events;
		},
		get runId() {
			return runId;
		},
		get started() {
			return state.started;
		},
		get pendingApproval() {
			return state.pendingApproval;
		},

		declareOutcome(outcome, reason) {
			session.declareOutcome(outcome, reason);
			state.status = session.status;
		},
		deliverInput(text) {
			session.deliverInput(text);
		},
		resolveApproval(approved) {
			// `state.pendingApproval` is cleared by the `approval.resolved` event
			// rather than here, so the UI stays a pure function of the trace.
			session.resolveApproval(approved);
			state.status = session.status;
		},
		start(mode) {
			session.start(mode);
			state.status = session.status;
		},
		async step() {
			await session.step();
			state.status = session.status;
		},
		pause() {
			session.pause();
			state.status = session.status;
		},
		stop() {
			session.stop('stopped from the Playroom');
			state.status = session.status;
		},
		setSpeed(multiplier) {
			speed = multiplier;
			// Applies to the run in progress, not just the next one (`16-…` §1.6).
			// This used to set the field and stop, because the delay was fixed when
			// the session was built and rebuilding would have thrown the trace away
			// (`12-…` D15). `setTickDelayMs` is the seam that makes it honest.
			session.setTickDelayMs(tickDelayFor(multiplier));
		},
		reset() {
			// Release anyone waiting on an approval before tearing the run down,
			// or the old session's tick loop stays parked on a promise forever.
			session.resolveApproval(false);
			session.stop('reset');
			// Assigned field by field from the shared blank rather than listing them
			// here: a projection that grows a field should not be able to grow one
			// that reset quietly forgets. `state` is the reactive object itself, so
			// it is refilled rather than replaced.
			Object.assign(state, emptyProjection());
			state.status = 'idle';
			runId = undefined;
			session = build();
		}
	};
}
