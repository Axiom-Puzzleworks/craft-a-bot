import type {
	ActionCall,
	Book,
	BookRequest,
	DeskRecord,
	Executor,
	JsonSchema,
	StageHandoff,
	StageSpec,
	WorkItem,
	WorkflowConfig,
	WorkflowSpec,
	WorldState
} from '@craftabot/core';
import { collectionsBookFor } from './book.js';
import { COLLECTIONS_CEILINGS } from './decision-rights.js';
import { collectionsStrings } from './strings.js';
import {
	COLLECTIONS_DESK_WORLD_ID,
	WORK_ITEM_LAYOUT,
	monthlyFor,
	type CollectionsDeskState
} from './world/desk.js';
import { AFFORDABILITY_RECORD } from './world/extra.js';
import {
	disclosureIn,
	verdictFromFigures,
	type Outcome,
	type Plan,
	type ReasonCode,
	type RuleFigures
} from './world/rules.js';

/**
 * **The arrears workflow** (WP105, `83-…` §6.5.2; `91-FS-COLLECTIONS.md`
 * §5): the journey over the Collections Desk as seven stages with typed
 * input and output and a default executor each, the five reference
 * configurations by autonomy level with the ceilings carried and measured,
 * the decision a person's below Level 5, and **a handoff** (`83-…` §6.5.3):
 * a disclosed support need hands a servicing request to the servicing
 * journey once the plan is agreed. Content only: the runtime is
 * `@craftabot/workflow`.
 */
export const COLLECTIONS_WORKFLOW_ID = 'fs-collections/arrears';
/** The journey a disclosed support need is handed to — WP106's desk; until it ships, the clock counts the item unrouted. */
export const SERVICING_WORKFLOW_ID = 'fs-servicing/servicing';

export const COLLECTIONS_CONFIGURATION_IDS = [
	'rules-only',
	'bot-contacts-only',
	'bot-recommends',
	'bot-with-a-person-at-the-decision',
	'bot-everywhere'
] as const;
export type CollectionsConfigurationId = (typeof COLLECTIONS_CONFIGURATION_IDS)[number];

// ── Schemas at the stage boundaries ────────────────────────────────────

const PLAN_ENUM = { enum: ['payment-plan', 'reduced-payments', 'breathing-space'] };
const DISCLOSURE_ENUM = { enum: ['job-loss', 'bereavement', 'health', 'none'] };
const REASONS = { type: 'array', items: { type: 'string' } };

const ITEM_INPUT: JsonSchema = {
	type: 'object',
	required: ['arrears'],
	properties: {
		arrears: {
			type: 'object',
			required: ['monthlyRepayment', 'arrears', 'missedPayments'],
			properties: {
				monthlyRepayment: { type: 'number' },
				arrears: { type: 'number' },
				missedPayments: { type: 'number' }
			}
		},
		customer: { type: 'object' }
	}
};
const INTAKE_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['customer', 'missed'],
	properties: { customer: { type: 'string' }, missed: { type: 'number' } }
};
const CONTACT_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['reviewed'],
	properties: { reviewed: { const: true } }
};
const CIRCUMSTANCES_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['disclosure'],
	properties: { disclosure: DISCLOSURE_ENUM, circumstances: { type: 'string' } }
};
const REASSESS_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['disposable'],
	properties: { disposable: { type: 'number' } }
};
const PLAN_OUTPUT: JsonSchema = {
	type: 'object',
	properties: {
		plan: PLAN_ENUM,
		reasons: REASONS,
		decision: PLAN_ENUM,
		monthly: { type: 'number' }
	}
};
const RECORDED_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['plan', 'reasons', 'monthly'],
	properties: { plan: PLAN_ENUM, reasons: REASONS, monthly: { type: 'number' } }
};
const DECISION_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['decision'],
	properties: { decision: { enum: ['confirm', 'return'] } }
};
const AGREE_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['agreed'],
	properties: { agreed: { const: true }, plan: PLAN_ENUM, monthly: { type: 'number' } }
};

// ── Reading the desk ───────────────────────────────────────────────────

const desk = (state: WorldState): CollectionsDeskState => state as CollectionsDeskState;
const record = (state: WorldState, id: string): DeskRecord | undefined =>
	desk(state).records.find((r) => r.id === id) ?? desk(state).hidden.find((r) => r.id === id);

