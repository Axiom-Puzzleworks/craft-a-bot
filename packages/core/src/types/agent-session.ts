import type { AnyAgentSpec } from '../schemas/agent-spec-v2.js';
import type { RunOutcome } from '../schemas/shared.js';
import type { EventBus } from '../event-bus.js';
import type { PackRegistry } from '../pack-registry.js';
import type { Guardrail } from './guardrail.js';
import type { LLMProvider } from './provider.js';

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
	readonly status: SessionStatus;
	readonly events: EventBus; // subscribe from UI / trace / guardrails
	start(mode: RunMode): void;
	step(): Promise<TickResult>;
	pause(): void;
	resolveApproval(approved: boolean): void;
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
}

/** The contract `createSession` implements. */
export type CreateSession = (deps: CreateSessionDeps) => AgentSession;
