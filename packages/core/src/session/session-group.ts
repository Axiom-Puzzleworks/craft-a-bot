import { createSession } from './agent-session.js';
import { isPause, runGuardrailChain } from './guardrail-chain.js';
import { createEventBus } from '../event-bus.js';
import type { AnyAgentSpec } from '../schemas/agent-spec-v2.js';
import type { EngineEvent, EventType } from '../schemas/events.js';
import type { RunOutcome } from '../schemas/shared.js';
import type { AgentSession, RunMode } from '../types/agent-session.js';
import type { Guardrail, GuardrailContext } from '../types/guardrail.js';
import type { CreateSessionGroupDeps, SessionGroup } from '../types/session-group.js';
import type { AgentHandle } from '../types/world.js';

/**
 * The host-level composition WP29 adds (`23-MULTI-AGENT-DESIGN.md` §4.4,
 * §10 stage C). `AgentSession` is untouched by this file's existence — it
 * never learns groups exist, per principle 2. Everything here is built
 * *around* the session, using seams stages A and B already opened:
 * `CreateSessionDeps.world`, `SessionOptions.parentRunId`,
 * `WorldInstance.forAgent`, and the `runId` `AgentSession` now exposes.
 */

type PayloadFor<T extends EventType> = Extract<EngineEvent, { type: T }>['payload'];

/**
 * The one built-in group guardrail V-duo ships (§4.4, §4.9): a combined
 * token ceiling across every member — the `19-…` §7.2 orchestrator
 * chokepoint's simplest possible real rule. Exported so it is directly
 * unit-testable on its own, the same shape `@craftabot/governance`'s
 * per-agent guardrail factories already are (that package cannot be
 * depended on here — hard rule 4's dependency direction runs the other way
 * — so this one lives beside the mechanism it protects instead).
 */
export function createGroupTokenBudgetGuardrail(maxTokens: number): Guardrail {
	return {
		id: 'core/group-token-budget',
		name: 'Group Token Budget',
		description: `Stops the group once its combined usage reaches ${maxTokens} tokens.`,
		hooks: ['pre-think'],
		check(ctx) {
			const total = ctx.usage.inputTokens + ctx.usage.outputTokens;
			if (total < maxTokens) return { allow: true };
			return {
				allow: false,
				reason: `The group's combined token budget (${maxTokens}) has been reached.`,
				disposition: 'stop-run'
			};
		}
	};
}