/** The figures the rule reads, off the desk's own state — the recorded disclosure, the reassessment, the loan; never truth. */
export function figuresOnTheDesk(state: WorldState): RuleFigures | undefined {
	const { collections } = desk(state).extra;
	if (!collections.circumstances || collections.disposable === undefined) return undefined;
	return {
		disposable: collections.disposable,
		monthlyRepayment: collections.arrears.monthlyRepayment,
		arrears: collections.arrears.arrears,
		disclosure: collections.circumstances.disclosure
	};
}

/** The rule's verdict from what the desk shows. */
export function ruleVerdictOnTheDesk(
	state: WorldState
): { verdict: Outcome; reasons: ReasonCode[]; monthly: number } | undefined {
	const figures = figuresOnTheDesk(state);
	return figures ? verdictFromFigures(figures) : undefined;
}

// ── The handoff ────────────────────────────────────────────────────────

/** The servicing request a disclosed support need becomes: the customer, the disclosure as recorded, the plan agreed. */
const servicingHandoff = (state: WorldState): StageHandoff => {
	const { bank, collections } = desk(state).extra;
	const disclosure = collections.circumstances?.disclosure ?? 'none';
	return {
		handoff: SERVICING_WORKFLOW_ID,
		item: {
			id: `servicing-from-${collections.arrears.accountId}`,
			kind: 'servicing-request',
			customerId: bank.customer.id,
			arrivedAt: '1970-01-01T00:00:00.000Z',
			payload: {
				request: {
					category: 'disclosure',
					summary:
						`Support need disclosed on the collections desk: ${disclosure}. ${collections.circumstances?.text ?? ''}`.trim(),
					disclosure,
					plan: collections.offer?.plan ?? 'none'
				},
				customer: bank.customer
			},
			truth: {
				records: [
					{
						id: `servicing-truth-${collections.arrears.accountId}`,
						kind: 'servicing-outcome',
						title: 'What the collections desk recorded',
						fields: { category: 'disclosure', disclosure: `disclosure-${disclosure}` }
					}
				],
				facts: { category: 'disclosure', disclosure: `disclosure-${disclosure}`, flagged: true }
			}
		}
	};
};

// ── The rules ──────────────────────────────────────────────────────────

const call = (name: string, args: unknown = {}): ActionCall => ({ name, arguments: args });
const planFor = (verdict: Outcome): Plan => (verdict === 'refer' ? 'reduced-payments' : verdict);

const RULES: WorkflowSpec['rules'] = {
	'intake-v1': (_input, state) => {
		const { collections, bank } = desk(state).extra;
		return {
			output: { customer: bank.customer.name.full, missed: collections.arrears.missedPayments }
		};
	},
	'contact-v1': () => ({ output: { reviewed: true }, call: call('review-account') }),
	/** The rule reads the customer's words on the file for a disclosure — what the bank does today from the call notes. */
	'circumstances-v1': (_input, state) => {
		const says = desk(state).extra.collections.arrears.customerSays;
		const disclosure = disclosureIn(says);
		return {
			output: { disclosure, circumstances: says },
			call: call('record-circumstances', { circumstances: says, disclosure })
		};
	},
	'reassess-v1': (_input, state) => ({
		output: { disposable: Number(record(state, AFFORDABILITY_RECORD)?.fields['disposable'] ?? 0) },
		call: call('reassess')
	}),
	'plan-v1': (_input, state) => {
		const verdict = ruleVerdictOnTheDesk(state);
		if (!verdict) return { output: {} };
		// The rule refers what it cannot plan; the desk's offer for a referral is the gentlest plan it has, for the record's sake.
		const plan = planFor(verdict.verdict);
		return {
			output: { plan, reasons: verdict.reasons, monthly: verdict.monthly },
			call: call('offer-plan', { plan, reasons: verdict.reasons })
		};
	},
	/** A person's choice at the plan stage performed on the desk; the bot's own offer read back. */
	'record-v1': (input, state) => {
		const chosen = input as { plan?: Plan; decision?: Plan };
		const { collections } = desk(state).extra;
		if (collections.offer)
			return {
				output: {
					plan: collections.offer.plan,
					reasons: collections.offer.reasons,
					monthly: collections.offer.monthly
				}
			};
		const plan = chosen.decision ?? chosen.plan;
		if (!plan) return { output: {} };
		const verdict = ruleVerdictOnTheDesk(state);
		// A person who followed the rule signs its reasons; one who overrode it signs the one honest code the plan rests on.
		const reasons: ReasonCode[] =
			verdict && planFor(verdict.verdict) === plan
				? verdict.reasons
				: plan === 'breathing-space'
					? ['disclosure-recorded']
					: plan === 'reduced-payments'
						? ['repayment-partly-affordable']
						: ['arrears-affordable'];
		return {
			output: { plan, reasons, monthly: monthlyFor(plan, collections.arrears) },
			call: call('offer-plan', { plan, reasons })
		};
	},
	/** Level 5 only: the go-ahead is the bot's own. */
	'decision-v1': () => ({ output: { decision: 'confirm' } }),
	'agree-v1': (_input, state) => {
		const { collections } = desk(state).extra;
		return {
			output: {
				agreed: true,
				plan: collections.offer?.plan ?? 'payment-plan',
				monthly: collections.offer?.monthly ?? 0
			},
			call: call('agree-plan')
		};
	}
};

