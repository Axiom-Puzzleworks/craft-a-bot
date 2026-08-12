import type { AgentSpec } from '../schemas/agent-spec.js';
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

export type RunOutcome =
	'SUCCESS' | 'OUT_OF_STEPS' | 'STOPPED_BY_USER' | 'STOPPED_BY_GUARDRAIL' | 'ERROR';

export type SessionStatus = 'idle' | 'running' | 'paused' | 'awaiting-approval' | 'finished';

export interface TickResult {
	tick: number;
	/** Present only on the tick that concludes the run. */
	outcome?: RunOutcome;
}

export interface AgentSession {
	readonly spec: AgentSpec;
	readonly status: SessionStatus;
	readonly events: EventBus; // subscribe from UI / trace / guardrails
	start(mode: RunMode): void;
	step(): Promise<TickResult>;
	pause(): void;
	resolveApproval(approved: boolean): void;
	stop(reason?: string): void;
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
	spec: AgentSpec;
	registry: PackRegistry; // resolves cartridge/world/tool/card IDs
	provider: LLMProvider;
	guardrails: Guardrail[];
	options?: SessionOptions;
}

/** The contract `createSession` implements. */
export type CreateSession = (deps: CreateSessionDeps) => AgentSession;
