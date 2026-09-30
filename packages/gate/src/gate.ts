import {
	buildTraceFile,
	canonicalJson,
	createEgressGuard,
	createEventBus,
	runGuardrailChain,
	sha256Hex,
	type AgentSpecV2,
	type ChainOutcome,
	type ChatMessage,
	type ComponentDeps,
	type EngineEvent,
	type EventBus,
	type EventType,
	type Guardrail,
	type GuardrailContext,
	type GuardrailHook,
	type GuardrailVerdict,
	type PackRegistry,
	type Principal,
	type Stack,
	type TraceFile
} from '@craftabot/core';
import { compileStackLoop, componentDepsFor } from '@craftabot/governance';
import {
	toChatMessages,
	toChatResponse,
	wireRequestSchema,
	wireResponseSchema,
	type WireResponse,
	type WireToolCall
} from './wire.js';

/** An event type's payload, as the session types it. */
type PayloadFor<T extends EventType> = Extract<EngineEvent, { type: T }>['payload'];

/**
 * **The Gate** (WP127, `107-THE-GATE.md`): a stack run over the OpenAI
 * chat-completions wire, in front of one upstream. `handle` is one request;
 * the HTTP server (`server.ts`) is a thin door onto it, so a test drives the
 * same code a port serves. A reference implementation — no authentication,
 * no persistence — whose chain is the session's own: `compileStackLoop`
 * compiles the stack and `runGuardrailChain` runs it, over a context built
 * from the wire in place of a world.
 */
export type GateMode = 'shadow' | 'enforce';

export interface GateOptions {
	stack: Stack;
	registry: Pick<
		PackRegistry,
		'getGuardrailComponent' | 'getPolicyCard' | 'getGuardrailService' | 'getEvaluator' | 'getAction'
	>;
	/** The one upstream, as an OpenAI base URL: `https://api.openai.com/v1`. */
	upstream: { baseUrl: string };
	mode: GateMode;
	/** Read at each upstream call — the host passes the environment's; never stored, never on the trace. */
	upstreamKey?: () => string | undefined;
	/** The network, before the egress guard; tests pass their own. */
	fetch?: typeof globalThis.fetch;
	principal?: Principal;
	/** ISO time and uuids, injected so a test is deterministic. */
	now?: () => string;
	newId?: () => string;
	/** The bus every event is published on — what a `TraceSink` attaches to. */
	events?: EventBus;
}

/** A reply: the HTTP status, the JSON body and the headers the server sets. */
export interface GateReply {
	status: number;
	body: unknown;
	headers: Record<string, string>;
}

/** The identity a context must carry: the Gate, not a bot. */
export const GATE_SPEC: AgentSpecV2 = {
	id: '0a7e0a7e-0000-4000-8000-000000000127',
	name: 'The Gate',
	schemaVersion: 2,
	bricks: [],
	goalCardId: 'gate/conversation',
	identity: { displayName: 'The Gate', boxArtSeed: 'gate' },
	createdAt: '2026-09-30T00:00:00.000Z',
	updatedAt: '2026-09-30T00:00:00.000Z'
};

/** A verdict that was not a plain allow, as the `x-craftabot-verdicts` header lists it. */
export interface EchoedVerdict {
	tick: number;
	hook: GuardrailHook;
	guardrailId: string;
	verdict: string;
	reason?: string;
}

interface Conversation {
	id: string;
	runId: string;
	tick: number;
	usage: { ticks: number; inputTokens: number; outputTokens: number };
	events: EngineEvent[];
	untrusted: Array<{ tick: number; source: string; text: string }>;
	toolMessagesSeen: number;
	/** The last turn's forwarded calls, awaiting their results for `post-act`. */
	pending?: { tick: number; calls: Map<string, string> } | undefined;
	closed?: { reason: string; reply: WireResponse };
	startedAt: string;
	finished: boolean;
}

