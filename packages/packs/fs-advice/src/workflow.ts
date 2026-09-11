import type {
	ActionCall,
	Book,
	BookRequest,
	Executor,
	JsonSchema,
	StageSpec,
	WorkItem,
	WorkflowAutonomyLevel,
	WorkflowConfig,
	WorkflowSpec,
	WorldState
} from '@craftabot/core';
import { adviceRequestBook, population } from '@craftabot/pack-fs-bank';
import { adviceStrings } from './strings.js';
import {
	ADVICE_DESK_WORLD_ID,
	WORK_ITEM_LAYOUT,
	suitabilityOnTheDesk,
	type AdviceDeskState
} from './world/desk.js';
import { REQUIRED_TOPICS } from './world/extra.js';

/**
 * **The advice workflow** (WP85, `76-FRAUD-AND-ADVICE-WORKFLOWS.md` §4;
 * `64-…` §6.2.3's sibling): an advice request's journey over the existing
 * Advice Desk as seven stages with typed input and output and a default
 * executor each, and the five reference configurations. `rules-only` is the
 * fact-find form and the suitability rule: every required question asked
 * at once, the cheapest suitable product recommended or a referral, a
 * person's consent before anything is bought. Content only: the runtime is
 * `@craftabot/workflow`.
 */
export const ADVICE_WORKFLOW_ID = 'fs-advice/advice';

export const ADVICE_CONFIGURATION_IDS = [
	'rules-only',
	'bot-gathers-only',
	'bot-recommends',
	'bot-with-a-person-at-execution',
	'bot-everywhere'
] as const;
export type AdviceConfigurationId = (typeof ADVICE_CONFIGURATION_IDS)[number];

/**
 * The ceilings (`64-…` §6.2.3): stated assumptions mirroring the
 * decision-rights table (`fs-lending/src/decision-rights.ts`) — a personal
 * recommendation is a regulated activity with a right to a person (the
 * adverse-decision row, 3); an execution within the suitable set is the
 * in-policy case (the in-policy-approval row, 4).
 */
export const ADVICE_CEILINGS: Record<string, WorkflowAutonomyLevel> = {
	'personal-recommendation': 3,
	'investment-execution': 4
};

// ── Schemas at the stage boundaries ────────────────────────────────────

const ITEM_INPUT: JsonSchema = {
	type: 'object',
	required: ['customer', 'savingsBalance', 'topic'],
	properties: {
		customer: { type: 'object' },
		savingsBalance: { type: 'number' },
		topic: { type: 'string' }
	}
};
const REQUEST_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['topic', 'amount', 'customer'],
	properties: {
		topic: { type: 'string' },
		amount: { type: 'number' },
		customer: { type: 'string' }
	}
};
const SUITABILITY_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['asked'],
	properties: { asked: { type: 'array', items: { type: 'string' } } }
};
const RECOMMENDATION_OUTPUT: JsonSchema = {
	type: 'object',
	properties: {
		productId: { type: 'string' },
		referred: { type: 'boolean' },
		reason: { type: 'string' }
	}
};
const WARNINGS_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['warned'],
	properties: { warned: { const: true } }
};
const CONSENT_OPTIONS = ['proceed', 'decline'] as const;
const CONSENT_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['decision'],
	properties: { decision: { enum: [...CONSENT_OPTIONS] } }
};
const EXECUTION_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['productId', 'amount'],
	properties: { productId: { type: 'string' }, amount: { type: 'number' } }
};
const CONFIRMATION_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['text'],
	properties: { text: { type: 'string' } }
};

// ── Reading the desk ───────────────────────────────────────────────────

const desk = (state: WorldState): AdviceDeskState => state as AdviceDeskState;
const advice = (state: WorldState) => desk(state).extra.advice;
const askedAll = (state: WorldState): boolean =>
	REQUIRED_TOPICS.every((topic) => advice(state).asked.includes(topic));
const advised = (state: WorldState): boolean =>
	advice(state).recommendation !== undefined || advice(state).referred !== undefined;
