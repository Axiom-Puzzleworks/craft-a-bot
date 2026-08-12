import { createEventBus, type EventBus } from '../event-bus.js';
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
import type { GuardrailContext, GuardrailHook } from '../types/guardrail.js';
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
import { isPause, runGuardrailChain, type ChainOutcome } from './guardrail-chain.js';
import { createMemory, type TickMemory } from './memory.js';
import { composePrompt, describeFittedBricks, estimateTokens } from './prompt.js';

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

export function createSession(deps: CreateSessionDeps): AgentSession {
	const { spec, registry, provider, guardrails, options = {} } = deps;
	const newId = options.newId ?? (() => crypto.randomUUID());
	const now = options.now ?? (() => new Date().toISOString());
	const random = options.random ?? (() => Math.random());
	const tickDelayMs = options.tickDelayMs ?? 0;

	const goalCard = requireGoalCard(registry.getGoalCard(spec.goalCardId), spec.goalCardId);
	const world = createWorld(goalCard);
	const budgets = resolveBudgets(spec, options.budgets);
	const memory = createMemory(spec.bricks.memory);
	const events: EventBus = createEventBus();
	const runId = newId();

	const { toolSchemas, toolsByWireName } = resolveTools();
	const { actionSchemas, actionNames } = resolveActions();
	const callSchemas: ToolSchema[] = [...toolSchemas, ...actionSchemas];
	const toolNames = new Set(toolsByWireName.keys());

	const usage: Usage = { ticks: 0, inputTokens: 0, outputTokens: 0 };
	const fittedBricks = describeFittedBricks(spec);
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

	function resolveTools() {
		const resolved: ToolDefinition[] = [];
		const byWireName = new Map<string, ToolDefinition>();
		for (const id of spec.bricks.tools?.enabled ?? []) {
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

	function resolveActions() {
		const definition = registry.getWorld(goalCard.worldId);
		const enabled = new Set(spec.bricks.actions?.enabled ?? []);
		const available = (definition?.actions ?? []).filter((action) => enabled.has(action.id));
		return {
			actionNames: new Set(available.map((action) => action.id)),
			actionSchemas: available.map((action) => ({
				name: action.id,
				description: action.description,
				parameters: action.parameters
			}))
		};
	}

	function guardrailContext(
		hook: GuardrailHook,
		proposed?: GuardrailContext['proposed']
	): GuardrailContext {
		return {
			hook,
			tick: run.tick,
			spec,
			usage: { ...usage },
			worldState: world.snapshot(),
			history: [...history],
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
			(guardrail, verdict) => {
				emit('guardrail.checked', { guardrailId: guardrail.id, hook, verdict });
				if ('allow' in verdict && !verdict.allow) {
					emit('guardrail.tripped', {
						guardrailId: guardrail.id,
						hook,
						reason: verdict.reason,
						disposition: verdict.disposition
					});
				}
			}
		);
	}

	function finish(reason: RunOutcome): TickResult {
		run.outcome = reason;
		run.status = 'finished';
		emit('run.finished', { outcome: reason, ticks: usage.ticks, usage: tokenUsage() });
		return { tick: run.tick, outcome: reason };
	}

	function tokenUsage() {
		return { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
	}

	async function callProvider(messages: ChatMessage[]): Promise<ChatResponse> {
		const controller = new AbortController();
		run.inFlight = controller;
		const timeout = setTimeout(() => controller.abort(), budgets.requestTimeoutMs);
		try {
			emit('think.started', { model: spec.bricks.llm?.cartridgeId ?? 'unknown' });
			const response = await provider.chat(
				{
					model: cartridgeModel(),
					messages,
					...(callSchemas.length > 0 ? { tools: callSchemas } : {}),
					temperature: spec.bricks.llm?.temperature ?? 0,
					maxTokens: spec.bricks.llm?.maxTokens ?? 256
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
		const cartridgeId = spec.bricks.llm?.cartridgeId;
		return (cartridgeId ? registry.getCartridge(cartridgeId)?.model : undefined) ?? 'mock';
	}

	async function performCall(decision: Extract<Decision, { kind: 'call' }>): Promise<{
		summary: string;
		result: string;
	}> {
		const { call } = decision;
		if (call.kind === 'tool') {
			const tool = toolsByWireName.get(call.name);
			/* istanbul ignore next -- decide() only labels a call a tool when it is in this map */
			if (!tool) return { summary: call.name, result: 'That tool is not on your belt.' };

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
				durationMs: Math.max(0, Date.now() - started)
			});
			return { summary: `used the ${call.name} tool`, result: result.output };
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
		}
		return { summary: `tried to ${call.name}`, result: actionResult.narration };
	}

	async function tick(): Promise<TickResult> {
		usage.ticks += 1;
		run.tick = usage.ticks;
		emit('tick.started', {});

		// 1. SENSE
		const channels = spec.bricks.sense?.channels ?? [];
		const observation = world.observe(channels);
		emit('sense', { channels: [...channels], observation });

		// 2. COMPOSE
		const promptInput = {
			spec,
			goalCard,
			observation: observation.text,
			memoryWindow: memory.window(),
			fittedBricks,
			feedback: run.feedback
		};
		let messages = composePrompt(promptInput);
		run.feedback = [];
		emit('prompt.composed', { messages, estimatedTokens: estimateTokens(messages) });

		// 3. GUARD (pre-think)
		const preThink = await runGuards('pre-think');
		if (!('allow' in preThink.verdict && preThink.verdict.allow)) {
			return finish('STOPPED_BY_GUARDRAIL');
		}
		if (tokenBudgetExhausted(usage, budgets)) return finish('OUT_OF_STEPS');

		// 4. THINK + 5. DECIDE, with the one permitted re-prompt on a mumble.
		let response = await callProvider(messages);
		let decision = decide(response, { toolNames, actionNames });
		if (decision.kind === 'malformed') {
			messages = [...messages, { role: 'user', content: REPROMPT_INSTRUCTION }];
			emit('prompt.composed', { messages, estimatedTokens: estimateTokens(messages) });
			response = await callProvider(messages);
			decision = decide(response, { toolNames, actionNames });
		}

		const thought = decision.kind === 'malformed' ? '' : decision.thought;
		emit('decision', {
			thought,
			call: decision.kind === 'call' ? { ...decision.call } : null
		});

		// 6. GUARD (pre-act) + 7. ACT
		let acted: { summary: string; result: string } | undefined;
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
					run.feedback.push(
						`You tried to ${decision.call.name}, but a person said no: ${preAct.verdict.reason}`
					);
				}
			} else if (!('allow' in preAct.verdict && preAct.verdict.allow)) {
				run.feedback.push(
					`You tried to ${decision.call.name}, but a safety rule stopped you: ${preAct.verdict.reason}`
				);
				if (preAct.verdict.disposition === 'stop-run') return finish('STOPPED_BY_GUARDRAIL');
			} else {
				acted = await performCall(decision);
			}
		} else if (decision.kind === 'malformed') {
			// The bot mumbled twice — a wasted tick (03-UI-UX-DESIGN.md §9).
			run.feedback.push('Your last two replies were empty. Try again, and say what you are doing.');
		}

		// 8. REMEMBER
		if (memory.enabled) {
			const entry: TickMemory = {
				tick: run.tick,
				observation: observation.text,
				thought,
				...(acted ? { action: acted.summary, result: acted.result } : {})
			};
			memory.remember(entry);
			emit('memory.updated', {
				windowSize: spec.bricks.memory?.windowSize ?? 0,
				entries: memory.size(),
				notebookUpdated: memory.notebookEnabled
			});
		}

		// 9. JUDGE
		await runGuards('post-act');
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
			emit('error', { message, kind: 'engine' });
			return finish('ERROR');
		}
	}

	function startRun(runMode: RunMode): void {
		run.mode = runMode;
		run.status = 'running';
		run.tick = 0;
		emit('run.started', { mode: runMode });
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
		}
	};
}
