import {
	type AgentRole,
	createSessionGroup,
	type AnyAgentSpec,
	type EngineEvent,
	type Guardrail,
	type WorldViewState,
	type LLMProvider,
	type RunMode,
	type RunOutcome,
	type SessionGroup,
	type SessionStatus
} from '@craftabot/core';
import { botExpression, type BotExpression } from '$lib/bot-expression.js';
import { createRegistry } from '$lib/packs.js';
import {
	applyEvent,
	emptyProjection,
	type PendingApproval,
	type RunProjection
} from './run-projection.js';

/**
 * **The duo seam** (WP31, `24-ROBOT-FRIENDS-DESIGN.md` §4.2) — `session.svelte.ts`'s
 * sibling, not its replacement: this wraps `core.createSessionGroup(...)` the
 * exact way `session.svelte.ts` wraps `core.createSession(...)`, reusing the
 * same shared fold (`run-projection.ts`'s `applyEvent`) rather than adding a
 * second one. `session.svelte.ts` itself is untouched by this file's
 * existence, per `23-…`'s own principle 2 carried into the UI layer: the old
 * seam does not learn groups exist.
 */

export type { PendingApproval };

/** A pending approval, plus which member it belongs to — approvals stay per-agent even at group altitude. */
export interface GroupPendingApproval extends PendingApproval {
	agentId: string;
}

/** One robot's own live state, folded from its own events by the same `applyEvent` `session.svelte.ts` uses. */
export interface MemberView {
	readonly agentId: string;
	readonly name: string;
	/** Generated at the member's own session construction (WP29 stage A) — known before any turn is taken. */
	readonly runId: string;
	readonly expression: BotExpression;
	readonly thought: string;
	readonly streamingNow: boolean;
	readonly saying: string | undefined;
	/** The last action's own narration text (`ThoughtBubble`'s second line, same as solo). */
	readonly narration: string;
	readonly tick: number;
	readonly usage: { inputTokens: number; outputTokens: number };
	readonly outcome: RunOutcome | undefined;
	readonly finishedReason: string | undefined;
	readonly didYouMean: string[];
	readonly events: EngineEvent[];
	readonly started: boolean;
}

export interface GroupSessionView {
	readonly status: SessionStatus;
	readonly groupRunId: string | undefined;
	/** The shared room — positions come from `agents`, stable across whichever member acted last (`23-…` §4.3). */
	readonly world: WorldViewState | undefined;
	readonly round: number;
	/** The group's own outcome (`group.finished`), distinct from any one member's own. */
	readonly outcome: RunOutcome | undefined;
	readonly members: readonly MemberView[];
	/**
	 * Which member's own turn produced `world`'s current snapshot — the agent
	 * `WorldView` foregrounds as `bot` right now (`23-…` §4.3: "the alternating
	 * per-agent `bot` field only changes which robot wears the expressive
	 * face"). `undefined` before anyone has acted yet.
	 */
	readonly foregroundedAgentId: string | undefined;
	/** Set while *any* member is suspended waiting for a person; names which one. */
	readonly pendingApproval: GroupPendingApproval | undefined;
	/**
	 * Every event either member or the group itself has emitted, in arrival
	 * order — the merged stream `StoryStrip` narrates for a duo run (WP31,
	 * `24-…` §4.4), the group-altitude counterpart to a solo `SessionView`'s
	 * own `events`.
	 */
	readonly mergedEvents: EngineEvent[];

	start(mode: RunMode): void;
	stepRound(): Promise<{ round: number; outcome?: RunOutcome }>;
	pause(): void;
	stop(): void;
	resolveApproval(agentId: string, approved: boolean): void;
	deliverInput(text: string): void;
}

export interface GroupSessionMemberDeps {
	/** Either spec shape — `createSessionGroup` normalises at its own door, same as solo. */
	spec: AnyAgentSpec;
	provider: LLMProvider;
	guardrails?: Guardrail[];
	/** Which side of a desk this member sits on (WP55, `46-…` §4.6); default `agent`. */
	role?: AgentRole;
}