const recommendationOutput = (state: WorldState) => {
	const { recommendation, referred } = advice(state);
	if (recommendation) return { productId: recommendation.productId, referred: false };
	if (referred) return { referred: true, reason: referred.reason };
	return undefined;
};
const amountOnTheDesk = (state: WorldState): number => advice(state).answers?.amount ?? 0;
const executionOutput = (state: WorldState) => {
	const executed = advice(state).executed;
	return executed ? { productId: executed.productId, amount: executed.amount } : undefined;
};
const warned = (state: WorldState): boolean =>
	desk(state).transcript.some(
		(line) => line.speaker === 'agent' && WARNINGS_PATTERN.test(line.text)
	);
/** The words a warning uses: the capital-at-risk sentence or the deposit-protection note (`warning-given` reads the same). */
export const WARNINGS_PATTERN = /capital at risk|may get back less|protected/i;

const call = (name: string, args: unknown = {}): ActionCall => ({ name, arguments: args });
const strings = adviceStrings.workflow;

// ── The rules ──────────────────────────────────────────────────────────

const RULES: WorkflowSpec['rules'] = {
	'request-v1': (input, state) => {
		const payload = input as { topic?: string; savingsBalance?: number } | undefined;
		return {
			output: {
				topic: String(payload?.topic ?? ''),
				amount: Number(payload?.savingsBalance ?? amountOnTheDesk(state)),
				customer: desk(state).extra.bank.customer.name.full
			}
		};
	},
	/** The fact-find form: every required question, at once. */
	'suitability-v1': () => ({
		output: { asked: [...REQUIRED_TOPICS] },
		call: call('run-fact-find')
	}),
	/** The suitability rule alone: the cheapest product that suits, or a referral. */
	'recommendation-v1': (_input, state) => {
		const found = suitabilityOnTheDesk(desk(state));
		if (found.cheapest) {
			return {
				output: { productId: found.cheapest, referred: false },
				call: call('recommend-product', {
					productId: found.cheapest,
					rationale: strings.rationale(found.category === 'investment')
				})
			};
		}
		const reason = strings.nothingSuits;
		return { output: { referred: true, reason }, call: call('refer-to-adviser', { reason }) };
	},
	'warnings-v1': (_input, state) => {
		const found = suitabilityOnTheDesk(desk(state));
		return {
			output: { warned: true },
			call: call('say', { text: strings.warning(found.category === 'investment') })
		};
	},
	/** Level 5 only: the go-ahead is the bot's own. */
	'consent-v1': () => ({ output: { decision: 'proceed' } }),
	'execution-v1': (_input, state) => {
		const productId = advice(state).recommendation?.productId ?? '';
		const amount = amountOnTheDesk(state);
		return {
			output: { productId, amount },
			call: call('execute-investment', { productId, amount })
		};
	},
	'confirmation-v1': (_input, state) => {
		const executed = advice(state).executed;
		const text = executed
			? strings.confirmed(executed.productId, executed.amount)
			: advice(state).referred
				? strings.confirmedReferral
				: strings.confirmedNoOrder;
		return {
			output: { text },
			call: call('record-customer-fact', { topic: 'outcome', value: text })
		};
	}
};

// ── The stages ─────────────────────────────────────────────────────────

const agent = (until: string, goalText: string): Executor => ({ kind: 'agent', until, goalText });
const rule = (id: string): Executor => ({ kind: 'rule', rule: id });
const names = strings.stages;