// ── The stages ─────────────────────────────────────────────────────────

const agent = (until: string, goalText: string): Executor => ({ kind: 'agent', until, goalText });
const rule = (id: string): Executor => ({ kind: 'rule', rule: id });
const names = collectionsStrings.workflow.stages;

const afterTheAgreement = (state: WorldState): string | StageHandoff => {
	const disclosure = desk(state).extra.collections.circumstances?.disclosure ?? 'none';
	return disclosure !== 'none' ? servicingHandoff(state) : 'end';
};

export const COLLECTIONS_STAGES: StageSpec[] = [
	{
		id: 'intake',
		name: names.intake,
		input: ITEM_INPUT,
		output: INTAKE_OUTPUT,
		executor: rule('intake-v1'),
		next: () => 'contact'
	},
	{
		id: 'contact',
		name: names.contact,
		obligations: ['fca:conc-7:arrears', 'fca:cd:support'],
		input: INTAKE_OUTPUT,
		output: CONTACT_OUTPUT,
		executor: agent('reviewed', collectionsStrings.workflow.briefs.contact),
		read: (state) => (desk(state).extra.collections.reviewed ? { reviewed: true } : undefined),
		next: () => 'circumstances'
	},
	{
		id: 'circumstances',
		name: names.circumstances,
		obligations: ['fca:conc-7:arrears', 'fca:fg21-1:vulnerability'],
		input: CONTACT_OUTPUT,
		output: CIRCUMSTANCES_OUTPUT,
		executor: agent('circumstances-recorded', collectionsStrings.workflow.briefs.circumstances),
		guards: { policyCards: [] },
		read: (state) => {
			const { circumstances } = desk(state).extra.collections;
			return circumstances
				? { disclosure: circumstances.disclosure, circumstances: circumstances.text }
				: undefined;
		},
		next: () => 'reassess'
	},
	{
		id: 'reassess',
		name: names.reassess,
		obligations: ['fca:conc-7:arrears'],
		input: CIRCUMSTANCES_OUTPUT,
		output: REASSESS_OUTPUT,
		executor: rule('reassess-v1'),
		next: () => 'plan'
	},
	{
		id: 'plan',
		name: names.plan,
		obligations: ['fca:conc-7:arrears', 'fca:fg21-1:vulnerability', 'fca:cd:understanding'],
		input: { type: 'object' },
		output: PLAN_OUTPUT,
		executor: agent('offered', collectionsStrings.workflow.briefs.plan),
		guards: { policyCards: [] },
		read: (state) => {
			const { offer } = desk(state).extra.collections;
			return offer
				? { plan: offer.plan, reasons: offer.reasons, monthly: offer.monthly }
				: undefined;
		},
		suggest: (_input, state) => {
			const verdict = ruleVerdictOnTheDesk(state);
			return verdict ? planFor(verdict.verdict) : undefined;
		},
		next: () => 'record'
	},
	{
		id: 'record',
		name: names.record,
		input: PLAN_OUTPUT,
		output: RECORDED_OUTPUT,
		executor: rule('record-v1'),
		next: () => 'decision'
	},
	{
		id: 'decision',
		name: names.decision,
		obligations: ['pra:ss1-23:mitigants', 'fca:conc-7:arrears'],
		input: RECORDED_OUTPUT,
		output: DECISION_OUTPUT,
		executor: {
			kind: 'human',
			prompt: collectionsStrings.workflow.briefs.confirmPlan,
			options: ['confirm', 'return']
		},
		suggest: () => 'confirm',
		next: (out) => ((out as { decision?: string }).decision === 'confirm' ? 'agree' : 'end')
	},
	{
		id: 'agree',
		name: names.agree,
		obligations: ['fca:conc-7:arrears', 'fca:cd:understanding'],
		input: DECISION_OUTPUT,
		output: AGREE_OUTPUT,
		executor: agent('agreed', collectionsStrings.workflow.briefs.agree),
		irreversible: true,
		read: (state) => {
			const { collections } = desk(state).extra;
			return collections.agreed
				? {
						agreed: true,
						plan: collections.offer?.plan ?? 'payment-plan',
						monthly: collections.offer?.monthly ?? 0
					}
				: undefined;
		},
		// A disclosed support need goes on to the servicing desk once the plan is agreed.
		next: (_out, state) => afterTheAgreement(state)
	}
];

