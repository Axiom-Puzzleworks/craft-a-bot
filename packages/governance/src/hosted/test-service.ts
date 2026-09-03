import type {
	EngineEvent,
	ExternalOutcomeKind,
	GuardrailContext,
	GuardrailHook,
	GuardrailService,
	ScreenFinding,
	ScreenReading,
	ScreenRequest,
	ScreenResult
} from '@craftabot/core';
import { z } from 'zod';
import { hostedScreenConfigSchema, type HostedScreenConfig } from './config.js';

/**
 * **A test-only `GuardrailService`** (`29-GUARD-SHELL.md` §10 stage C's
 * gate): answers whatever it is told to, remembers what it was asked, and
 * carries no vendor. Every shell test drives this — the shell's contract is
 * with the interface, and a vendor is only one more implementation of it.
 */

export function finding(overrides: Partial<ScreenFinding> = {}): ScreenFinding {
	return {
		category: 'injection',
		vendorLabel: 'injection',
		ran: true,
		matched: false,
		...overrides
	};
}

export function reading(overrides: Partial<ScreenReading> = {}): ScreenReading {
	const findings = overrides.findings ?? [finding()];
	return {
		outcome: 'ok',
		matched: findings.some((f) => f.matched),
		findings,
		...overrides
	};
}

export const RECORD = { service: 'stub', endpoint: 'https://stub.example.test/screen' } as const;

export function ok(overrides: Partial<ScreenReading> = {}): ScreenResult {
	return { reading: reading(overrides), record: { ...RECORD } };
}

export function failed(kind: ExternalOutcomeKind): ScreenResult {
	return { error: { kind, message: `stub ${kind}` }, record: { ...RECORD } };
}

export interface StubService extends GuardrailService {
	/** Every request the live client saw, in order. */
	requests: ScreenRequest[];
	/** Every request the offline client saw, in order. */
	offlineRequests: ScreenRequest[];
	/** What `create()` was handed. */
	created: Array<{ config: unknown; timeoutMs: number; credential: string | undefined }>;
}

export function stubService(
	answer: ScreenResult | ((request: ScreenRequest) => ScreenResult) = ok(),
	overrides: Partial<GuardrailService> = {}
): StubService {
	const requests: ScreenRequest[] = [];
	const offlineRequests: ScreenRequest[] = [];
	const created: StubService['created'] = [];
	const respond = (request: ScreenRequest) =>
		typeof answer === 'function' ? answer(request) : answer;
	return {
		id: 'test/stub',
		name: 'Stub guard',
		description: 'Answers what it is told to.',
		hooks: ['pre-think', 'pre-act', 'post-act'],
		egress: [{ host: 'stub.example.test', purpose: 'content screening', sends: ['decision'] }],
		configSchema: z.object({ flavour: z.string().default('plain') }),
		create: (options) => {
			created.push({
				config: options.config,
				timeoutMs: options.timeoutMs,
				credential: options.getCredential('stub')
			});
			return {
				screen: (request) => {
					requests.push(request);
					return Promise.resolve(respond(request));
				}
			};
		},
		createOffline: () => ({
			screen: (request) => {
				offlineRequests.push(request);
				return Promise.resolve(respond(request));
			}
		}),
		requests,
		offlineRequests,
		created,
		...overrides
	};
}

export function screening(overrides: Partial<HostedScreenConfig> = {}): HostedScreenConfig {
	return { ...hostedScreenConfigSchema.parse({}), ...overrides };
}

/** A guardrail context with the history a selector reads — nothing else is looked at by the shell. */
export function context(
	hook: GuardrailHook,
	options: {
		history?: EngineEvent[];
		proposed?: GuardrailContext['proposed'];
		observation?: string;
		response?: string;
	} = {}
): GuardrailContext {
	return {
		hook,
		tick: 3,
		spec: { id: 'agent-1' } as unknown as GuardrailContext['spec'],
		usage: { ticks: 3, inputTokens: 0, outputTokens: 0 },
		worldState: {} as GuardrailContext['worldState'],
		history: options.history ?? [],
		...(options.proposed ? { proposed: options.proposed } : {}),
		...(options.observation !== undefined
			? {
					observation: {
						text: options.observation,
						channels: {}
					} as NonNullable<GuardrailContext['observation']>
				}
			: {}),
		...(options.response !== undefined
			? {
					response: {
						text: options.response,
						usage: { inputTokens: 0, outputTokens: 0 }
					} as NonNullable<GuardrailContext['response']>
				}
			: {})
	};
}

/** The bare envelope every test hands the shell. */
export const envelope = (ctx: GuardrailContext): ScreenRequest['envelope'] => ({
	agentId: 'agent-1',
	tick: ctx.tick
});

/** A `sense` event, as the history walk finds it. */
export function senseEvent(text: string): EngineEvent {
	return {
		id: 'e-sense',
		runId: 'run-1',
		agentId: 'agent-1',
		tick: 3,
		timestamp: '2026-09-02T12:00:00.000Z',
		type: 'sense',
		payload: { channels: [], observation: { text, channels: {} } }
	} as unknown as EngineEvent;
}

export function decisionEvent(thought: string): EngineEvent {
	return {
		id: 'e-decision',
		runId: 'run-1',
		agentId: 'agent-1',
		tick: 3,
		timestamp: '2026-09-02T12:00:00.000Z',
		type: 'decision',
		payload: {
			thought,
			call: { kind: 'action', name: 'say', arguments: { text: 'hi' } },
			source: 'brain'
		}
	} as unknown as EngineEvent;
}

export function actionPerformedEvent(narration: string): EngineEvent {
	return {
		id: 'e-action',
		runId: 'run-1',
		agentId: 'agent-1',
		tick: 3,
		timestamp: '2026-09-02T12:00:00.000Z',
		type: 'action.performed',
		payload: { name: 'say', arguments: {}, result: { ok: true, narration } }
	} as unknown as EngineEvent;
}

export function toolExecutedEvent(result: unknown): EngineEvent {
	return {
		id: 'e-tool',
		runId: 'run-1',
		agentId: 'agent-1',
		tick: 3,
		timestamp: '2026-09-02T12:00:00.000Z',
		type: 'tool.executed',
		payload: { name: 'dice', arguments: {}, result }
	} as unknown as EngineEvent;
}