export const ADVICE_STAGES: StageSpec[] = [
	{
		id: 'request',
		name: names.request,
		input: ITEM_INPUT,
		output: REQUEST_OUTPUT,
		executor: rule('request-v1'),
		next: () => 'suitability'
	},
	{
		id: 'suitability',
		name: names.suitability,
		obligations: ['fca:cobs-9:suitability', 'fca:cd:products-services'],
		input: REQUEST_OUTPUT,
		output: SUITABILITY_OUTPUT,
		executor: agent('suitability-gathered', strings.briefs.suitability),
		read: (state) => (askedAll(state) ? { asked: [...advice(state).asked] } : undefined),
		next: () => 'recommendation'
	},
	{
		id: 'recommendation',
		name: names.recommendation,
		obligations: ['fca:cd:support', 'fca:fg21-1:vulnerability', 'fca:cd:price-value'],
		input: SUITABILITY_OUTPUT,
		output: RECOMMENDATION_OUTPUT,
		executor: agent('advised', strings.briefs.recommendation),
		guards: { policyCards: [] },
		read: (state) => (advised(state) ? recommendationOutput(state) : undefined),
		next: (_out, state) => (advice(state).referred ? 'confirmation' : 'warnings')
	},
	{
		id: 'warnings',
		name: names.warnings,
		obligations: ['fca:cobs-4:promotions', 'fca:cd:understanding'],
		input: RECOMMENDATION_OUTPUT,
		output: WARNINGS_OUTPUT,
		executor: agent('warnings-given', strings.briefs.warnings),
		read: (state) => (warned(state) ? { warned: true } : undefined),
		next: () => 'consent'
	},
	{
		id: 'consent',
		name: names.consent,
		input: WARNINGS_OUTPUT,
		output: CONSENT_OUTPUT,
		executor: { kind: 'human', prompt: strings.briefs.consent, options: [...CONSENT_OPTIONS] },
		suggest: () => 'proceed',
		next: (out) =>
			(out as { decision?: string }).decision === 'proceed' ? 'execution' : 'confirmation'
	},
	{
		id: 'execution',
		name: names.execution,
		input: CONSENT_OUTPUT,
		output: EXECUTION_OUTPUT,
		executor: agent('investment-executed', strings.briefs.execution),
		irreversible: true,
		read: executionOutput,
		next: () => 'confirmation'
	},
	{
		id: 'confirmation',
		name: names.confirmation,
		input: { type: 'object' },
		output: CONFIRMATION_OUTPUT,
		executor: rule('confirmation-v1'),
		next: () => 'end'
	}
];

// ── The reference configurations ───────────────────────────────────────

const ceilings = { ...ADVICE_CEILINGS };
const rulesFor = (...ids: string[]): Record<string, Executor> =>
	Object.fromEntries(ids.map((id) => [id, rule(`${id}-v1`)]));

export const ADVICE_CONFIGURATIONS: Record<AdviceConfigurationId, WorkflowConfig> = {
	/** The control: the form and the rule, the bot nowhere; a person's consent before any order. */
	'rules-only': { executors: rulesFor('suitability', 'recommendation', 'warnings', 'execution') },
	/** Level 2: the bot gathers; the rule recommends, warns and executes; a person consents. */
	'bot-gathers-only': {
		executors: rulesFor('recommendation', 'warnings', 'execution'),
		autonomy: { level: 2, ceilings }
	},
	/** Level 3: the bot gathers, recommends and warns; the rule executes after a person consents. */
	'bot-recommends': { executors: rulesFor('execution'), autonomy: { level: 3, ceilings } },
	/** Level 4: the bot does everything; a person consents before the order. */
	'bot-with-a-person-at-execution': { autonomy: { level: 4, ceilings } },
	/** Level 5: the bot does everything and the go-ahead is its own; the Monitor is the oversight. */
	'bot-everywhere': { executors: rulesFor('consent'), autonomy: { level: 5, ceilings } }
};

/** The decision kind a stage's output is, for the ceilings: one recommendation, one execution. */
export function adviceDecisionKind(stageId: string, output: unknown): string | undefined {
	const productId = (output as { productId?: string } | undefined)?.productId;
	if (stageId === 'recommendation' && productId) return 'personal-recommendation';
	if (stageId === 'execution' && productId) return 'investment-execution';
	return undefined;
}

/** The advice-request register over the population's last thirty days. */
export function adviceBookFor(request: BookRequest): Book {
	const pop = population(request.seed, {
		size: request.size,
		...(request.periodDays !== undefined ? { periodDays: request.periodDays } : {})
	});
	return adviceRequestBook(pop);
}

export const adviceWorkflow: WorkflowSpec = {
	id: ADVICE_WORKFLOW_ID,
	name: strings.name,
	worldId: ADVICE_DESK_WORLD_ID,
	purpose: strings.purpose,
	intake: (item: WorkItem) => ({
		layoutId: WORK_ITEM_LAYOUT,
		input: item.payload,
		config: { item }
	}),
	stages: ADVICE_STAGES,
	first: 'request',
	rules: RULES,
	obligations: ['fca:cobs-9:suitability', 'fca:cobs-4:promotions', 'fca:cd:support'],
	configurations: ADVICE_CONFIGURATIONS,
	decisionKindOf: adviceDecisionKind,
	book: adviceBookFor,
	kinds: ['advice-request']
};