export interface GroupSessionViewDeps {
	members: GroupSessionMemberDeps[];
	/** The one card every member's own spec must already name (§4.1 — launch-time snapshots, never the shelf's own). */
	goalCardId: string;
	groupGuardrails?: Guardrail[];
	groupMaxTokens?: number;
	maxRounds?: number;
	/**
	 * Delay between rounds, fixed at construction — defaults to solo's own
	 * `BASE_TICK_DELAY_MS` (700ms) so PLAY paces the same in a duo room.
	 * Unlike a solo session, `SessionGroup` has no live `setTickDelayMs`
	 * (`23-…`'s own interface never grew one) — a duo speed dial is out of
	 * this stage's scope, noted here rather than silently assumed away.
	 */
	baseTickDelayMs?: number;
	onEvent?: (event: EngineEvent) => void;
}

interface MemberState {
	agentId: string;
	name: string;
	runId: string;
	projection: RunProjection;
}

/** Solo's own pacing default (`session.svelte.ts`) — a duo session paces the same unless overridden. */
const BASE_TICK_DELAY_MS = 700;

export function createGroupSessionView(deps: GroupSessionViewDeps): GroupSessionView {
	const registry = createRegistry();

	const state = $state<{
		status: SessionStatus;
		round: number;
		groupOutcome: RunOutcome | undefined;
	}>({
		status: 'idle',
		round: 0,
		groupOutcome: undefined
	});

	/** One projection per member, in member order — filled in as each member's own events arrive. */
	const memberStates = $state<MemberState[]>(
		deps.members.map((member) => ({
			agentId: member.spec.id,
			name: member.spec.name,
			runId: '',
			projection: emptyProjection()
		}))
	);

	/**
	 * The shared room, tracked off *any* member's `world.changed` directly —
	 * not folded through a third `RunProjection`. A facade's own `snapshot()`
	 * already returns the full shared room (`agents` lists every seat)
	 * regardless of which member's turn produced it, so there is nothing a
	 * third fold would add (`24-…` §4.2).
	 */
	let world = $state<WorldViewState | undefined>(undefined);
	/** Whichever member's `world.changed` most recently produced `world` — see `foregroundedAgentId`. */
	let foregroundedAgentId = $state<string | undefined>(undefined);
	/** Every event in arrival order — see `GroupSessionView.mergedEvents`. */
	const mergedEvents = $state<EngineEvent[]>([]);

	const group = build();

	function build(): SessionGroup {
		const created = createSessionGroup({
			members: deps.members.map((member) => ({
				spec: member.spec,
				provider: member.provider,
				...(member.guardrails ? { guardrails: member.guardrails } : {}),
				...(member.role ? { role: member.role } : {})
			})),
			registry,
			goalCardId: deps.goalCardId,
			...(deps.groupGuardrails ? { groupGuardrails: deps.groupGuardrails } : {}),
			options: {
				tickDelayMs: deps.baseTickDelayMs ?? BASE_TICK_DELAY_MS,
				...(deps.groupMaxTokens !== undefined ? { groupMaxTokens: deps.groupMaxTokens } : {}),
				...(deps.maxRounds !== undefined ? { maxRounds: deps.maxRounds } : {})
			}
		});

		// Every member's own runId is generated at its session's construction
		// (WP29 stage A), known before any of them has taken a turn — matched up
		// to `memberStates` by array order, the same order `sessions` is built in.
		created.sessions.forEach((session, index) => {
			const entry = memberStates[index];
			if (entry) entry.runId = session.runId;
		});

		created.events.onAny(absorb);
		return created;
	}

	function memberFor(agentId: string): MemberState | undefined {
		return memberStates.find((entry) => entry.agentId === agentId);
	}

	/**
	 * The whole UI model, derived one event at a time — exactly `session.svelte.ts`'s
	 * own `absorb`, split by whose event it is. Every per-agent event already
	 * carries `agentId` (E10); the two group-lifecycle events do not (§4.6's own
	 * event catalogue entry — "these events happened to the group, not to any
	 * one agent"), which is what tells `absorb` apart from routing them.
	 */
	function absorb(event: EngineEvent): void {
		mergedEvents.push(event);
		if (event.type === 'group.finished') {
			state.groupOutcome = event.payload.outcome;
		} else if (event.agentId !== undefined) {
			const member = memberFor(event.agentId);
			if (member) applyEvent(member.projection, event);
		}
		if (event.type === 'world.changed') {
			world = event.payload.state as WorldViewState;
			foregroundedAgentId = event.agentId;
		}
		/*
		 * Tracked from every event's own `tick`, not only inside `stepRound()`'s
		 * own wrapper below (WP31 stage D — found while wiring a live
		 * `GroupRunRecord.rounds` off `state.round`, which stayed at 0 through an
		 * entire PLAY run). PLAY drives the core's own `groupPlayLoop()`, which
		 * calls `SessionGroup.stepRound()` directly — never through this view's
		 * wrapper — so a value set only there is a value PLAY mode never touches.
		 * Round-robin block-ordering guarantees `event.tick` only ever grows
		 * across the merged stream (`group-replay-projection.ts`'s own header
		 * comment makes the same argument), so the max seen so far is exactly the
		 * round the group has reached, regardless of which path drove it there.
		 */
		if (event.tick > state.round) state.round = event.tick;
		deps.onEvent?.(event);
		state.status = group.status;
	}

	return {
		get status() {
			return state.status;
		},
		get groupRunId() {
			return group.groupRunId;
		},
		get mergedEvents() {
			return mergedEvents;
		},
		get world() {
			return world;
		},
		get foregroundedAgentId() {
			return foregroundedAgentId;
		},
		get round() {
			return state.round;
		},
		get outcome() {
			return state.groupOutcome;
		},
		get members(): readonly MemberView[] {
			return memberStates.map((entry) => ({
				agentId: entry.agentId,
				name: entry.name,
				runId: entry.runId,
				get expression(): BotExpression {
					return botExpression({
						tripped: entry.projection.tripped,
						outcome: entry.projection.outcome,
						thinking: entry.projection.thinking,
						lastActionOk: entry.projection.lastActionOk
					});
				},
				// Streamed thought while one is arriving, otherwise the settled one —
				// the same rule `session.svelte.ts`'s own `thought` getter follows.
				get thought() {
					return entry.projection.streaming !== ''
						? entry.projection.streaming
						: entry.projection.thought;
				},
				get streamingNow() {
					return entry.projection.streaming !== '';
				},
				get saying() {
					return entry.projection.saying;
				},
				get narration() {
					return entry.projection.narration;
				},
				get tick() {
					return entry.projection.tick;
				},
				get usage() {
					return entry.projection.usage;
				},
				get outcome() {
					return entry.projection.outcome;
				},
				get finishedReason() {
					return entry.projection.finishedReason;
				},
				get didYouMean() {
					return entry.projection.didYouMean;
				},
				get events() {
					return entry.projection.events;
				},
				get started() {
					return entry.projection.started;
				}
			}));
		},
		get pendingApproval(): GroupPendingApproval | undefined {
			// Derived from each member's own projection, populated by the same
			// `approval.requested`/`approval.resolved` handling `session.svelte.ts`
			// already relies on — not by reaching into `group.sessions[].status`,
			// which would be reading the same fact through a second door.
			const waiting = memberStates.find((entry) => entry.projection.pendingApproval !== undefined);
			if (!waiting?.projection.pendingApproval) return undefined;
			return { agentId: waiting.agentId, ...waiting.projection.pendingApproval };
		},

		start(mode) {
			group.start(mode);
			state.status = group.status;
		},
		async stepRound() {
			// `state.round` is not set here: `absorb` already tracks it from every
			// event's own `tick` as this call streams them out, which is also what
			// keeps it correct when PLAY drives rounds instead (see `absorb`).
			const result = await group.stepRound();
			state.status = group.status;
			return result;
		},
		pause() {
			group.pause();
			state.status = group.status;
		},
		stop() {
			group.stop('stopped from the Playroom');
			state.status = group.status;
		},
		resolveApproval(agentId, approved) {
			// `pendingApproval` is cleared by the `approval.resolved` event rather
			// than here, so the UI stays a pure function of the trace — same rule
			// `session.svelte.ts`'s own `resolveApproval` follows.
			group.resolveApproval(agentId, approved);
			state.status = group.status;
		},
		deliverInput(text) {
			group.deliverInput(text);
		}
	};
}