export function createSessionGroup(deps: CreateSessionGroupDeps): SessionGroup {
	const { members, registry, goalCardId } = deps;
	const options = deps.options ?? {};
	const newId = options.newId ?? (() => crypto.randomUUID());
	const now = options.now ?? (() => new Date().toISOString());
	const random = options.random ?? (() => Math.random());
	const maxRounds = options.maxRounds;
	/** Reused from `SessionOptions.tickDelayMs`'s name, meaning "between rounds" here (§10). */
	const roundDelayMs = options.tickDelayMs ?? 0;

	if (members.length === 0) {
		throw new Error('A session group needs at least one member.');
	}

	const seenAgentIds = new Set<string>();
	for (const member of members) {
		if (seenAgentIds.has(member.spec.id)) {
			throw new Error(
				`Two members of this group share the agent id "${member.spec.id}" — every member needs its own bot.`
			);
		}
		seenAgentIds.add(member.spec.id);
		if (member.spec.goalCardId !== goalCardId) {
			throw new Error(
				`Every member of a group must be built for the same card. "${member.spec.name}" is built ` +
					`for "${member.spec.goalCardId}", not "${goalCardId}" — a session resolves its own world ` +
					`and success condition from its own spec, so a disagreeing member would judge itself ` +
					`against a different game entirely.`
			);
		}
	}

	const goalCard = registry.getGoalCard(goalCardId);
	if (!goalCard) {
		throw new Error(`Unknown goal card "${goalCardId}". Run validateSpec before starting a group.`);
	}

	const worldDefinition = registry.getWorld(goalCard.worldId);
	if (!worldDefinition) {
		throw new Error(
			`Goal card "${goalCard.id}" needs world "${goalCard.worldId}", which is not installed.`
		);
	}

	// The one root instance every member's facade shares (§4.2) — created
	// once, owned only here; members never see it directly.
	const rootWorld = worldDefinition.create(goalCard.layoutId);
	const bindAgent = rootWorld.forAgent;
	if (!bindAgent) {
		throw new Error(
			`World "${worldDefinition.id}" cannot host a group — it has not implemented forAgent ` +
				'(23-MULTI-AGENT-DESIGN.md §4.2). Every world written before WP29 hosts exactly one robot.'
		);
	}

	const groupRunId = newId();

	const groupGuardrails: Guardrail[] = [
		...(deps.groupGuardrails ?? []),
		...(options.groupMaxTokens !== undefined
			? [createGroupTokenBudgetGuardrail(options.groupMaxTokens)]
			: [])
	];

	const sessions: AgentSession[] = members.map((member) => {
		const handle: AgentHandle = { agentId: member.spec.id, name: member.spec.name };
		// Non-null: `bindAgent` was checked above; TS cannot see that through
		// the closure, so it is re-read into a local it can narrow.
		const facade = bindAgent(handle);
		return createSession({
			spec: member.spec,
			registry,
			provider: member.provider,
			...(member.guardrails ? { guardrails: member.guardrails } : {}),
			world: facade,
			options: {
				now,
				newId,
				random,
				parentRunId: groupRunId,
				...(options.budgets ? { budgets: options.budgets } : {}),
				...(options.strategies ? { strategies: options.strategies } : {})
			}
		});
	});

	const events = createEventBus();
	/** The merge (§4.4/§4.7): every member's events in arrival order, plus the group's own. */
	const mergedHistory: EngineEvent[] = [];
	let groupUsage = { inputTokens: 0, outputTokens: 0 };
	const memberOutcomes = new Map<string, RunOutcome>();

	for (const session of sessions) {
		// Subscribed before any session starts, so `run.started` — the first
		// event any of them will ever emit — is never missed (needed for
		// `memberRunIds`, though `runId` is already known without it; this is
		// also what makes the merge itself complete from tick zero).
		session.events.onAny((event) => {
			mergedHistory.push(event);
			if (event.type === 'think.completed') {
				groupUsage = {
					inputTokens: groupUsage.inputTokens + event.payload.response.usage.inputTokens,
					outputTokens: groupUsage.outputTokens + event.payload.response.usage.outputTokens
				};
			}
			events.emit(event);
		});
	}

	/**
	 * Held in one object rather than as separate `let` bindings — the same
	 * shape `agent-session.ts`'s own `run` object uses, and for the same
	 * reason: TypeScript does not reset narrowing of a captured `let` across
	 * the `await`s below, so a bare `phase` variable would appear to still
	 * hold whatever was last assigned to it.
	 */
	const state = {
		phase: 'idle' as 'idle' | 'running' | 'paused' | 'finished',
		round: 0,
		stopRequested: undefined as string | undefined,
		pauseRequested: false,
		/** Which member is mid-tick, so `stop()` can abort exactly that one (§10). */
		actingIndex: -1,
		/**
		 * The outcome `finishGroup` actually decided, set alongside `phase`.
		 * `stepRound()`'s already-finished branch reads this rather than calling
		 * `deriveGroupOutcome()` again: that function reads `memberOutcomes`,
		 * which a member stopped by the chokepoint or by `stop()` (as opposed to
		 * a member that reached its own natural end) never populates — a repeat
		 * call would otherwise silently fall through to its `OUT_OF_STEPS`
		 * default regardless of the real reason the group ended.
		 */
		finalOutcome: undefined as RunOutcome | undefined
	};

	/**
	 * Read through a call, exactly as `agent-session.ts`'s own `currentStatus()`
	 * does and for the same reason: a literal assignment to `state.phase`
	 * earlier in the same function narrows it to that one literal for
	 * TypeScript's purposes, and nothing short of an opaque function call
	 * un-narrows it again before the next check — even though `finishGroup()`,
	 * called in between, genuinely can change it.
	 */
	function currentPhase(): typeof state.phase {
		return state.phase;
	}

	function emitGroupEvent<T extends EventType>(type: T, payload: PayloadFor<T>): void {
		const event = {
			id: newId(),
			runId: groupRunId,
			tick: state.round,
			timestamp: now(),
			type,
			payload
		} as EngineEvent;
		mergedHistory.push(event);
		events.emit(event);
	}

	/**
	 * The orchestrator chokepoint (`19-…` §7.2, §4.4/§4.9), run once per
	 * member immediately before that member's own turn — "the proposed
	 * acting agent" is genuinely that agent, not a fiction. Reuses the exact
	 * chain-runner the per-agent loop uses (`guardrail-chain.ts`), so
	 * first-non-allow-wins and "every check is reported" hold at this
	 * altitude too, with the same two event types.
	 *
	 * A `block-action` disposition and a `stop-run` disposition are treated
	 * identically here — a group chokepoint gates whether a *round*
	 * proceeds, not one call inside it, so there is no "block just this
	 * action" for it to mean. A `pause` verdict is not supported: no built-in
	 * rule produces one and `SessionGroup` has no group-level resume method
	 * to answer it with (only `resolveApproval`, which is per-agent) — a
	 * future rule that returns one fails loudly here rather than silently
	 * doing nothing.
	 */
	async function checkGroupGuardrails(actingSpec: AnyAgentSpec): Promise<boolean> {
		if (groupGuardrails.length === 0) return true;
		const context: GuardrailContext = {
			hook: 'pre-think',
			// The round count, not a cross-member tick sum (§10) — a rule
			// wanting exact per-member totals reads them from `history`.
			tick: state.round,
			spec: actingSpec,
			usage: {
				ticks: state.round,
				inputTokens: groupUsage.inputTokens,
				outputTokens: groupUsage.outputTokens
			},
			worldState: rootWorld.snapshot(),
			history: mergedHistory
		};

		const outcome = await runGuardrailChain(
			groupGuardrails,
			'pre-think',
			context,
			(guardrail, verdict) => {
				const policyCardId = guardrail.policyCardId;
				emitGroupEvent('guardrail.checked', {
					guardrailId: guardrail.id,
					hook: 'pre-think',
					verdict,
					...(policyCardId ? { policyCardId } : {})
				});
				if ('allow' in verdict && !verdict.allow) {
					emitGroupEvent('guardrail.tripped', {
						guardrailId: guardrail.id,
						hook: 'pre-think',
						reason: verdict.reason,
						disposition: verdict.disposition,
						...(policyCardId ? { policyCardId } : {})
					});
				}
			}
		);

		if (isPause(outcome.verdict)) {
			throw new Error(
				`Group guardrail "${outcome.guardrail?.id}" returned a pause verdict, which SessionGroup ` +
					'does not support (23-MULTI-AGENT-DESIGN.md §10) — only per-agent approvals pause a group.'
			);
		}
		if ('allow' in outcome.verdict && !outcome.verdict.allow) {
			finishGroup('STOPPED_BY_GUARDRAIL', outcome.verdict.reason);
			return false;
		}
		return true;
	}

	function everyoneFinished(): boolean {
		return sessions.every((session) => session.status === 'finished');
	}

	/** Priority-ordered from each member's own outcome (§4.4) — deterministic when several disagree. */
	function deriveGroupOutcome(): RunOutcome {
		const outcomes = [...memberOutcomes.values()];
		if (outcomes.includes('ERROR')) return 'ERROR';
		if (outcomes.includes('STOPPED_BY_GUARDRAIL')) return 'STOPPED_BY_GUARDRAIL';
		if (outcomes.includes('STOPPED_BY_USER')) return 'STOPPED_BY_USER';
		if (outcomes.length > 0 && outcomes.every((outcome) => outcome === 'SUCCESS')) return 'SUCCESS';
		return 'OUT_OF_STEPS';
	}

	function finishGroup(outcome: RunOutcome, reason?: string): void {
		if (state.phase === 'finished') return;
		state.phase = 'finished';
		state.finalOutcome = outcome;
		// Every member trace gets a real ending (principle 4) — one still
		// running when the group concludes is stopped, not abandoned mid-run.
		for (const session of sessions) {
			if (session.status !== 'finished') session.stop(reason);
		}
		emitGroupEvent('group.finished', {
			outcome,
			...(reason ? { reason } : {}),
			rounds: state.round,
			usage: { ...groupUsage }
		});
	}

	function startGroup(): void {
		emitGroupEvent('group.started', {
			groupRunId,
			memberRunIds: sessions.map((session) => session.runId),
			memberAgentIds: members.map((member) => member.spec.id),
			goalCardId,
			scheduler: 'round-robin',
			budgets: {
				...(options.groupMaxTokens !== undefined ? { groupMaxTokens: options.groupMaxTokens } : {}),
				...(maxRounds !== undefined ? { maxRounds } : {})
			}
		});
		for (const session of sessions) session.start('step');
	}

	async function stepRound(): Promise<{ round: number; outcome?: RunOutcome }> {
		if (currentPhase() === 'finished') {
			return {
				round: state.round,
				...(state.finalOutcome !== undefined ? { outcome: state.finalOutcome } : {})
			};
		}
		if (currentPhase() === 'idle') startGroup();
		state.phase = 'running';

		if (maxRounds !== undefined && state.round >= maxRounds) {
			finishGroup('OUT_OF_STEPS', `The group reached its round limit (${maxRounds}).`);
			return { round: state.round, outcome: 'OUT_OF_STEPS' };
		}

		state.round += 1;

		for (let index = 0; index < sessions.length; index++) {
			const session = sessions[index];
			const member = members[index];
			if (!session || !member || session.status === 'finished') continue;

			if (state.stopRequested !== undefined) {
				finishGroup('STOPPED_BY_USER', state.stopRequested);
				return { round: state.round, outcome: 'STOPPED_BY_USER' };
			}

			// `checkGroupGuardrails` already called `finishGroup('STOPPED_BY_GUARDRAIL', …)`
			// when it returns false — `deriveGroupOutcome()` would be wrong here,
			// since it reads `memberOutcomes`, which a guardrail-stopped member
			// (ended via `session.stop()`, not a natural `step()` return) never
			// populates. The outcome the chokepoint decided is the one to report.
			const proceed = await checkGroupGuardrails(member.spec);
			if (!proceed) return { round: state.round, outcome: 'STOPPED_BY_GUARDRAIL' };

			state.actingIndex = index;
			const result = await session.step();
			state.actingIndex = -1;
			if (result.outcome) memberOutcomes.set(member.spec.id, result.outcome);
		}

		if (everyoneFinished()) {
			const outcome = deriveGroupOutcome();
			finishGroup(outcome);
			return { round: state.round, outcome };
		}

		if (currentPhase() !== 'finished') state.phase = 'paused';
		return { round: state.round };
	}

	async function groupPlayLoop(): Promise<void> {
		while (
			currentPhase() !== 'finished' &&
			!state.pauseRequested &&
			state.stopRequested === undefined
		) {
			await stepRound();
			if (currentPhase() === 'finished') break;
			if (roundDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, roundDelayMs));
		}
		if (state.pauseRequested) {
			state.pauseRequested = false;
			if (currentPhase() !== 'finished') state.phase = 'paused';
		}
	}

	return {
		groupRunId,
		sessions,
		events,
		get status() {
			if (sessions.some((session) => session.status === 'awaiting-approval'))
				return 'awaiting-approval';
			return state.phase;
		},
		start(mode: RunMode) {
			if (state.phase !== 'idle') return;
			startGroup();
			state.phase = 'running';
			if (mode === 'play') void groupPlayLoop();
			else state.phase = 'paused';
		},
		stepRound,
		pause() {
			state.pauseRequested = true;
			if (state.phase === 'running') state.phase = 'paused';
		},
		resolveApproval(agentId, approved) {
			const index = members.findIndex((member) => member.spec.id === agentId);
			sessions[index]?.resolveApproval(approved);
		},
		stop(reason) {
			state.stopRequested = reason ?? 'stopped by user';
			// Interrupt whichever member is mid-tick so the group actually
			// stops promptly rather than waiting out an in-flight provider
			// call — the same responsiveness a solo session's own stop()
			// promises via `run.inFlight?.abort()`.
			if (state.actingIndex >= 0) sessions[state.actingIndex]?.stop(state.stopRequested);
			if (state.phase !== 'finished' && state.phase !== 'running') {
				finishGroup('STOPPED_BY_USER', state.stopRequested);
			}
		},
		deliverInput(text) {
			// Reaches the shared world exactly once (§4.4) — every member's
			// facade reads the same underlying state, so delivering it through
			// a second member would duplicate it there.
			const live = sessions.find((session) => session.status !== 'finished') ?? sessions[0];
			live?.deliverInput(text);
		}
	};
}
