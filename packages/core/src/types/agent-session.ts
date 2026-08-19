import type { AnyAgentSpec } from '../schemas/agent-spec-v2.js';
import type { RunOutcome } from '../schemas/shared.js';
import type { EventBus } from '../event-bus.js';
import type { PackRegistry } from '../pack-registry.js';
import type { Guardrail } from './guardrail.js';
import type { LLMProvider } from './provider.js';
import type { WorldInstance } from './world.js';
import type { Strategies } from '../session/strategies.js';

/**
 * The runtime contract (02-AGENT-MODEL.md §5-6). WP1 ships the type only —
 * the tick loop implementation (sense→compose→guard→think→decide→act→
 * remember→judge) is WP3, against a mock LLMProvider. No stub/throwing
 * implementation is exported here on purpose: a function that only errors
 * at call time isn't a real contract, it's a trap for WP3 to trip on.
 */
export type RunMode = 'step' | 'play';

/**
 * Defined once, in Zod, and inferred here (E5, `14-…` §3): the outcome is
 * written into `run.finished` and into every `RunRecord`, so it crosses the
 * trace boundary and the schema is the type. See `schemas/shared.ts`.
 */
export type { RunOutcome };

export type SessionStatus = 'idle' | 'running' | 'paused' | 'awaiting-approval' | 'finished';

export interface TickResult {
	tick: number;
	/** Present only on the tick that concludes the run. */
	outcome?: RunOutcome;
}

export interface AgentSession {
	/** The bot being run, in whichever shape it was handed over (WP14 slice 3c). */
	readonly spec: AnyAgentSpec;
	/**
	 * The id stamped on every one of this session's own events (E10) —
	 * generated at construction, not at `start()`. `SessionGroup` (WP29,
	 * `23-…` §4.4) reads this to know every member's run id before any of
	 * them has taken a turn, which is what lets `group.started` name them and
	 * still be first on the merged stream.
	 */
	readonly runId: string;
	readonly status: SessionStatus;
	readonly events: EventBus; // subscribe from UI / trace / guardrails
	start(mode: RunMode): void;
	step(): Promise<TickResult>;
	pause(): void;
	resolveApproval(approved: boolean): void;
	/**
	 * Change the play-mode delay between ticks *while the run is going*
	 * (`16-…` §1.6). The loop reads it each time round, so the next gap is the
	 * new one; the tick already in flight finishes at the old pace.
	 *
	 * Exists because the speed dial was a lie without it (`12-…` D15) — the
	 * delay was fixed when the session was built, and the only honest way to
	 * apply a change was to rebuild the session and throw the trace away.
	 *
	 * Negative values clamp to 0 rather than throwing: this is a viewing
	 * control, and no run should end because someone typed a silly number.
	 */
	setTickDelayMs(ms: number): void;
	stop(reason?: string): void;
	/**
	 * Say something to the bot from outside the world — the input half of the
	 * Hearing sense (E2, `14-…` §3). A world with no ears ignores it, and the
	 * trace records that it did.
	 */
	deliverInput(text: string): void;
	/**
	 * End the run on a judgement the world cannot make (E2): Free Play has no
	 * predicate, so somebody has to decide, and both the person and the bot are
	 * allowed to. `reason` records which.
	 */
	declareOutcome(outcome: RunOutcome, reason?: string): void;
}

export interface SessionOptions {
	/** Delay between ticks in `play` mode, so a human can watch (02-AGENT-MODEL.md §5). */
	tickDelayMs?: number;
	budgets?: { maxTicks?: number; maxTokens?: number; requestTimeoutMs?: number };
	/**
	 * Injected clock, id source, and randomness. Production uses the real ones;
	 * tests inject counters so a recorded trace is byte-reproducible, which is
	 * what makes replay and audit possible (08-GOVERNANCE-GUARDRAILS.md §4).
	 */
	now?: () => string;
	newId?: () => string;
	random?: () => number;
	/**
	 * Override how context is kept and composed (E7, `14-…` §3).
	 *
	 * The spec's Memory brick names a pairing and that is how a *built bot*
	 * chooses. This seam is for the two callers who are not a built bot: a test
	 * that wants to prove a strategy is genuinely swappable rather than
	 * hard-coded behind a name, and the Workshop bench, which lets a
	 * professional switch realism mode on a spec it did not write.
	 *
	 * Either half may be given on its own; the other falls back to the spec.
	 */
	strategies?: Partial<Strategies>;
	/**
	 * Stamped into every event's envelope when set (E10, `14-…` §3;
	 * `23-MULTI-AGENT-DESIGN.md` §4.5). Absent for an ordinary solo run — the
	 * field has carried this exact meaning, unused, since WP13: "Nothing
	 * produces it yet; it exists so that when `SessionGroup` arrives the
	 * shape does not have to change again." `SessionGroup` sets it to the
	 * group's own run id, so every member's trace can be traced back to the
	 * episode it was part of without a new envelope field.
	 */
	parentRunId?: string;
}

export interface CreateSessionDeps {
	/** Either spec shape; the session normalises (WP14 slice 2b). */
	spec: AnyAgentSpec;
	registry: PackRegistry; // resolves cartridge/world/tool/card IDs
	provider: LLMProvider;
	/**
	 * Rules the *host* adds, on top of whatever the fitted bricks install
	 * (WP14 slice 3d).
	 *
	 * Policy used to arrive only this way: the workbench called
	 * `guardrailsForSpec` and handed the result in. That compiler read the Safety
	 * Brick by name, so it could compile exactly one brick and no others. Bricks
	 * now contribute their own rules through `contributeGuardrails`, and the
	 * session collects them — so most callers pass nothing here at all.
	 *
	 * The seam stays open because the host genuinely has policy of its own to
	 * add: V1.x policy cards (`08-…` §5) compile to guardrails that belong to the
	 * *deployment* rather than to any brick on the baseplate.
	 */
	guardrails?: Guardrail[];
	options?: SessionOptions;
	/**
	 * A world handed in by the host (WP29, `23-MULTI-AGENT-DESIGN.md` §4.5).
	 * When present the session uses it exactly as if it had built it and
	 * never calls `WorldDefinition.create` itself; when absent, behaviour is
	 * byte-identical to every session created before this field existed.
	 * `SessionGroup` passes an agent-bound facade here — the seam that lets
	 * several sessions share one world without the session ever learning
	 * groups exist.
	 */
	world?: WorldInstance;
}

/** The contract `createSession` implements. */
export type CreateSession = (deps: CreateSessionDeps) => AgentSession;
