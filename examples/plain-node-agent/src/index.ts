import {
	runGuardrailChain,
	type AgentSpecV2,
	type EngineEvent,
	type Guardrail,
	type GuardrailContext,
	type GuardrailService,
	type GuardrailVerdict,
	type ScreenRequest,
	type ScreenResult
} from '@craftabot/core';
import {
	compilePolicyCard,
	createHostedGuardrails,
	createStepBudgetGuardrail,
	createToolBlocklistGuardrail,
	hostedScreenConfigSchema
} from '@craftabot/governance';
import { z } from 'zod';

/**
 * **A plain Node agent loop, gated by `@craftabot/governance`** (WP50,
 * `38-GOVERNANCE-1-0.md` §4.2). No Craft A Bot world, pack or UI: a scripted
 * "brain" proposes tool calls, three toy tools say what they would have
 * done, and before every call the loop runs the same guardrail chain the
 * engine runs — hand-written rules, a policy card, and a hosted guard
 * service through the shell — printing each verdict the way the engine
 * would emit it.
 *
 * Everything here is what a real agent stack would write: build a
 * `GuardrailContext` from what you know, call `runGuardrailChain` at the
 * hook, honour the verdict. The `spec` is the one Craft A Bot shape a
 * context carries; a host that has no notion of a bot fills it with an
 * identity and nothing else, as below.
 */

/** A proposed call, as the scripted brain makes them. */
export interface Proposal {
	name: string;
	arguments: Record<string, unknown>;
}

/** What the loop did with one proposal. */
export interface Step {
	tick: number;
	proposal: Proposal;
	verdict: GuardrailVerdict;
	/** The guardrail that said no, if one did. */
	stoppedBy?: string;
	/** The tool's own answer when the call was allowed. */
	output?: string;
}

// ── The "agent": a script, three tools, an identity ─────────────────────────

const SCRIPT: Proposal[] = [
	{ name: 'read_file', arguments: { path: 'notes/today.md' } },
	{
		name: 'send_email',
		arguments: { to: 'sam@example.com', subject: 'Notes', body: 'See attached.' }
	},
	{
		name: 'send_email',
		arguments: { to: 'someone@elsewhere.net', subject: 'Notes', body: 'See attached.' }
	},
	{ name: 'read_file', arguments: { path: 'hr/staff.csv' } },
	{
		name: 'send_email',
		arguments: { to: 'sam@example.com', subject: 'Staff', body: 'NI AB123456C, as asked.' }
	},
	{ name: 'delete_file', arguments: { path: 'notes/today.md' } },
	{ name: 'read_file', arguments: { path: 'notes/tomorrow.md' } }
];

const TOOLS: Record<string, (args: Record<string, unknown>) => string> = {
	read_file: (args) => `would read ${String(args['path'])}`,
	send_email: (args) => `would email ${String(args['to'])}: ${String(args['subject'])}`,
	delete_file: (args) => `would delete ${String(args['path'])}`
};

/** The one Craft A Bot shape a context carries: who is running. A host with no bots fills in an identity and nothing more. */
const AGENT: AgentSpecV2 = {
	id: '6f5d7c3e-2b1a-4c9d-8e7f-0a1b2c3d4e5f',
	name: 'Plain Node agent',
	schemaVersion: 2,
	bricks: [],
	goalCardId: 'example/plain-node',
	identity: { displayName: 'Plain Node agent', boxArtSeed: 'plain' },
	createdAt: '2026-09-03T00:00:00.000Z',
	updatedAt: '2026-09-03T00:00:00.000Z'
};

// ── Way in 1: hand-written rules ────────────────────────────────────────────

const rules: Guardrail[] = [
	createToolBlocklistGuardrail(['delete_file']),
	createStepBudgetGuardrail(6)
];

// ── Way in 2: a policy card ─────────────────────────────────────────────────

/** Mail leaves the company only through the company's domain. */
export const OUTSIDE_MAIL_CARD = {
	id: 'example/no-outside-mail',
	title: 'No mail outside example.com',
	schemaVersion: 1 as const,
	rules: [
		{
			hook: 'pre-act' as const,
			when: {
				kind: 'and' as const,
				all: [
					{ kind: 'call-name-is' as const, value: 'send_email' },
					{
						kind: 'not' as const,
						expr: { kind: 'argument-matches' as const, path: 'to', pattern: '@example\\.com$' }
					}
				]
			},
			then: 'block-action' as const,
			reason: 'Mail may only be sent to example.com addresses.'
		}
	]
};

const card: Guardrail[] = compilePolicyCard(OUTSIDE_MAIL_CARD);

// ── Way in 3: a hosted guard service, through the shell ─────────────────────

