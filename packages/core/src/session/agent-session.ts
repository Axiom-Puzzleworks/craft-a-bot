import { createEventBus, type EventBus } from '../event-bus.js';
import { toSpecV2 } from '../schemas/agent-spec-v2.js';
import {
	brainSlotSchema,
	memorySlotSchema,
	slotConfig,
	type BrainSlotConfig
} from '../schemas/slot-contracts.js';
import type { GoalCardDefinition } from '../schemas/pack-manifest.js';
import type { EngineEvent, EventType } from '../schemas/events.js';
import type {
	AgentSession,
	CreateSessionDeps,
	RunMode,
	RunOutcome,
	SessionStatus,
	TickResult
} from '../types/agent-session.js';
import type { Guardrail, GuardrailContext, GuardrailHook } from '../types/guardrail.js';
import type { ChatMessage, ChatResponse, ToolSchema } from '../types/provider.js';
import type { ToolDefinition } from '../types/tool.js';
import type { ActionResult, WorldInstance } from '../types/world.js';
import {
	resolveBudgets,
	tickBudgetExhausted,
	tokenBudgetExhausted,
	type Usage
} from './budgets.js';
import { REPROMPT_INSTRUCTION, decide, type Decision } from './decide.js';
import { isAllowed, isPause, runGuardrailChain, type ChainOutcome } from './guardrail-chain.js';
import {
	buildRuntimes,
	collectCalls,
	collectContext,
	collectGuardrails,
	collectSenses,
	collectState,
	collectWorldConfig,
	disposeRuntimes,
	notifyTickEnd,
	resolveReflex
} from './brick-runtimes.js';
import { createMemory, type TickMemory } from './memory.js';
import { EgressRefusedError, createEgressGuard } from '../egress.js';
import { describeFittedBricks, estimateTokens } from './prompt.js';
import { resolveStrategies } from './strategies.js';

/**
 * The engine's heart (02-AGENT-MODEL.md §5): one tick = sense → compose →
 * guard → think → decide → guard → act → remember → judge, with a typed event
 * emitted at every step. Everything the UI ever shows about a run is derived
 * from those events — if it is not in an event, it did not happen (hard rule 3).
 */

/** Provider tool names must be plain identifiers, so `starter/calculator` goes on the wire as `calculator`. */
function wireName(contentId: string): string {
	const lastSlash = contentId.lastIndexOf('/');
	return lastSlash === -1 ? contentId : contentId.slice(lastSlash + 1);
}

type PayloadFor<T extends EventType> = Extract<EngineEvent, { type: T }>['payload'];

/**
 * Provider packs throw typed errors carrying a normalised `kind`
 * (06-LLM-PROVIDERS.md §7). Anything else is an engine fault.
 */
function errorKind(error: unknown): string {
	if (error !== null && typeof error === 'object' && 'kind' in error) {
		const kind = (error as { kind: unknown }).kind;
		if (typeof kind === 'string' && kind !== '') return kind;
	}
	return 'engine';
}

