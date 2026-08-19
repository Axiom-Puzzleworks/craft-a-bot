import type { AnyAgentSpec } from '../schemas/agent-spec-v2.js';
import type { RunOutcome } from '../schemas/shared.js';
import type { EventBus } from '../event-bus.js';
import type { PackRegistry } from '../pack-registry.js';
import type { AgentSession, RunMode, SessionOptions, SessionStatus } from './agent-session.js';
import type { Guardrail } from './guardrail.js';
import type { LLMProvider } from './provider.js';

/**
 * The host-level composition WP29 adds (`23-MULTI-AGENT-DESIGN.md` §4.4).
 * `AgentSession` stays exactly what it always was — one agent, unchanged —
 * and knows nothing about groups existing; `SessionGroup` is what creates
 * several of them over one shared world and schedules their turns.
 */

/** One agent's contribution to a group — the per-member half of `CreateSessionDeps`. */
export interface GroupMember {
	spec: AnyAgentSpec;
	provider: LLMProvider;
	/** Host guardrails for this agent, as `CreateSessionDeps.guardrails` today. */
	guardrails?: Guardrail[];
}

export interface CreateSessionGroupDeps {
	/** V-duo ships exactly two; the contract allows more. */
	members: GroupMember[];
	registry: PackRegistry;
	/**
	 * The one card every member plays. Every member's own spec must already
	 * name this same card — `createSession` resolves a session's world and
	 * budgets from *its own* `spec.goalCardId`, so a member whose spec
	 * disagrees would silently judge itself against a different world or
	 * success condition than the rest of the group. Construction refuses
	 * that rather than letting it happen quietly (§4.4's "mixed-world cards"
	 * refusal).
	 */
	goalCardId: string;
	/**
	 * Host rules evaluated at the orchestrator chokepoint, above any member's
	 * own Safety Brick (`19-…` §7.2, `23-…` §4.4/§4.9) — "the seam accepts
	 * arbitrary rules from day one because it is just the guardrail interface
	 * at a second altitude." `options.groupMaxTokens` below adds one more
	 * (the combined-budget rule) without the caller having to construct it.
	 */
	groupGuardrails?: Guardrail[];
	options?: Omit<SessionOptions, 'parentRunId'> & {
		/** Combined token ceiling across all members; per-agent budgets still apply. */
		groupMaxTokens?: number;
		/** Ceiling on scheduler rounds — a round is one tick offered to each live agent. */
		maxRounds?: number;
	};
}

export interface SessionGroup {
	readonly groupRunId: string;
	/** One entry per member, in the order given to `createSessionGroup` — each a real `AgentSession`. */
	readonly sessions: readonly AgentSession[];
	/** The merged stream: every member's events in arrival order, plus the group's own lifecycle events. */
	readonly events: EventBus;
	readonly status: SessionStatus;
	start(mode: RunMode): void;
	/** One round: each unfinished member takes one tick, in fixed member order. */
	stepRound(): Promise<{ round: number; outcome?: RunOutcome }>;
	pause(): void;
	/** Resolves the named agent's own pending approval — approvals stay per-agent. */
	resolveApproval(agentId: string, approved: boolean): void;
	stop(reason?: string): void;
	/** Reaches the shared world once, through whichever member is still live (§4.4). */
	deliverInput(text: string): void;
}

export type CreateSessionGroup = (deps: CreateSessionGroupDeps) => SessionGroup;
