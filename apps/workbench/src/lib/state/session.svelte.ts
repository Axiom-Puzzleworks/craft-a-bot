import {
	createSession,
	type AgentSpec,
	type EngineEvent,
	type Guardrail,
	type LLMProvider,
	type RunMode,
	type RunOutcome,
	type SessionStatus
} from '@craftabot/core';
import type { PlayroomState } from '@craftabot/pack-starter';
import { createRegistry } from '$lib/packs.js';

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

export interface SessionView {
	readonly status: SessionStatus;
	readonly lamp: LampState;
	readonly world: PlayroomState | undefined;
	readonly thought: string;
	/** True while tokens are still arriving for this turn. */
	readonly streamingNow: boolean;
	readonly saying: string | undefined;
	readonly narration: string;
	readonly tick: number;
	readonly maxTicks: number;
	readonly usage: { inputTokens: number; outputTokens: number };
	readonly outcome: RunOutcome | undefined;
	readonly events: EngineEvent[];
	readonly runId: string | undefined;
	readonly started: boolean;

	start(mode: RunMode): void;
	step(): Promise<void>;
	pause(): void;
	stop(): void;
	setSpeed(multiplier: number): void;
	/** Throw the world back to its opening state and forget the run. */
	reset(): void;
}

export interface SessionViewDeps {
	spec: AgentSpec;
	provider: LLMProvider;
	guardrails?: Guardrail[];
	maxTicks?: number;
	/** Base delay between ticks in play mode, before the speed dial divides it. */
	baseTickDelayMs?: number;
	onEvent?: (event: EngineEvent) => void;
}

const BASE_TICK_DELAY_MS = 700;

export function createSessionView(deps: SessionViewDeps): SessionView {
	const registry = createRegistry();

	const state = $state<{
		status: SessionStatus;
		world: PlayroomState | undefined;
		thought: string;
		saying: string | undefined;
		narration: string;
		tick: number;
		usage: { inputTokens: number; outputTokens: number };
		outcome: RunOutcome | undefined;
		events: EngineEvent[];
		tripped: boolean;
		thinking: boolean;
		started: boolean;
		/** Tokens arriving right now, before the decision lands. */
		streaming: string;
	}>({
		status: 'idle',
		world: undefined,
		thought: '',
		saying: undefined,
		narration: '',
		tick: 0,
		usage: { inputTokens: 0, outputTokens: 0 },
		outcome: undefined,
		events: [],
		tripped: false,
		thinking: false,
		started: false,
		streaming: ''
	});

	let speed = $state(1);
	let session = build();
	let runId = $state<string | undefined>(undefined);

	function build() {
		const created = createSession({
			spec: deps.spec,
			registry,
			provider: deps.provider,
			guardrails: deps.guardrails ?? [],
			options: {
				tickDelayMs: Math.round((deps.baseTickDelayMs ?? BASE_TICK_DELAY_MS) / speed),
				...(deps.maxTicks !== undefined ? { budgets: { maxTicks: deps.maxTicks } } : {})
			}
		});
		created.events.onAny(absorb);
		return created;
	}

	/** The whole UI model, derived from one event at a time. */
	function absorb(event: EngineEvent): void {
		state.events.push(event);
		state.tick = event.tick;
		runId ??= event.runId;
		deps.onEvent?.(event);

		switch (event.type) {
			case 'run.started':
				state.started = true;
				break;
			case 'world.changed':
				// Cast: the Playroom authored this state; the event carries it opaquely.
				state.world = event.payload.state as PlayroomState;
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
			case 'run.finished':
				state.outcome = event.payload.outcome;
				break;
		}

		state.status = session.status;
	}

	return {
		get status() {
			return state.status;
		},
		/** Status lamp (03 §5.1). Always paired with a word in the UI, never colour alone. */
		get lamp(): LampState {
			if (state.tripped) return 'tripped';
			if (state.outcome !== undefined) return 'finished';
			if (state.thinking) return 'thinking';
			if (state.status === 'running') return 'acting';
			if (state.status === 'paused') return 'paused';
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
			return deps.maxTicks ?? deps.spec.bricks.safety?.maxTicks ?? 30;
		},
		get usage() {
			return state.usage;
		},
		get outcome() {
			return state.outcome;
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
			// The delay is fixed when a session is built, so a speed change mid-run
			// applies from the next run. Restarting here would throw away the trace.
		},
		reset() {
			session.stop('reset');
			state.world = undefined;
			state.thought = '';
			state.saying = undefined;
			state.narration = '';
			state.tick = 0;
			state.usage = { inputTokens: 0, outputTokens: 0 };
			state.outcome = undefined;
			state.events = [];
			state.tripped = false;
			state.thinking = false;
			state.started = false;
			state.status = 'idle';
			runId = undefined;
			session = build();
		}
	};
}