const NI_NUMBER = /\b[A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/i;

/**
 * A `GuardrailService` that screens locally: a national-insurance-number
 * pattern in the decision text is a `sensitive-data` finding. A vendor's client would
 * call out over `fetch` here; the shell around it — dispositions, fail-closed,
 * the trace record — is exactly the same either way.
 */
export const piiScreen: GuardrailService = {
	id: 'example/pii-screen',
	name: 'PII screen',
	description: 'Flags a national-insurance number in a proposed call.',
	hooks: ['pre-act'],
	egress: [],
	configSchema: z.object({}),
	create: () => client(),
	createOffline: () => client()
};

function client() {
	return {
		async screen(request: ScreenRequest): Promise<ScreenResult> {
			const matched = NI_NUMBER.test(request.text);
			return {
				reading: {
					outcome: 'ok',
					matched,
					findings: [
						{
							category: 'sensitive-data',
							vendorLabel: 'ni-number',
							ran: true,
							matched,
							confidence: 'high'
						}
					]
				},
				record: { service: 'example/pii-screen', endpoint: 'local' }
			};
		}
	};
}

const hosted: Guardrail[] = createHostedGuardrails({
	idPrefix: 'example/pii',
	service: piiScreen,
	serviceConfig: {},
	screening: hostedScreenConfigSchema.parse({ screenDecision: 'block' }),
	ctx: { fetch: globalThis.fetch, getCredential: () => undefined },
	envelope: (ctx) => ({ agentId: ctx.spec.id, tick: ctx.tick })
});

// ── The loop ────────────────────────────────────────────────────────────────

/**
 * Runs the script to its end or until a rule stops the run, calling `print`
 * with one line per verdict — the same lines the engine would put on a trace
 * as `guardrail.checked` and `guardrail.tripped` — and returns every step.
 */
export async function runPlainAgent(print: (line: string) => void = () => {}): Promise<Step[]> {
	const guardrails = [...rules, ...card, ...hosted];
	const history: EngineEvent[] = [];
	const usage = { ticks: 0, inputTokens: 0, outputTokens: 0 };
	const steps: Step[] = [];

	const onChecked = (tick: number) => (guardrail: Guardrail, verdict: GuardrailVerdict) => {
		const allowed = 'allow' in verdict && verdict.allow;
		print(
			`tick ${tick} guardrail.checked ${guardrail.id} → ${allowed ? 'allow' : 'reason' in verdict ? verdict.reason : 'pause'}`
		);
		if (!allowed) print(`tick ${tick} guardrail.tripped ${guardrail.id}`);
	};
	const stops = (verdict: GuardrailVerdict) =>
		'allow' in verdict && !verdict.allow && verdict.disposition === 'stop-run';

	for (const proposal of SCRIPT) {
		// `usage.ticks` counts turns completed, as the engine keeps it; the budget reads it before a turn begins.
		const tick = usage.ticks + 1;
		const base = { tick, spec: AGENT, usage, worldState: {}, history } as const;

		// Before thinking (the engine's `pre-think`): budgets and stop-run policy, with nothing proposed yet.
		const before = await runGuardrailChain(
			guardrails,
			'pre-think',
			{ hook: 'pre-think', ...base },
			onChecked(tick)
		);
		if (stops(before.verdict)) {
			steps.push({
				tick,
				proposal,
				verdict: before.verdict,
				stoppedBy: before.guardrail?.id ?? ''
			});
			print(`tick ${tick} run.finished STOPPED_BY_GUARDRAIL`);
			break;
		}

		// Before acting (`pre-act`): the proposed call, screened by every rule that gates one.
		const ctx: GuardrailContext = {
			hook: 'pre-act',
			...base,
			proposed: { kind: 'tool', name: proposal.name, arguments: proposal.arguments },
			// What the brain answered — a hosted screen reads the thought and the rendered call together.
			response: {
				text: `I will ${proposal.name.replace('_', ' ')}.`,
				toolCall: { name: proposal.name, arguments: proposal.arguments },
				usage: { inputTokens: 0, outputTokens: 0 },
				raw: null,
				finishReason: 'tool_call'
			}
		};
		const outcome = await runGuardrailChain(guardrails, 'pre-act', ctx, onChecked(tick));

		const step: Step = { tick, proposal, verdict: outcome.verdict };
		if (outcome.guardrail) step.stoppedBy = outcome.guardrail.id;
		if ('allow' in outcome.verdict && outcome.verdict.allow) {
			step.output = TOOLS[proposal.name]?.(proposal.arguments) ?? 'unknown tool';
			print(`tick ${tick} tool.executed ${proposal.name}: ${step.output}`);
		}
		steps.push(step);
		usage.ticks = tick;

		// A `stop-run` disposition ends the loop, as the engine's `finish` would; a pause is a host's question.
		if (stops(outcome.verdict)) {
			print(`tick ${tick} run.finished STOPPED_BY_GUARDRAIL`);
			break;
		}
		if ('pause' in outcome.verdict) {
			print(`tick ${tick} approval.requested — a host would ask a person here; this one declines`);
		}
	}
	return steps;
}