interface Approval {
	conversationId: string;
	status: 'pending' | 'approved' | 'denied';
	reason: string;
	callId: string;
	/** The reply with the paused call kept, and with it refused. */
	kept: WireResponse;
	refused: WireResponse;
	echoes: EchoedVerdict[];
}

export interface Gate {
	handle(body: unknown, headers?: Record<string, string | undefined>): Promise<GateReply>;
	/** Runs the last turn's `post-act` over any tool messages given, and writes `run.finished`. */
	end(conversationId: string, body?: unknown): Promise<GateReply>;
	approve(approvalId: string, approved: boolean, by?: Principal): GateReply;
	trace(conversationId: string): Promise<TraceFile | undefined>;
	conversations(): string[];
	approvals(): Array<{
		id: string;
		conversationId: string;
		status: Approval['status'];
		reason: string;
	}>;
	/** The hosts the Gate may call: the upstream's, and no other. */
	egressHosts(): string[];
	/** The fetch every Gate call goes through — the egress guard, exposed so its refusal can be held (§5). */
	readonly fetch: typeof globalThis.fetch;
}

const REFUSED = (name: string, reason: string) => `The Gate refused ${name}: ${reason}`;

function kindOf(verdict: GuardrailVerdict): string {
	if ('pause' in verdict) return 'pause';
	if (verdict.allow) return verdict.verdictKind ?? 'allow';
	return verdict.disposition;
}