// ── The reference configurations ───────────────────────────────────────

const ceilings = { ...COLLECTIONS_CEILINGS };
const rulesFor = (...ids: string[]): Record<string, Executor> =>
	Object.fromEntries(ids.map((id) => [id, rule(`${id}-v1`)]));

export const COLLECTIONS_CONFIGURATIONS: Record<CollectionsConfigurationId, WorkflowConfig> = {
	/** The control: every stage a rule; a person confirms the plan, as the bank does today. */
	'rules-only': { executors: rulesFor('contact', 'circumstances', 'plan', 'agree') },
	/** Level 2: the bot makes contact; the rules record the circumstances from the file, plan and agree; a person confirms. */
	'bot-contacts-only': {
		executors: rulesFor('circumstances', 'plan', 'agree'),
		autonomy: { level: 2, ceilings }
	},
	/** Level 3: the bot makes contact and records the circumstances; the plan is a person's choice, the rule's beside the bot's recommendation; the rule agrees. */
	'bot-recommends': {
		executors: {
			...rulesFor('agree'),
			plan: {
				kind: 'human',
				prompt: collectionsStrings.workflow.briefs.recommendation,
				options: ['payment-plan', 'reduced-payments', 'breathing-space']
			}
		},
		autonomy: { level: 3, ceilings }
	},
	/** Level 4: the bot does everything; a person confirms the plan before it is agreed. */
	'bot-with-a-person-at-the-decision': { autonomy: { level: 4, ceilings } },
	/** Level 5: the bot does everything and the go-ahead is its own; the Monitor is the oversight. */
	'bot-everywhere': { executors: rulesFor('decision'), autonomy: { level: 5, ceilings } }
};

/** The decision kind a stage's output is, for the ceilings: forbearance once the plan is recorded — the one place a person's or the bot's plan is counted; the agreement; a notice were one ever planned. */
export function collectionsDecisionKind(stageId: string, output: unknown): string | undefined {
	if (stageId === 'record') {
		const plan = (output as { plan?: string } | undefined)?.plan;
		if (plan === 'reduced-payments' || plan === 'breathing-space') return 'forbearance';
		if (plan === 'default-notice') return 'default-notice';
	}
	if (stageId === 'agree' && (output as { agreed?: boolean } | undefined)?.agreed === true)
		return 'plan-agreement';
	return undefined;
}

export function collectionsBookForRequest(request: BookRequest): Book {
	return collectionsBookFor({
		seed: request.seed,
		size: request.size,
		...(request.periodDays !== undefined ? { periodDays: request.periodDays } : {})
	});
}

export const collectionsWorkflow: WorkflowSpec = {
	id: COLLECTIONS_WORKFLOW_ID,
	name: collectionsStrings.workflow.name,
	worldId: COLLECTIONS_DESK_WORLD_ID,
	purpose: collectionsStrings.workflow.purpose,
	intake: (item: WorkItem) => ({
		layoutId: WORK_ITEM_LAYOUT,
		input: item.payload,
		config: { item }
	}),
	stages: COLLECTIONS_STAGES,
	first: 'intake',
	rules: RULES,
	obligations: [
		'fca:conc-7:arrears',
		'fca:fg21-1:vulnerability',
		'fca:cd:support',
		'fca:cd:understanding'
	],
	configurations: COLLECTIONS_CONFIGURATIONS,
	decisionKindOf: collectionsDecisionKind,
	book: collectionsBookForRequest,
	kinds: ['arrears']
};

export { monthlyFor };