export function createSession(deps: CreateSessionDeps): AgentSession {
	const { registry, provider, options = {} } = deps;
	/*
	 * Either spec shape, normalised to v2 (WP14 slice 3c).
	 *
	 * The loop used to look at a bot through v1's six-key window, because
	 * everything in here read bricks by name. Nothing does: the bricks
	 * contribute, and the two sockets whose config core genuinely needs are read
	 * through slot contracts. The window itself was deleted in WP15 once the last
	 * consumer had moved. A bot saved before the open contract still runs,
	 * because reading one is `migrateAgentSpec`'s job and always was.
	 */
	const spec = toSpecV2(deps.spec);
	const newId = options.newId ?? (() => crypto.randomUUID());
	const now = options.now ?? (() => new Date().toISOString());
	const random = options.random ?? (() => Math.random());
	/**
	 * Every `fetch` a brick or the provider gets is the egress guard's
	 * (`26-…` §6.6, WP41): allowed hosts are filled in as the runtimes are
	 * built below, and a call to any other host is refused with an `error`
	 * event on the trace before the rejection reaches the caller.
	 */
	const egressMode = options.egress ?? 'declared';
	const egress = createEgressGuard({
		mode: egressMode,
		fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
		onRefused: (error) => {
			if (run.status !== 'idle') emit('error', { message: error.message, kind: error.kind });
		}
	});
	const fetchImpl = egress.fetch;
	const getCredential = deps.getCredential ?? (() => undefined);
	/**
	 * Mutable, because the speed dial is a control a person turns *while
	 * watching* (`16-…` §1.6). Captured as a constant, the play loop kept the
	 * delay it was built with and every mid-run change was a silent no-op
	 * (`12-…` D15) — the dial moved, the lamp words changed, and the bot carried
	 * on at exactly the same pace.
	 *
	 * Deliberately not part of the trace. Tick delay changes no decision, no
	 * world state and no outcome; it is how fast a human watches, not anything
	 * the agent did, which is why `run.started` records budgets and model but
	 * not this.
	 */
	let tickDelayMs = options.tickDelayMs ?? 0;
	/** Set only when this session is a group member (WP29, `23-…` §4.5). */
	const parentRunId = options.parentRunId;

	const goalCard = requireGoalCard(registry.getGoalCard(spec.goalCardId), spec.goalCardId);
	/*
	 * A host-supplied world is used exactly as given (WP29, `23-…` §4.5) — the
	 * seam `SessionGroup` will pass an agent-bound facade through. Absent, the
	 * session builds its own world exactly as every session has since WP2.
	 */
	const world = deps.world ?? createWorld(goalCard);
	const budgets = resolveBudgets(deps.spec, registry, options.budgets);
	/*
	 * The two sockets core reads rather than is contributed to (slice 3c). See
	 * `schemas/slot-contracts.ts` for why these are not hooks.
	 */
	const brain: BrainSlotConfig | undefined = slotConfig(
		deps.spec,
		registry,
		'brain',
		brainSlotSchema
	);
	const memoryConfig = slotConfig(deps.spec, registry, 'memory', memorySlotSchema);
	/*
	 * How context is kept and how it is composed (E7). The spec's dial picks the
	 * pairing; `options.strategies` overrides it, which is how a test or the
	 * Workshop selects one directly.
	 */
	const strategies = resolveStrategies(
		memoryConfig?.strategy,
		memoryConfig?.windowSize ?? 0,
		options.strategies
	);
	const memory = createMemory(memoryConfig, strategies.memory);
	const events: EventBus = createEventBus();
	const runId = newId();

	/*
	 * The fitted bricks, live (WP14 slice 3a).
	 *
	 * Built once, from the v2 spec, and asked at the loop's fixed points what
	 * they contribute. The loop no longer knows what an LLM brick or a Memory
	 * brick is — it knows there are bricks, and that each contributes only what
	 * it is (`14-…` §2.1).
	 */
	const runtimes = buildRuntimes({
		spec: deps.spec,
		registry,
		context: {
			random,
			getPolicyCard: (id) => registry.getPolicyCard(id),
			getGuardrailService: (id) => registry.getGuardrailService(id),
			getAction: (id) => registry.getAction(id),
			fetch: fetchImpl,
			getCredential
		}
	});
	egress.allow(provider.egress ?? []);
	for (const fitted of runtimes) egress.allow(fitted.runtime.egress ?? []);
	const fittedBricks = describeFittedBricks(deps.spec, registry);

	/*
	 * Hand the world whatever per-agent config its bricks contributed (WP31
	 * stage F) — once, now that the runtimes exist and before anything can
	 * possibly call `observe`/`perform`. `AgentHandle` stays identity-only;
	 * this is the config-carrying door beside it (`types/world.ts`).
	 */
	world.configure?.(collectWorldConfig(runtimes));

	/*
	 * Policy: the bricks' rules first, then whatever the host adds (slice 3d).
	 *
	 * Until this slice the host compiled the Safety Brick itself and passed the
	 * result in. That put a brick's behaviour outside the brick, which worked for
	 * exactly one brick — a Monitor could watch nothing, because there was no way
	 * for a second brick to contribute policy. The bricks now install their own.
	 *
	 * Brick rules run before host rules deliberately. The chain stops at the
	 * first non-allow verdict (`08-…` §2), and what the builder snapped onto the
	 * baseplate is the policy they can see, reason about and change; a deployment
	 * rule they cannot see should not pre-empt it and take the credit in the
	 * trace.
	 */
	const guardrails: Guardrail[] = [...collectGuardrails(runtimes), ...(deps.guardrails ?? [])];

	/*
	 * What the bot can call, from the bricks that offer it (slice 3b).
	 *
	 * Tools before actions, which is what socket order gives us and what the
	 * model has always been offered.
	 */
	const offered = collectCalls(runtimes);
	/** Which channels the perception bricks opened (slice 3c). */
	const senseChannels = collectSenses(runtimes);
	const { toolSchemas, toolsByWireName } = resolveTools(offered.toolIds);
	const { actionSchemas, actionNames, worldActionNames } = resolveActions(offered.actionIds);
	const callSchemas: ToolSchema[] = [...toolSchemas, ...actionSchemas];
	const toolNames = new Set(toolsByWireName.keys());
	assertNoWireNameCollisions();

	const usage: Usage = { ticks: 0, inputTokens: 0, outputTokens: 0 };
	const history: EngineEvent[] = [];
	events.onAny((event) => history.push(event));

	/**
	 * Held in an object rather than as `let` bindings on purpose: TypeScript does
	 * not reset narrowing of captured `let` variables across the `await`s below,
	 * so `status` would appear to still hold whatever was last assigned to it.
	 */
	const run = {
		status: 'idle' as SessionStatus,
		mode: 'step' as RunMode,
		outcome: undefined as RunOutcome | undefined,
		tick: 0,
		pauseRequested: false,
		stopRequested: undefined as string | undefined,
		pendingApproval: undefined as ((approved: boolean) => void) | undefined,
		/** Set by `declareOutcome` mid-tick; honoured at JUDGE (E2). */
		declaredOutcome: undefined as RunOutcome | undefined,
		declaredReason: undefined as string | undefined,
		/** Things the agent should be told next turn: world refusals, guardrail denials. */
		feedback: [] as string[],
		inFlight: undefined as AbortController | undefined
	};

	function emit<T extends EventType>(type: T, payload: PayloadFor<T>): void {
		// Cast: TypeScript cannot correlate the `type` literal with its payload
		// across a generic call; the PayloadFor<T> parameter already enforces it.
		events.emit({
			id: newId(),
			runId,
			// Every event says which agent it happened to (E10). One agent
			// repeating one id today is what makes two agents cost nothing later.
			agentId: spec.id,
			// Which group episode this run belongs to, when it is one (WP29).
			// Spread rather than assigned, so a solo run's events carry no
			// `parentRunId` key at all under `exactOptionalPropertyTypes` —
			// `undefined` and "absent" are different things to that flag, and
			// only "absent" is what every event before WP29 ever wrote.
			...(parentRunId !== undefined ? { parentRunId } : {}),
			tick: run.tick,
			timestamp: now(),
			type,
			payload
		} as EngineEvent);
	}

	function requireGoalCard(card: GoalCardDefinition | undefined, id: string): GoalCardDefinition {
		if (!card)
			throw new Error(`Unknown goal card "${id}". Run validateSpec before starting a session.`);
		return card;
	}

	function createWorld(card: GoalCardDefinition): WorldInstance {
		const definition = registry.getWorld(card.worldId);
		if (!definition) {
			throw new Error(
				`Goal card "${card.id}" needs world "${card.worldId}", which is not installed.`
			);
		}
		return definition.create(card.layoutId);
	}

	function resolveTools(offeredIds: readonly string[]) {
		const resolved: ToolDefinition[] = [];
		const byWireName = new Map<string, ToolDefinition>();
		for (const id of offeredIds) {
			const tool = registry.getTool(id);
			// Unknown ids and notebook tools without a notebook are simply not
			// offered; validateSpec has already surfaced both to the user.
			if (!tool) continue;
			if (tool.requiresNotebook && !memory.notebookEnabled) continue;
			resolved.push(tool);
			byWireName.set(wireName(tool.id), tool);
		}
		return {
			tools: resolved,
			toolsByWireName: byWireName,
			toolSchemas: resolved.map((tool) => ({
				name: wireName(tool.id),
				description: tool.description,
				parameters: tool.parameters
			}))
		};
	}

	/**
	 * Does this spec entry name that piece of content? (E6, `14-…` §3.)
	 *
	 * Qualified ids are the convention and what the bench now writes. Specs
	 * saved before E6 hold bare local names — `move`, `sight` — and those are
	 * still honoured, because a child's bot on the shelf should not stop
	 * working because the engine tidied its own naming. The tolerance is
	 * deliberately narrow: a bare name matches only when exactly one piece of
	 * content answers to it, so it can never quietly pick between two worlds.
	 */
	function matchesSpecId(
		contentId: string,
		specId: string,
		ambiguous: ReadonlySet<string>
	): boolean {
		if (contentId === specId) return true;
		return wireName(contentId) === specId && !ambiguous.has(specId);
	}

	/** Spec channel ids translated into the names the world knows them by (E6). */
	function senseChannelsForWorld(channels: readonly string[]): string[] {
		const definition = registry.getWorld(goalCard.worldId);
		const senses = definition?.senses ?? [];
		return channels.map((specId) => {
			const match = senses.find((sense) => sense.id === specId || wireName(sense.id) === specId);
			return match ? wireName(match.id) : specId;
		});
	}

	function resolveActions(offeredIds: readonly string[]) {
		const definition = registry.getWorld(goalCard.worldId);
		const all = definition?.actions ?? [];
		const enabled = offeredIds;

		// A bare name is only usable while it names one thing.
		const counts = new Map<string, number>();
		for (const action of all) {
			const short = wireName(action.id);
			counts.set(short, (counts.get(short) ?? 0) + 1);
		}
		const ambiguous = new Set([...counts].filter(([, n]) => n > 1).map(([name]) => name));

		const available = all.filter((action) =>
			enabled.some((specId) => matchesSpecId(action.id, specId, ambiguous))
		);
		return {
			/** Everything this world can do, fitted or not, by the name the model uses. */
			worldActionNames: new Set(all.map((action) => wireName(action.id))),
			actionNames: new Set(available.map((action) => wireName(action.id))),
			actionSchemas: available.map((action) => ({
				// The model is offered the short name: provider tool names must be
				// plain identifiers, so `starter/playroom/move` goes on the wire as
				// `move` exactly as tools already do.
				name: wireName(action.id),
				description: action.description,
				parameters: action.parameters
			}))
		};
	}

	/**
	 * Two calls cannot share the name the model knows them by (E6, closing the
	 * second half of `12-…` D4).
	 *
	 * Wire names are what the provider's function-calling API sees, and it has
	 * no namespaces. Before this, a second pack shipping its own `calculator`
	 * silently replaced the first in the lookup map, and a tool sharing a name
	 * with a world action resolved as the action — both without a word to
	 * anybody. A build that cannot name its own capabilities unambiguously is
	 * not a build to start a run with.
	 */
	function assertNoWireNameCollisions(): void {
		const seen = new Map<string, string>();
		const clashes: string[] = [];
		for (const schema of callSchemas) {
			const previous = seen.get(schema.name);
			if (previous !== undefined) clashes.push(schema.name);
			else seen.set(schema.name, schema.name);
		}
		if (clashes.length > 0) {
			throw new Error(
				`This bot has more than one thing called "${clashes[0]}". ` +
					'Two tools or actions cannot share the name the model calls them by — ' +
					'take one of them off the bot, or rename it in its pack.'
			);
		}
	}

	/**
	 * What the current tick has in hand for guardrails (`29-…` §4.2): reset at
	 * `tick.started`, filled as SENSE, COMPOSE and THINK happen. Spread into
	 * every context of the tick so a hook sees exactly what exists by then.
	 */
	let inHand: Pick<GuardrailContext, 'observation' | 'messages' | 'response'> = {};

	function guardrailContext(
		hook: GuardrailHook,
		proposed?: GuardrailContext['proposed']
	): GuardrailContext {
		return {
			hook,
			...inHand,
			tick: run.tick,
			spec,
			usage: { ...usage },
			worldState: world.snapshot(),
			/*
			 * A view, not a copy (E9, `14-…` §3).
			 *
			 * This used to be `[...history]`, rebuilt for every guardrail on
			 * every hook — three hooks a tick, four rules fitted, a history that
			 * grows by a dozen events a tick and is inflated further by
			 * `think.token`. That is O(events²) work to hand a pure function a
			 * list it only ever reads (`12-…` D8).
			 *
			 * `ReadonlyArray` is the guarantee, and guardrails are pure by
			 * contract (`08-…` §2), so the copy was buying nothing but time. The
			 * one thing a guardrail must not do is keep hold of it: the array is
			 * live and grows underneath.
			 */
			history,
			...(proposed ? { proposed } : {})
		};
	}

	async function runGuards(
		hook: GuardrailHook,
		proposed?: GuardrailContext['proposed']
	): Promise<ChainOutcome> {
		return runGuardrailChain(
			guardrails,
			hook,
			guardrailContext(hook, proposed),
			(guardrail, verdict, external) => {
				const policyCardId = guardrail.policyCardId;
				// A hosted guardrail's own call, immediately before the verdict it
				// produced (`25-…` §4.7) — never emitted by the guardrail itself.
				if (external) {
					emit('guardrail.external', { guardrailId: guardrail.id, hook, ...external });
				}
				emit('guardrail.checked', {
					guardrailId: guardrail.id,
					hook,
					verdict,
					...(policyCardId ? { policyCardId } : {})
				});
				if ('allow' in verdict && !verdict.allow) {
					emit('guardrail.tripped', {
						guardrailId: guardrail.id,
						hook,
						reason: verdict.reason,
						disposition: verdict.disposition,
						...(policyCardId ? { policyCardId } : {})
					});
				}
			}
		);
	}

	/**
	 * A post-act rule may stop the run, and nothing else (E1, `14-…` §3).
	 *
	 * By the time this hook runs the action has already happened, so
	 * `block-action` has nothing left to block and `pause` has nothing left to
	 * ask about. `14-…` §3 says to reject those "at registration"; a guardrail
	 * declares its *hooks* up front but not its *dispositions*, so the earliest
	 * honest moment is the one where the verdict actually appears. Failing
	 * loudly beats the alternative — quietly ignoring it is precisely the
	 * behaviour D1 was.
	 */
	function rejectMeaninglessPostAct(outcome: ChainOutcome): void {
		const verdict = outcome.verdict;
		const blocks = 'allow' in verdict && !verdict.allow && verdict.disposition === 'block-action';
		if (!isPause(verdict) && !blocks) return;
		throw new Error(
			`Guardrail "${outcome.guardrail?.id ?? 'unknown'}" returned ` +
				`${isPause(verdict) ? 'pause' : 'block-action'} at post-act, where the action has ` +
				'already happened. Post-act rules may allow, or stop the run.'
		);
	}

	function finish(outcome: RunOutcome, reason?: string): TickResult {
		run.outcome = outcome;
		run.status = 'finished';
		// Every brick gets to put itself away, once, however the run ended.
		disposeRuntimes(runtimes);
		emit('run.finished', {
			outcome,
			ticks: usage.ticks,
			usage: tokenUsage(),
			// Why it ended, when the outcome alone does not say — a declared
			// success and a predicate success are both SUCCESS, and an audit
			// wants to know which (E2).
			...(reason !== undefined ? { reason } : {})
		});
		return { tick: run.tick, outcome };
	}

	function tokenUsage() {
		return { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
	}

	/** The longest we will sit and wait for a rate limit, whatever the provider asks. */
	const MAX_RETRY_WAIT_MS = 5_000;

	/**
	 * One retry, and only for a rate limit (E11, `14-…` §3).
	 *
	 * `retryAfterMs` was parsed off the wire and thrown away, so "try again in
	 * two seconds" ended the run (`12-…` D10). One bounded retry is the whole
	 * policy: a second failure is a real failure, and a bot that quietly
	 * retried forever would hide exactly the cost lesson this toy is for.
	 */
	async function callProviderWithRetry(messages: ChatMessage[]): Promise<ChatResponse> {
		try {
			return await callProvider(messages);
		} catch (error) {
			const wait = retryDelayFor(error);
			if (wait === undefined) throw error;

			emit('provider.retried', { kind: errorKind(error), afterMs: wait, attempt: 1 });
			await new Promise((resolve) => setTimeout(resolve, wait));
			return callProvider(messages);
		}
	}

	/** How long to wait, or undefined when this is not a retryable failure. */
	function retryDelayFor(error: unknown): number | undefined {
		if (errorKind(error) !== 'rate-limited') return undefined;
		const asked =
			error !== null && typeof error === 'object' && 'retryAfterMs' in error
				? (error as { retryAfterMs: unknown }).retryAfterMs
				: undefined;
		const requested = typeof asked === 'number' && Number.isFinite(asked) && asked >= 0 ? asked : 0;
		return Math.min(requested, MAX_RETRY_WAIT_MS);
	}

	async function callProvider(messages: ChatMessage[]): Promise<ChatResponse> {
		const controller = new AbortController();
		run.inFlight = controller;
		const timeout = setTimeout(() => controller.abort(), budgets.requestTimeoutMs);
		try {
			emit('think.started', {
				wireModel: cartridgeModel(),
				providerId: provider.id,
				cartridgeId: brain?.cartridgeId ?? ''
			});
			const response = await provider.chat(
				{
					model: cartridgeModel(),
					messages,
					...(callSchemas.length > 0 ? { tools: callSchemas } : {}),
					temperature: brain?.temperature ?? 0,
					maxTokens: brain?.maxTokens ?? 256
				},
				{
					signal: controller.signal,
					onToken: (delta) => emit('think.token', { delta })
				}
			);
			usage.inputTokens += response.usage.inputTokens;
			usage.outputTokens += response.usage.outputTokens;
			emit('think.completed', { response });
			return response;
		} finally {
			clearTimeout(timeout);
			run.inFlight = undefined;
		}
	}

	function cartridgeModel(): string {
		const cartridgeId = brain?.cartridgeId;
		return (cartridgeId ? registry.getCartridge(cartridgeId)?.model : undefined) ?? 'mock';
	}

	/**
	 * The refusal for an action the world knows but this bot was not given. Kept
	 * in the agent's own voice, in the second person, like every other narration
	 * it reads back (pack-starter's `strings.ts` sets the tone).
	 */
	function unavailableActionNarration(name: string): string {
		return `You want to ${name}, but you have not been built with any way to do it.`;
	}

	/**
	 * Tell the agent, next turn, that the world said no (E3, `14-…` §3).
	 *
	 * A failed action carries the one fact the next decision depends on: that it
	 * is too far away, that the lid is locked, that it walked into the table.
	 * Those narrations used to reach the Memory brick's window and nowhere else,
	 * so a bot built without Memory — the first bot anyone builds — could not
	 * see its own failures at all, and kept retrying the salient idea whose
	 * failure was invisible to it until its steps ran out (`12-…` C2).
	 *
	 * Feedback is the "Right now:" section, which every prompt carries, so the
	 * signal lands whether or not a Memory brick is fitted. When one *is*
	 * fitted the narration deliberately appears twice — once as recent history,
	 * once as the thing that just happened. That is the same distinction a
	 * person makes between remembering and noticing.
	 */
	function noteWorldFailure(narration: string): void {
		run.feedback.push(narration);
	}

	async function performCall(decision: Extract<Decision, { kind: 'call' }>): Promise<{
		summary: string;
		result: string;
		/** Whether the attempt succeeded (WP30 stage B) — see `TickMemory.ok`. */
		ok: boolean;
	}> {
		const { call } = decision;
		if (call.kind === 'tool') {
			const tool = toolsByWireName.get(call.name);
			/* istanbul ignore next -- decide() only labels a call a tool when it is in this map */
			if (!tool) return { summary: call.name, result: 'That tool is not on your belt.', ok: false };

			const started = Date.now();
			const result = await tool.execute(call.arguments, {
				tick: run.tick,
				notebook: memory.notebook,
				random
			});
			emit('tool.executed', {
				name: call.name,
				arguments: call.arguments,
				result: result.output,
				// The structured half, so a consumer need not re-parse prose (E8).
				...(result.data !== undefined ? { data: result.data } : {}),
				durationMs: Math.max(0, Date.now() - started)
			});
			return { summary: `used the ${call.name} tool`, result: result.output, ok: result.ok };
		}

		/*
		 * The bot can only do what it was built to do.
		 *
		 * Without this, `world.perform` runs any action the *world* defines,
		 * whether or not the Actions brick granted it — so a bot with no Actions
		 * brick could still move, speak and pick things up, and the brick was
		 * decorative. It also made the first lesson in the teaching arc
		 * (02-AGENT-MODEL.md §9: "bot thinks but can't act") impossible to
		 * demonstrate, which is how it was found.
		 *
		 * Only for actions the world *does* have. A name the world has never heard
		 * of still goes through to the world, which refuses it in character — that
		 * is the path 08 §3 describes, and the two refusals say different things:
		 * "that is not a thing here" versus "you have no way to do that".
		 */
		if (worldActionNames.has(call.name) && !actionNames.has(call.name)) {
			const narration = unavailableActionNarration(call.name);
			emit('action.performed', {
				name: call.name,
				arguments: call.arguments,
				result: { ok: false, narration, stateDiff: [] }
			});
			noteWorldFailure(narration);
			return { summary: `tried to ${call.name}`, result: narration, ok: false };
		}

		const actionResult: ActionResult = world.perform({
			name: call.name,
			arguments: call.arguments
		});
		emit('action.performed', {
			name: call.name,
			arguments: call.arguments,
			result: actionResult
		});
		if (actionResult.ok) {
			emit('world.changed', { state: world.snapshot() });
		} else {
			noteWorldFailure(actionResult.narration);
		}
		return {
			summary: `tried to ${call.name}`,
			result: actionResult.narration,
			ok: actionResult.ok
		};
	}

	async function tick(): Promise<TickResult> {
		usage.ticks += 1;
		run.tick = usage.ticks;
		emit('tick.started', {});
		inHand = {};
		// Counted before anything happens, so "did it write this tick?" is a
		// comparison rather than a guess (E8).
		const notebookLinesAtTickStart = memory.writes();

		// 1. SENSE
		const channels = senseChannels;
		// The world names its senses in its own terms; the spec names them in
		// the registry's (E6). The event records what the brick declares.
		const worldChannels = senseChannelsForWorld(channels);
		const observation = world.observe(worldChannels);
		emit('sense', { channels: [...channels], observation });
		inHand = { observation };

		// REFLEX (WP30 stage A, If/Then) — a fitted brick may propose a call
		// before the brain is ever asked. Checked here, right after SENSE,
		// because it decides whether COMPOSE/THINK/DECIDE happen at all.
		const reflex = resolveReflex(runtimes, { tick: run.tick, channels, observation });

		let thought: string;
		let decision: Decision;

		if (reflex !== undefined) {
			// Still checked against pre-think policy — a stop-run policy card's
			// deadline applies to every tick, not only ones the brain reasons
			// through, or a reflex becomes a way around whatever pre-think
			// already guards. Token budget is deliberately not checked here: a
			// reflex spends no tokens, so gating a free action on a spend limit
			// would refuse it for a resource it never touches.
			const preThink = await runGuards('pre-think');
			if (!('allow' in preThink.verdict && preThink.verdict.allow)) {
				return finish('STOPPED_BY_GUARDRAIL');
			}
			thought = reflex.thought;
			decision = {
				kind: 'call',
				thought,
				call: { kind: reflex.kind, name: reflex.name, arguments: reflex.arguments }
			};
			emit('decision', { thought, call: { ...decision.call }, source: 'reflex' });
		} else {
			// 2. COMPOSE
			const progress = world.describeProgress?.(goalCard.successCondition, worldChannels);
			const notebookLines = memory.notebook.read();
			const promptInput = {
				brickSections: collectContext(runtimes, { tick: run.tick, channels }).sections ?? [],
				goalCard,
				// The goal its builder wrote, if they wrote one (`16-…` §2.5). Captured
				// since WP5 and never passed on until now.
				...(spec.customGoalText !== undefined ? { customGoalText: spec.customGoalText } : {}),
				observation: observation.text,
				memoryWindow: memory.window(),
				fittedBricks,
				feedback: run.feedback,
				...(notebookLines.length > 0 ? { notebookLines } : {}),
				...(progress !== undefined ? { progress } : {})
			};
			let messages = strategies.prompt.compose(promptInput);
			run.feedback = [];
			emit('prompt.composed', { messages, estimatedTokens: estimateTokens(messages) });
			inHand = { ...inHand, messages };

			// 3. GUARD (pre-think)
			const preThink = await runGuards('pre-think');
			if (!('allow' in preThink.verdict && preThink.verdict.allow)) {
				return finish('STOPPED_BY_GUARDRAIL');
			}
			if (tokenBudgetExhausted(usage, budgets)) return finish('OUT_OF_STEPS');

			// 4. THINK + 5. DECIDE, with the one permitted re-prompt on a mumble.
			let response = await callProviderWithRetry(messages);
			decision = decide(response, { toolNames, actionNames });
			if (decision.kind === 'malformed') {
				messages = [...messages, { role: 'user', content: REPROMPT_INSTRUCTION }];
				emit('prompt.composed', { messages, estimatedTokens: estimateTokens(messages) });
				response = await callProviderWithRetry(messages);
				decision = decide(response, { toolNames, actionNames });
			}

			thought = decision.kind === 'malformed' ? '' : decision.thought;
			inHand = { ...inHand, messages, response };
			emit('decision', {
				thought,
				call: decision.kind === 'call' ? { ...decision.call } : null,
				source: 'brain'
			});
		}

		// 6. GUARD (pre-act) + 7. ACT
		let acted: { summary: string; result: string; ok: boolean } | undefined;
		/** Set when a guardrail or a person stopped the call before it ran. */
		let refused: string | undefined;
		if (decision.kind === 'call') {
			const proposed = {
				kind: decision.call.kind,
				name: decision.call.name,
				arguments: decision.call.arguments
			};
			const preAct = await runGuards('pre-act', proposed);

			if (isPause(preAct.verdict)) {
				// Arm the resolver *before* announcing, so a host that calls
				// resolveApproval() synchronously from its own event handler is not
				// silently ignored — that would deadlock the run.
				const approval = awaitApproval();
				emit('approval.requested', { proposed, reason: preAct.verdict.reason });
				const approved = await approval;
				emit('approval.resolved', { approved });
				if (approved) {
					acted = await performCall(decision);
				} else {
					const message = `You tried to ${decision.call.name}, but a person said no: ${preAct.verdict.reason}`;
					run.feedback.push(message);
					refused = message;
				}
			} else if (!('allow' in preAct.verdict && preAct.verdict.allow)) {
				const message = `You tried to ${decision.call.name}, but a safety rule stopped you: ${preAct.verdict.reason}`;
				run.feedback.push(message);
				refused = message;
				if (preAct.verdict.disposition === 'stop-run') return finish('STOPPED_BY_GUARDRAIL');
			} else {
				acted = await performCall(decision);
			}
		} else if (decision.kind === 'malformed') {
			// The bot mumbled twice — a wasted tick (03-UI-UX-DESIGN.md §9).
			run.feedback.push('Your last two replies were empty. Try again, and say what you are doing.');
		}

		// 8. REMEMBER
		const record: TickMemory = {
			tick: run.tick,
			// The short form when the world offers one; see `Observation.summary`.
			observation: observation.summary ?? observation.text,
			thought,
			...(acted ? { action: acted.summary, result: acted.result, ok: acted.ok } : {}),
			...(refused !== undefined ? { refused } : {}),
			/*
			 * The proposal itself, kept alongside its narration (E7). Recorded
			 * whether it ran, was refused or was blocked — a transcript needs the
			 * call that the refusal answers, and `action` had already reduced it to
			 * the prose "tried to move".
			 */
			...(decision.kind === 'call'
				? {
						call: {
							kind: decision.call.kind,
							name: decision.call.name,
							arguments: decision.call.arguments
						}
					}
				: {})
		};
		/*
		 * Every brick hears what happened, whether or not a Memory brick is
		 * fitted. `onTickEnd` is the hook a brick learns or records from, and
		 * gating it on somebody else's brick would mean a Monitor could only
		 * watch a bot that also had a backpack.
		 */
		notifyTickEnd(runtimes, record);
		if (memory.enabled) {
			memory.remember(record);
			emit('memory.updated', {
				windowSize: memoryConfig?.windowSize ?? 0,
				entries: memory.size(),
				notebookUpdated: memory.writes() > notebookLinesAtTickStart
			});
		}
		/*
		 * A pack-contributed brick's own live state (WP30 stage C) — unlike
		 * Memory above, core has no privileged view into what these bricks
		 * hold, so this is generic: whatever `contributeState` returned, for
		 * whichever fitted bricks returned anything this tick.
		 */
		for (const contribution of collectState(runtimes)) {
			emit('brick.state', contribution);
		}

		/*
		 * 9. JUDGE
		 *
		 * The post-act hook is where *outcome monitors* live (E1, `14-…` §3):
		 * rules that look at what actually happened rather than at what was
		 * proposed. Its verdict used to be computed and thrown away, so a
		 * post-act rule could neither stop a run nor say anything that mattered
		 * — the trace showed a check firing and the run carried blithely on
		 * (`12-…` D1). The Monitor brick (`14-…` §5.3) is built entirely on this
		 * hook, so it had to become real before anything could be built on it.
		 *
		 * Only `stop-run` means anything here. `block-action` is refused at
		 * registration, because by this point the action has already happened
		 * and a rule claiming to block it would be lying to the trace.
		 */
		const postAct = await runGuards('post-act');
		if (!isAllowed(postAct.verdict)) {
			rejectMeaninglessPostAct(postAct);
			emit('tick.completed', { outcome: 'STOPPED_BY_GUARDRAIL' });
			return finish('STOPPED_BY_GUARDRAIL');
		}
		// A judgement made from outside beats the world's own (E2): somebody
		// pressed "goal achieved" while this tick was in flight.
		if (run.declaredOutcome !== undefined) {
			const declared = run.declaredOutcome;
			emit('tick.completed', { outcome: declared });
			return finish(declared, run.declaredReason);
		}
		if (world.test(goalCard.successCondition)) {
			emit('tick.completed', { outcome: 'SUCCESS' });
			return finish('SUCCESS');
		}
		if (run.stopRequested !== undefined) {
			emit('tick.completed', { outcome: 'STOPPED_BY_USER' });
			return finish('STOPPED_BY_USER');
		}
		if (tickBudgetExhausted(usage, budgets)) {
			emit('tick.completed', { outcome: 'OUT_OF_STEPS' });
			return finish('OUT_OF_STEPS');
		}
		emit('tick.completed', {});
		return { tick: run.tick };
	}

	function awaitApproval(): Promise<boolean> {
		run.status = 'awaiting-approval';
		return new Promise<boolean>((resolve) => {
			run.pendingApproval = (approved) => {
				run.pendingApproval = undefined;
				run.status = 'running';
				resolve(approved);
			};
		});
	}

	/**
	 * Read the status through a call so TypeScript stops narrowing it to whatever
	 * was last assigned — `tick()` legitimately changes it from under us.
	 */
	function currentStatus(): SessionStatus {
		return run.status;
	}

	async function safeTick(): Promise<TickResult> {
		if (currentStatus() === 'finished') {
			return { tick: run.tick, ...(run.outcome ? { outcome: run.outcome } : {}) };
		}
		if (currentStatus() === 'idle') startRun('step');

		run.status = 'running';
		try {
			const result = await tick();
			if (currentStatus() !== 'finished' && currentStatus() !== 'awaiting-approval') {
				run.status = 'paused';
			}
			return result;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			// A provider pack throws a typed error carrying its normalised `kind`
			// (06-LLM-PROVIDERS.md §7). Passing it through means the trace says
			// "bad-key" rather than a generic engine failure, which is what the
			// friendly error copy in 03 §9 keys off.
			// An egress refusal is already on the trace — the guard wrote it before
			// the rejection reached the caller (WP41) — so it is not written twice.
			if (!(error instanceof EgressRefusedError)) {
				emit('error', { message, kind: errorKind(error) });
			}
			return finish('ERROR');
		}
	}

	function startRun(runMode: RunMode): void {
		run.mode = runMode;
		run.status = 'running';
		run.tick = 0;
		emit('run.started', {
			mode: runMode,
			// The limits and the model, recorded where the run begins (E8). An
			// audit asks "under what constraints, and with what?" and until WP13
			// the trace could answer neither.
			budgets: {
				maxTicks: budgets.maxTicks,
				maxTokens: budgets.maxTokens,
				requestTimeoutMs: budgets.requestTimeoutMs
			},
			providerId: provider.id,
			wireModel: cartridgeModel(),
			cartridgeId: brain?.cartridgeId ?? '',
			// Written only when the host named a mode (WP41): the guard runs
			// either way, but a trace written before the field existed — the
			// golden traces among them — keeps its bytes.
			...(options.egress !== undefined
				? { egress: { mode: egressMode, hosts: egress.hosts() } }
				: {}),
			strategies: { memory: strategies.memory.id, prompt: strategies.prompt.id }
		});
		// The opening scene needs an event behind it too. Without this the UI would
		// have to reach into the world to draw the first frame, and a replayer
		// would have no starting state — both of which break hard rule 3
		// ("if it isn't in an event, it didn't happen").
		emit('world.changed', { state: world.snapshot() });
	}

	async function playLoop(): Promise<void> {
		while (
			currentStatus() !== 'finished' &&
			!run.pauseRequested &&
			run.stopRequested === undefined
		) {
			await safeTick();
			if (currentStatus() === 'finished') break;
			if (tickDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, tickDelayMs));
		}
		if (run.pauseRequested) {
			run.pauseRequested = false;
			if (currentStatus() !== 'finished') run.status = 'paused';
		}
	}

	return {
		spec,
		runId,
		get status() {
			return run.status;
		},
		events,
		start(runMode) {
			if (run.status === 'finished') return;
			startRun(runMode);
			if (runMode === 'play') void playLoop();
			else run.status = 'paused';
		},
		step: safeTick,
		setTickDelayMs(ms) {
			tickDelayMs = Math.max(0, ms);
		},
		pause() {
			run.pauseRequested = true;
			if (run.status === 'running' && run.mode === 'step') run.status = 'paused';
		},
		resolveApproval(approved) {
			run.pendingApproval?.(approved);
		},
		stop(reason) {
			run.stopRequested = reason ?? 'stopped by user';
			run.inFlight?.abort();
			if (run.status !== 'finished') {
				// A stop between ticks never reaches JUDGE, so end the run here.
				if (run.status !== 'running') finish('STOPPED_BY_USER');
			}
		},

		/**
		 * Something said to the bot from outside the world (E2, `14-…` §3).
		 *
		 * The Hearing channel has always been able to *report* what was said,
		 * and there has never been a way to say anything: `receiveInput` sat on
		 * the world with no caller, because the session never exposed the world
		 * (`12-…` D2). A sense with no input path is a sense that can only ever
		 * report silence, which is a strange thing to charge prompt tokens for.
		 *
		 * Traced, because everything the bot perceives has to be in the trace —
		 * "who told it that?" is one of the audit questions (`08-…` §4), and a
		 * message from outside the simulation is exactly the kind of input a
		 * governance review cares about (`19-…` §2: untrusted input is the
		 * first link in the injection chain this toy exists to teach).
		 */
		deliverInput(text) {
			if (run.status === 'finished') return;
			world.receiveInput?.(text);
			emit('input.delivered', { text, heard: world.receiveInput !== undefined });
		},

		/**
		 * End the run on a judgement the world cannot make (E2, `14-…` §3).
		 *
		 * Free Play has no predicate — the goal is whatever the user wrote on
		 * the card — so before this the only way out was the step budget or the
		 * stop button, and a bot that had done exactly what was asked finished
		 * as STOPPED_BY_USER or OUT_OF_STEPS. The scrapbook then remembered a
		 * success as a failure, which is a poor reward for a job well done.
		 *
		 * The bot can also end a free-play run itself, by celebrating (E12,
		 * WP11). Both endings are deliberate and both are traced; which one
		 * happened is the interesting part, so `reason` records it.
		 */
		declareOutcome(outcome, reason) {
			if (run.status === 'finished') return;
			run.declaredReason = reason;
			if (run.status === 'running') {
				// Mid-tick: let the loop finish what it is doing and end there,
				// so a half-performed action is never left dangling.
				run.declaredOutcome = outcome;
				return;
			}
			finish(outcome, reason);
		}
	};
}