export function createGate(options: GateOptions): Gate {
	const now = options.now ?? (() => new Date().toISOString());
	const newId = options.newId ?? (() => globalThis.crypto.randomUUID());
	const events = options.events ?? createEventBus();
	const upstreamHost = new URL(options.upstream.baseUrl).hostname;
	const egress = createEgressGuard({ mode: 'declared', fetch: options.fetch ?? globalThis.fetch });
	egress.allow([{ host: upstreamHost, purpose: 'the upstream model', sends: ['prompt'] }]);
	// Guard vendors run their offline stand-ins: the Gate calls the upstream and nothing else (§5).
	const deps: ComponentDeps = {
		...componentDepsFor(options.registry),
		screening: { offline: true }
	};
	const guardrails: Guardrail[] = compileStackLoop(options.stack, options.registry, deps);
	const conversations = new Map<string, Conversation>();
	const approvals = new Map<string, Approval>();

	function emit<T extends EventType>(
		conversation: Conversation,
		tick: number,
		type: T,
		payload: PayloadFor<T>
	): void {
		const event = {
			id: newId(),
			runId: conversation.runId,
			agentId: GATE_SPEC.id,
			tick,
			timestamp: now(),
			type,
			payload
		} as unknown as EngineEvent;
		conversation.events.push(event);
		events.emit(event);
	}

	function conversationFor(id: string): Conversation {
		let conversation = conversations.get(id);
		if (!conversation) {
			conversation = {
				id,
				runId: newId(),
				tick: 0,
				usage: { ticks: 0, inputTokens: 0, outputTokens: 0 },
				events: [],
				untrusted: [],
				toolMessagesSeen: 0,
				startedAt: now(),
				finished: false
			};
			conversations.set(id, conversation);
		}
		return conversation;
	}

	function context(
		conversation: Conversation,
		hook: GuardrailHook,
		tick: number,
		extra: Partial<GuardrailContext>
	): GuardrailContext {
		return {
			hook,
			tick,
			spec: GATE_SPEC,
			usage: { ...conversation.usage },
			worldState: {},
			history: conversation.events,
			...(conversation.untrusted.length > 0 ? { untrusted: conversation.untrusted } : {}),
			...extra
		};
	}

	async function chain(
		conversation: Conversation,
		hook: GuardrailHook,
		tick: number,
		ctx: GuardrailContext,
		echoes: EchoedVerdict[]
	): Promise<ChainOutcome> {
		return runGuardrailChain(guardrails, hook, ctx, (guardrail, verdict, external) => {
			const stamps = {
				...(guardrail.componentId ? { componentId: guardrail.componentId } : {}),
				...(guardrail.point ? { point: guardrail.point as { kind: never; at?: string } } : {})
			};
			if (external)
				emit(conversation, tick, 'guardrail.external', {
					guardrailId: guardrail.id,
					hook,
					...external
				});
			emit(conversation, tick, 'guardrail.checked', {
				guardrailId: guardrail.id,
				hook,
				verdict,
				...(guardrail.policyCardId ? { policyCardId: guardrail.policyCardId } : {}),
				...stamps
			});
			if ('allow' in verdict && !verdict.allow)
				emit(conversation, tick, 'guardrail.tripped', {
					guardrailId: guardrail.id,
					hook,
					reason: verdict.reason,
					disposition: verdict.disposition,
					...(verdict.cause ? { cause: verdict.cause } : {}),
					...(guardrail.policyCardId ? { policyCardId: guardrail.policyCardId } : {}),
					...stamps
				});
			const kind = kindOf(verdict);
			if (kind !== 'allow')
				echoes.push({
					tick,
					hook,
					guardrailId: guardrail.id,
					verdict: kind,
					...('reason' in verdict ? { reason: verdict.reason } : {})
				});
		});
	}

	function stopReply(reason: string): WireResponse {
		return {
			id: `gate-stop-${newId()}`,
			choices: [
				{ index: 0, message: { role: 'assistant', content: reason }, finish_reason: 'stop' }
			]
		};
	}

	function reply(
		status: number,
		body: unknown,
		conversation: Conversation | undefined,
		echoes: EchoedVerdict[]
	): GateReply {
		return {
			status,
			body,
			headers: {
				'content-type': 'application/json',
				...(conversation ? { 'x-craftabot-conversation': conversation.id } : {}),
				'x-craftabot-verdicts': JSON.stringify(echoes)
			}
		};
	}

	function finish(
		conversation: Conversation,
		outcome: 'STOPPED_BY_GUARDRAIL' | 'STOPPED_BY_USER',
		reason?: string
	): void {
		if (conversation.finished) return;
		conversation.finished = true;
		emit(conversation, conversation.tick, 'run.finished', {
			outcome,
			ticks: conversation.tick,
			usage: {
				inputTokens: conversation.usage.inputTokens,
				outputTokens: conversation.usage.outputTokens
			},
			...(reason ? { reason } : {})
		});
	}

	/** `post-act` for the last turn, over the tool messages that answer its calls (§2). */
	async function postAct(
		conversation: Conversation,
		messages: ChatMessage[],
		echoes: EchoedVerdict[]
	): Promise<boolean> {
		const pending = conversation.pending;
		if (!pending) return true;
		conversation.pending = undefined;
		const tools = messages.filter((message) => message.role === 'tool');
		const fresh = tools.slice(conversation.toolMessagesSeen);
		conversation.toolMessagesSeen = tools.length;
		const answers = fresh.filter(
			(message) => message.toolCallId && pending.calls.has(message.toolCallId)
		);
		const results = answers.length > 0 ? answers : [undefined];
		for (const message of results) {
			const result = message
				? { name: pending.calls.get(message.toolCallId!)!, text: message.content, ok: true }
				: undefined;
			const outcome = await chain(
				conversation,
				'post-act',
				pending.tick,
				context(conversation, 'post-act', pending.tick, result ? { result } : {}),
				echoes
			);
			if (outcome.mark && result) {
				conversation.untrusted.push({
					tick: pending.tick,
					source: outcome.mark.source,
					text: result.text
				});
				emit(conversation, pending.tick, 'content.marked', {
					source: outcome.mark.source,
					guardrailId: outcome.mark.guardrailId,
					quarantined: outcome.mark.replacement !== undefined
				});
			}
			if (options.mode === 'enforce' && !('pause' in outcome.verdict) && !outcome.verdict.allow) {
				conversation.closed = {
					reason: outcome.verdict.reason,
					reply: stopReply(outcome.verdict.reason)
				};
				finish(conversation, 'STOPPED_BY_GUARDRAIL', outcome.verdict.reason);
				return false;
			}
		}
		return true;
	}

	async function handle(
		body: unknown,
		headers: Record<string, string | undefined> = {}
	): Promise<GateReply> {
		const parsed = wireRequestSchema.safeParse(body);
		if (!parsed.success)
			return reply(400, { error: { message: 'not a chat-completions request' } }, undefined, []);
		const request = parsed.data;
		if (request.stream)
			return reply(
				400,
				{ error: { message: 'the Gate does not stream (107-THE-GATE.md §7)' } },
				undefined,
				[]
			);
		const id =
			headers['x-craftabot-conversation'] ??
			sha256Hex(canonicalJson(request.messages.slice(0, 2))).slice(0, 16);
		const conversation = conversationFor(id);
		const echoes: EchoedVerdict[] = [];

		// The approval round-trip (§3): the held answer, kept or refused, once the operator has said.
		const approvalId = headers['x-craftabot-approval'];
		if (approvalId !== undefined) {
			const approval = approvals.get(approvalId);
			if (!approval || approval.conversationId !== id)
				return reply(
					404,
					{ error: { message: `no approval ${approvalId} for this conversation` } },
					conversation,
					[]
				);
			if (approval.status === 'pending')
				return reply(
					202,
					{ approvalId, status: 'pending', reason: approval.reason },
					conversation,
					approval.echoes
				);
			return reply(
				200,
				approval.status === 'approved' ? approval.kept : approval.refused,
				conversation,
				approval.echoes
			);
		}
		if (conversation.closed) return reply(200, conversation.closed.reply, conversation, []);

		const messages = toChatMessages(request.messages);
		if (!(await postAct(conversation, messages, echoes)))
			return reply(200, conversation.closed!.reply, conversation, echoes);
		conversation.toolMessagesSeen = messages.filter((message) => message.role === 'tool').length;

		const tick = conversation.tick + 1;
		conversation.tick = tick;
		conversation.usage.ticks = tick;
		if (tick === 1)
			emit(conversation, 0, 'run.started', {
				mode: 'step',
				budgets: { maxTicks: 1_000_000, maxTokens: 1_000_000_000, requestTimeoutMs: 60_000 },
				providerId: 'gate',
				wireModel: request.model ?? 'upstream',
				cartridgeId: `gate/${options.stack.id}`,
				egress: { mode: 'declared', hosts: egress.hosts() },
				...(options.principal ? { principal: options.principal } : {})
			});
		emit(conversation, tick, 'prompt.composed', {
			messages,
			estimatedTokens: Math.ceil(
				messages.reduce((sum, message) => sum + message.content.length, 0) / 4
			)
		});

		// pre-think: the request, before the upstream sees it.
		const before = await chain(
			conversation,
			'pre-think',
			tick,
			context(conversation, 'pre-think', tick, { messages }),
			echoes
		);
		if (options.mode === 'enforce' && !('pause' in before.verdict) && !before.verdict.allow) {
			const refusal = stopReply(before.verdict.reason);
			if (before.verdict.disposition === 'stop-run') {
				conversation.closed = { reason: before.verdict.reason, reply: refusal };
				finish(conversation, 'STOPPED_BY_GUARDRAIL', before.verdict.reason);
			}
			return reply(200, refusal, conversation, echoes);
		}

		// The upstream, through the egress guard: its host and no other.
		const key = options.upstreamKey?.();
		let upstreamBody: unknown;
		try {
			const response = await egress.fetch(
				`${options.upstream.baseUrl.replace(/\/+$/, '')}/chat/completions`,
				{
					method: 'POST',
					headers: {
						'content-type': 'application/json',
						...(key ? { authorization: `Bearer ${key}` } : {})
					},
					body: JSON.stringify(request)
				}
			);
			upstreamBody = await response.json();
			if (!response.ok) return reply(response.status, upstreamBody, conversation, echoes);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			emit(conversation, tick, 'error', { message: `upstream: ${message}`, kind: 'upstream' });
			return reply(
				502,
				{ error: { message: 'the upstream could not be reached' } },
				conversation,
				echoes
			);
		}
		const answer = wireResponseSchema.safeParse(upstreamBody);
		if (!answer.success)
			return reply(
				502,
				{ error: { message: 'the upstream answered unlike chat completions' } },
				conversation,
				echoes
			);
		const wire = answer.data;
		const response = toChatResponse(wire);
		conversation.usage.inputTokens += response.usage.inputTokens;
		conversation.usage.outputTokens += response.usage.outputTokens;
		emit(conversation, tick, 'think.completed', { response });

		// pre-act: one chain per call (§3).
		const message = wire.choices[0]!.message;
		const calls: WireToolCall[] = message.tool_calls ?? [];
		const kept: WireToolCall[] = [];
		const refusals: string[] = [];
		let paused: { callId: string; reason: string; name: string } | undefined;
		let stopped: string | undefined;
		const forwarded = new Map<string, string>();
		for (const call of calls) {
			// A call through the Gate reaches the world — it sends the mail — so it is an action (§2).
			const proposed = {
				kind: 'action' as const,
				name: call.function.name,
				arguments: toChatMessages([{ role: 'assistant', content: '', tool_calls: [call] }])[0]!
					.toolCalls![0]!.arguments
			};
			emit(conversation, tick, 'decision', {
				thought: response.text,
				call: proposed,
				source: 'brain'
			});
			const outcome = await chain(
				conversation,
				'pre-act',
				tick,
				context(conversation, 'pre-act', tick, { messages, response, proposed }),
				echoes
			);
			const verdict = outcome.verdict;
			const enforce = options.mode === 'enforce';
			if ('pause' in verdict) {
				if (enforce && !paused) {
					paused = { callId: call.id, reason: verdict.reason, name: call.function.name };
					emit(conversation, tick, 'approval.requested', { proposed, reason: verdict.reason });
				}
				kept.push(call);
				forwarded.set(call.id, call.function.name);
				continue;
			}
			if (!verdict.allow && enforce) {
				if (verdict.disposition === 'stop-run') stopped = verdict.reason;
				else refusals.push(REFUSED(call.function.name, verdict.reason));
				continue;
			}
			let forwardedCall = call;
			if (
				enforce &&
				outcome.redaction &&
				typeof (proposed.arguments as { text?: unknown })?.text === 'string'
			) {
				forwardedCall = {
					...call,
					function: {
						...call.function,
						arguments: JSON.stringify({
							...(proposed.arguments as object),
							text: outcome.redaction.redactedText
						})
					}
				};
			}
			kept.push(forwardedCall);
			forwarded.set(call.id, call.function.name);
			emit(conversation, tick, 'action.performed', {
				name: call.function.name,
				arguments: argumentsFrom(forwardedCall),
				result: { ok: true, narration: 'forwarded' },
				...(forwardedCall !== call
					? { redacted: { guardrailId: outcome.redaction!.guardrailId } }
					: {})
			});
		}

		if (stopped !== undefined) {
			conversation.closed = { reason: stopped, reply: stopReply(stopped) };
			finish(conversation, 'STOPPED_BY_GUARDRAIL', stopped);
			return reply(200, conversation.closed.reply, conversation, echoes);
		}
		conversation.pending = { tick, calls: forwarded };

		const shaped = (callsOut: WireToolCall[], notes: string[]): WireResponse => {
			const content = [message.content ?? '', ...notes].filter((part) => part !== '').join('\n');
			return {
				...wire,
				choices: [
					{
						...wire.choices[0]!,
						message: {
							...message,
							content,
							...(callsOut.length > 0 ? { tool_calls: callsOut } : { tool_calls: undefined })
						},
						finish_reason: callsOut.length > 0 ? 'tool_calls' : 'stop'
					}
				]
			};
		};
		const out = options.mode === 'enforce' ? shaped(kept, refusals) : wire;
		if (paused) {
			const approvalId = newId();
			approvals.set(approvalId, {
				conversationId: id,
				status: 'pending',
				reason: paused.reason,
				callId: paused.callId,
				kept: out,
				refused: shaped(
					kept.filter((call) => call.id !== paused!.callId),
					[...refusals, REFUSED(paused.name, `a person said no: ${paused.reason}`)]
				),
				echoes
			});
			return reply(
				202,
				{ approvalId, status: 'pending', reason: paused.reason },
				conversation,
				echoes
			);
		}
		return reply(200, out, conversation, echoes);
	}

	function argumentsFrom(call: WireToolCall): unknown {
		return toChatMessages([{ role: 'assistant', content: '', tool_calls: [call] }])[0]!
			.toolCalls![0]!.arguments;
	}

	return {
		handle,
		async end(conversationId, body) {
			const conversation = conversations.get(conversationId);
			if (!conversation)
				return reply(
					404,
					{ error: { message: `no conversation ${conversationId}` } },
					undefined,
					[]
				);
			const echoes: EchoedVerdict[] = [];
			const parsed = wireRequestSchema.safeParse(body);
			const messages = parsed.success ? toChatMessages(parsed.data.messages) : [];
			if (!conversation.closed) await postAct(conversation, messages, echoes);
			finish(conversation, 'STOPPED_BY_USER');
			return reply(
				200,
				{ conversationId, finished: true, ticks: conversation.tick },
				conversation,
				echoes
			);
		},
		approve(approvalId, approved, by) {
			const approval = approvals.get(approvalId);
			if (!approval)
				return reply(404, { error: { message: `no approval ${approvalId}` } }, undefined, []);
			if (approval.status !== 'pending')
				return reply(
					409,
					{ error: { message: `approval ${approvalId} is already ${approval.status}` } },
					undefined,
					[]
				);
			approval.status = approved ? 'approved' : 'denied';
			const conversation = conversations.get(approval.conversationId)!;
			emit(conversation, conversation.tick, 'approval.resolved', {
				approved,
				...(by ? { by } : {})
			});
			if (approved) {
				const call = (approval.kept.choices[0]!.message.tool_calls ?? []).find(
					(each) => each.id === approval.callId
				);
				if (call)
					emit(conversation, conversation.tick, 'action.performed', {
						name: call.function.name,
						arguments: argumentsFrom(call),
						result: { ok: true, narration: 'forwarded' }
					});
			} else conversation.pending?.calls.delete(approval.callId);
			return reply(200, { approvalId, status: approval.status }, conversation, []);
		},
		async trace(conversationId) {
			const conversation = conversations.get(conversationId);
			if (!conversation) return undefined;
			const started = conversation.events.find((event) => event.type === 'run.started');
			return buildTraceFile(
				{
					id: conversation.runId,
					agentId: GATE_SPEC.id,
					agentName: GATE_SPEC.name,
					goalCardId: GATE_SPEC.goalCardId,
					specSnapshot: GATE_SPEC,
					packVersions: {},
					mode: 'step',
					outcome: conversation.finished
						? conversation.closed
							? 'STOPPED_BY_GUARDRAIL'
							: 'STOPPED_BY_USER'
						: 'IN_PROGRESS',
					ticks: conversation.tick,
					usage: {
						inputTokens: conversation.usage.inputTokens,
						outputTokens: conversation.usage.outputTokens
					},
					budgets: { maxTicks: 1_000_000, maxTokens: 1_000_000_000, requestTimeoutMs: 60_000 },
					providerId: 'gate',
					wireModel: started?.type === 'run.started' ? started.payload.wireModel : 'upstream',
					pinned: false,
					startedAt: conversation.startedAt,
					schemaVersion: 2
				},
				conversation.events,
				{ secrets: [options.upstreamKey?.() ?? ''].filter((secret) => secret !== '') }
			);
		},
		conversations: () => [...conversations.keys()],
		approvals: () =>
			[...approvals.entries()].map(([id, approval]) => ({
				id,
				conversationId: approval.conversationId,
				status: approval.status,
				reason: approval.reason
			})),
		egressHosts: () => egress.hosts(),
		fetch: egress.fetch
	};
}
