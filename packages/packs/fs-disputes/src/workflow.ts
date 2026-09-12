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
import { ALERT_RULE_ID, type AlertItemPayload, type Transaction } from '@craftabot/pack-fs-bank';
import { disputesBookFor } from './book.js';
import { DISPUTES_CEILINGS } from './decision-rights.js';
import { disputesStrings } from './strings.js';
import {
	DISPUTES_DESK_WORLD_ID,
	WORK_ITEM_LAYOUT,
	knobsOf,
	type DisputesDeskState
} from './world/desk.js';
import { INVESTIGATION_RECORD } from './world/extra.js';
import {
	classificationOf,
	verdictFromFigures,
	type Classification,
	type Outcome,
	type ReasonCode,
	type RuleFigures
} from './world/rules.js';

/**
 * **The disputes workflow** (WP104, `83-…` §6.5.2; `90-FS-DISPUTES.md`
 * §5): the journey over the Disputes Desk as nine stages with typed input
 * and output and a default executor each, the five reference
 * configurations by autonomy level with the ceilings carried and measured,
 * and **two handoffs** (`83-…` §6.5.3): a reimbursed scam hands the payee
 * to the fraud journey as an alert; a declined dispute hands the customer's
 * complaint to the complaints journey. Content only: the runtime is
 * `@craftabot/workflow`.
 */
export const DISPUTES_WORKFLOW_ID = 'fs-disputes/disputes';

export const DISPUTES_CONFIGURATION_IDS = [
	'rules-only',
	'bot-verifies-only',
	'bot-recommends',
	'bot-with-a-person-at-the-reimbursement',
	'bot-everywhere'
] as const;
export type DisputesConfigurationId = (typeof DISPUTES_CONFIGURATION_IDS)[number];

// ── Schemas at the stage boundaries ────────────────────────────────────

const OUTCOME_ENUM = { enum: ['reimburse', 'decline', 'refer'] };
const CLASS_ENUM = { enum: ['unauthorised', 'authorised-scam', 'merchant'] };
const REASONS = { type: 'array', items: { type: 'string' } };

const ITEM_INPUT: JsonSchema = {
	type: 'object',
	required: ['claim'],
	properties: {
		claim: {
			type: 'object',
			required: ['amount', 'channel', 'customerMadeIt', 'newPayee'],
			properties: {
				amount: { type: 'number' },
				channel: { type: 'string' },
				customerMadeIt: { type: 'boolean' },
				newPayee: { type: 'boolean' }
			}
		},
		customer: { type: 'object' }
	}
};
const INTAKE_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['customer', 'amount'],
	properties: { customer: { type: 'string' }, amount: { type: 'number' } }
};
const VERIFY_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['verified'],
	properties: { verified: { const: true } }
};
const CLASSIFY_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['classification'],
	properties: { classification: CLASS_ENUM }
};
const HOLD_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['held'],
	properties: { held: { const: true }, amount: { type: 'number' } }
};
const INVESTIGATE_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['investigated'],
	properties: { investigated: { const: true }, scamPattern: { type: 'boolean' } }
};
const DECISION_OUTPUT: JsonSchema = {
	type: 'object',
	properties: { outcome: OUTCOME_ENUM, reasons: REASONS, decision: OUTCOME_ENUM }
};
const RECORDED_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['outcome', 'reasons', 'amount', 'withinLimit'],
	properties: {
		outcome: OUTCOME_ENUM,
		reasons: REASONS,
		amount: { type: 'number' },
		withinLimit: { type: 'boolean' }
	}
};
const CONFIRM_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['decision'],
	properties: { decision: { enum: ['confirm', 'return'] } }
};
const REIMBURSE_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['reimbursed'],
	properties: { reimbursed: { const: true }, amount: { type: 'number' } }
};

// ── Reading the desk ───────────────────────────────────────────────────

const desk = (state: WorldState): DisputesDeskState => state as DisputesDeskState;
const record = (state: WorldState, id: string): DeskRecord | undefined =>
	desk(state).records.find((r) => r.id === id) ?? desk(state).hidden.find((r) => r.id === id);
const policyOf = (state: WorldState) => knobsOf(desk(state).config);

/** The figures the rule reads, off the desk's own state — the verification, the classification, the amount; never truth. */
export function figuresOnTheDesk(state: WorldState): RuleFigures | undefined {
	const { disputes } = desk(state).extra;
	if (!disputes.verified || disputes.classification === undefined) return undefined;
	return {
		verified: true,
		classification: disputes.classification,
		amount: disputes.claim.amount
	};
}

/** The rule's verdict from what the desk shows, under the desk's policy. */
export function ruleVerdictOnTheDesk(
	state: WorldState
): { verdict: Outcome; reasons: ReasonCode[]; amount: number } | undefined {
	const figures = figuresOnTheDesk(state);
	return figures ? verdictFromFigures(figures, policyOf(state)) : undefined;
}

/** The investigation found a scam pattern — read off the revealed record, never truth. */
const scamPatternOnTheDesk = (state: WorldState): boolean =>
	String(record(state, INVESTIGATION_RECORD)?.fields['pattern'] ?? '').includes('scam pattern') &&
	desk(state).extra.disputes.investigated;

// ── The handoffs ───────────────────────────────────────────────────────

/** The alert the reimbursed scam becomes: the bank's own alert-item shape, the payee flagged, for the fraud journey. */
const fraudHandoff = (state: WorldState): StageHandoff => {
	const { bank, disputes } = desk(state).extra;
	const account = bank.accounts.find((a) => a.kind === 'current') ?? bank.accounts[0]!;
	const transaction: Transaction = {
		id: disputes.claim.transactionId,
		accountId: account.id,
		day: 0,
		time: '11:00',
		amount: disputes.claim.amount,
		direction: 'debit',
		merchant: disputes.claim.merchant,
		merchantCategory: 'transfer',
		channel: disputes.claim.channel,
		country: 'GB',
		...(disputes.claim.payee ? { payee: disputes.claim.payee } : {}),
		velocity: 1
	};
	const payload: AlertItemPayload = {
		transaction,
		account: {
			id: account.id,
			kind: account.kind,
			masked: `••••${account.accountNumber.slice(-4)}`
		},
		signals: ['new-payee', 'large'],
		typicalAmount: account.baseline.typicalTransaction,
		baseline: account.baseline,
		rule: ALERT_RULE_ID
	};
	return {
		handoff: 'fs-fraud/fraud',
		item: {
			id: `alert-from-${disputes.claim.transactionId}`,
			kind: 'alert',
			customerId: bank.customer.id,
			arrivedAt: '1970-01-01T00:00:00.000Z',
			payload: payload as unknown as Record<string, unknown>,
			truth: {
				records: [
					{
						id: `alert-truth-${disputes.claim.transactionId}`,
						kind: 'alert-label',
						title: 'What the disputes desk found',
						fields: { label: 'fraudulent', signals: 'new-payee,large' }
					}
				],
				facts: { label: 'fraudulent', planted: true, rule: ALERT_RULE_ID }
			}
		}
	};
};

/** The complaint the declined dispute becomes: the bank's own register shape, `fraud-handling` category, not upheld. */
const complaintHandoff = (state: WorldState): StageHandoff => {
	const { bank, disputes } = desk(state).extra;
	const summary = `Dispute of ${disputesStrings.money(disputes.claim.amount)} to ${disputes.claim.merchant} declined as a fraud claim: ${disputes.claim.customerSays}`;
	return {
		handoff: 'fs-advice/complaints',
		item: {
			id: `complaint-from-${disputes.claim.transactionId}`,
			kind: 'complaint',
			customerId: bank.customer.id,
			arrivedAt: '1970-01-01T00:00:00.000Z',
			payload: {
				complaint: {
					id: `cmp-${disputes.claim.transactionId}`,
					customerId: bank.customer.id,
					openedDay: 0,
					category: 'fraud-handling',
					summary,
					status: 'open'
				},
				customer: bank.customer
			},
			truth: {
				records: [
					{
						id: `complaint-truth-${disputes.claim.transactionId}`,
						kind: 'complaint-outcome',
						title: 'What the register says',
						fields: { category: 'fraud-handling', upheld: false }
					}
				],
				facts: { category: 'fraud-handling', upheld: false }
			}
		}
	};
};

// ── The rules ──────────────────────────────────────────────────────────

const call = (name: string, args: unknown = {}): ActionCall => ({ name, arguments: args });

const RULES: WorkflowSpec['rules'] = {
	'intake-v1': (_input, state) => {
		const { disputes, bank } = desk(state).extra;
		return { output: { customer: bank.customer.name.full, amount: disputes.claim.amount } };
	},
	'verify-v1': () => ({ output: { verified: true }, call: call('verify-customer') }),
	'classify-v1': (_input, state) => {
		const classification: Classification = classificationOf(desk(state).extra.disputes.claim);
		return { output: { classification }, call: call('classify', { classification }) };
	},
	'hold-v1': (_input, state) => ({
		output: { held: true, amount: desk(state).extra.disputes.claim.amount },
		call: call('hold-disputed-amount')
	}),
	'investigate-v1': (_input, state) => ({
		output: {
			investigated: true,
			scamPattern: String(record(state, INVESTIGATION_RECORD)?.fields['pattern'] ?? '').includes(
				'scam pattern'
			)
		},
		call: call('investigate')
	}),
	'decision-v1': (_input, state) => {
		const verdict = ruleVerdictOnTheDesk(state);
		if (!verdict) return { output: {} };
		return {
			output: { outcome: verdict.verdict, reasons: verdict.reasons },
			call: call('decide', { outcome: verdict.verdict, reasons: verdict.reasons })
		};
	},
	'record-v1': (input, state) => {
		const chosen = input as { outcome?: Outcome; reasons?: ReasonCode[]; decision?: Outcome };
		const { disputes } = desk(state).extra;
		const withinLimit = disputes.claim.amount <= policyOf(state).reimbursementLimit;
		const decided = disputes.decision;
		if (decided)
			return {
				output: {
					outcome: decided.outcome,
					reasons: decided.reasons,
					amount: decided.amount,
					withinLimit
				}
			};
		const outcome = chosen.decision ?? chosen.outcome;
		if (!outcome) return { output: {} };
		const verdict = ruleVerdictOnTheDesk(state);
		// A person who followed the rule signs its reasons; one who overrode it signs the one honest code the file supports.
		const reasons: ReasonCode[] =
			verdict && verdict.verdict === outcome
				? verdict.reasons
				: outcome === 'reimburse'
					? disputes.classification === 'unauthorised'
						? ['unauthorised-payment']
						: ['app-within-limit']
					: outcome === 'refer'
						? ['app-above-limit']
						: ['merchant-dispute'];
		const amount =
			outcome !== 'reimburse'
				? 0
				: disputes.classification === 'authorised-scam'
					? Math.max(0, disputes.claim.amount - policyOf(state).excess)
					: disputes.claim.amount;
		return {
			output: { outcome, reasons, amount, withinLimit },
			call: call('decide', { outcome, reasons })
		};
	},
	/** Level 5 only: the go-ahead is the bot's own. */
	'confirm-v1': () => ({ output: { decision: 'confirm' } }),
	'reimburse-v1': (_input, state) => ({
		output: { reimbursed: true, amount: desk(state).extra.disputes.decision?.amount ?? 0 },
		call: call('reimburse')
	})
};

// ── The stages ─────────────────────────────────────────────────────────

const agent = (until: string, goalText: string): Executor => ({ kind: 'agent', until, goalText });
const rule = (id: string): Executor => ({ kind: 'rule', rule: id });
const names = disputesStrings.workflow.stages;

const afterTheDecision = (state: WorldState): string | StageHandoff => {
	const decision = desk(state).extra.disputes.decision;
	if (decision?.outcome === 'reimburse') return 'confirm';
	if (decision?.outcome === 'decline') return complaintHandoff(state);
	return 'end';
};

export const DISPUTES_STAGES: StageSpec[] = [
	{
		id: 'intake',
		name: names.intake,
		input: ITEM_INPUT,
		output: INTAKE_OUTPUT,
		executor: rule('intake-v1'),
		next: () => 'verify'
	},
	{
		id: 'verify',
		name: names.verify,
		obligations: ['mlr:kyc'],
		input: INTAKE_OUTPUT,
		output: VERIFY_OUTPUT,
		executor: agent('verified', disputesStrings.workflow.briefs.verify),
		read: (state) => (desk(state).extra.disputes.verified ? { verified: true } : undefined),
		next: () => 'classify'
	},
	{
		id: 'classify',
		name: names.classify,
		obligations: ['psr:app-reimbursement'],
		input: VERIFY_OUTPUT,
		output: CLASSIFY_OUTPUT,
		executor: agent('classified', disputesStrings.workflow.briefs.classify),
		read: (state) => {
			const { classification } = desk(state).extra.disputes;
			return classification ? { classification } : undefined;
		},
		next: () => 'hold'
	},
	{
		id: 'hold',
		name: names.hold,
		obligations: ['psr:app-reimbursement', 'fca:cd:support'],
		input: CLASSIFY_OUTPUT,
		output: HOLD_OUTPUT,
		executor: rule('hold-v1'),
		next: () => 'investigate'
	},
	{
		id: 'investigate',
		name: names.investigate,
		obligations: ['psr:app-reimbursement'],
		input: HOLD_OUTPUT,
		output: INVESTIGATE_OUTPUT,
		executor: agent('investigated', disputesStrings.workflow.briefs.investigate),
		guards: { policyCards: [] },
		read: (state) =>
			desk(state).extra.disputes.investigated
				? { investigated: true, scamPattern: scamPatternOnTheDesk(state) }
				: undefined,
		next: () => 'decision'
	},
	{
		id: 'decision',
		name: names.decision,
		obligations: ['psr:app-reimbursement', 'fca:cd:understanding'],
		input: { type: 'object' },
		output: DECISION_OUTPUT,
		executor: agent('decided', disputesStrings.workflow.briefs.decision),
		guards: { policyCards: [] },
		read: (state) => {
			const decided = desk(state).extra.disputes.decision;
			return decided ? { outcome: decided.outcome, reasons: decided.reasons } : undefined;
		},
		suggest: (_input, state) => ruleVerdictOnTheDesk(state)?.verdict,
		next: () => 'record'
	},
	{
		id: 'record',
		name: names.record,
		input: DECISION_OUTPUT,
		output: RECORDED_OUTPUT,
		executor: rule('record-v1'),
		next: (_out, state) => afterTheDecision(state)
	},
	{
		id: 'confirm',
		name: names.confirm,
		obligations: ['pra:ss1-23:mitigants'],
		input: RECORDED_OUTPUT,
		output: CONFIRM_OUTPUT,
		executor: {
			kind: 'human',
			prompt: disputesStrings.workflow.briefs.confirmReimbursement,
			options: ['confirm', 'return']
		},
		suggest: () => 'confirm',
		next: (out) => ((out as { decision?: string }).decision === 'confirm' ? 'reimburse' : 'end')
	},
	{
		id: 'reimburse',
		name: names.reimburse,
		obligations: ['psr:app-reimbursement', 'pra:ss1-23:mitigants'],
		input: CONFIRM_OUTPUT,
		output: REIMBURSE_OUTPUT,
		executor: agent('reimbursed', disputesStrings.workflow.briefs.reimburse),
		irreversible: true,
		read: (state) => {
			const { disputes } = desk(state).extra;
			return disputes.reimbursed
				? { reimbursed: true, amount: disputes.decision?.amount ?? 0 }
				: undefined;
		},
		// The payee goes to the fraud desk once the customer is made whole.
		next: (_out, state) => (scamPatternOnTheDesk(state) ? fraudHandoff(state) : 'end')
	}
];

// ── The reference configurations ───────────────────────────────────────

const ceilings = { ...DISPUTES_CEILINGS };
const rulesFor = (...ids: string[]): Record<string, Executor> =>
	Object.fromEntries(ids.map((id) => [id, rule(`${id}-v1`)]));

export const DISPUTES_CONFIGURATIONS: Record<DisputesConfigurationId, WorkflowConfig> = {
	/** The control: every stage a rule; a person confirms the payment, as the bank does today. */
	'rules-only': {
		executors: rulesFor('verify', 'classify', 'investigate', 'decision', 'reimburse')
	},
	/** Level 2: the bot verifies and investigates; the rules classify, decide and pay; a person confirms. */
	'bot-verifies-only': {
		executors: rulesFor('classify', 'decision', 'reimburse'),
		autonomy: { level: 2, ceilings }
	},
	/** Level 3: the bot verifies, classifies and investigates; the decision is a person's, the rule's verdict beside the bot's recommendation; the rule pays. */
	'bot-recommends': {
		executors: {
			...rulesFor('reimburse'),
			decision: {
				kind: 'human',
				prompt: disputesStrings.workflow.briefs.recommendation,
				options: ['reimburse', 'decline', 'refer']
			}
		},
		autonomy: { level: 3, ceilings }
	},
	/** Level 4: the bot does everything; a person confirms before the payment. */
	'bot-with-a-person-at-the-reimbursement': { autonomy: { level: 4, ceilings } },
	/** Level 5: the bot does everything and the go-ahead is its own; the Monitor is the oversight. */
	'bot-everywhere': { executors: rulesFor('confirm'), autonomy: { level: 5, ceilings } }
};

/** The decision kind a stage's output is, for the ceilings: a reimbursement within or above the limit, a decline. */
export function disputesDecisionKind(stageId: string, output: unknown): string | undefined {
	if (stageId !== 'record') return undefined;
	const recorded = output as { outcome?: string; withinLimit?: boolean } | undefined;
	if (recorded?.outcome === 'reimburse')
		return recorded.withinLimit === false
			? 'reimbursement-above-limit'
			: 'reimbursement-within-limit';
	if (recorded?.outcome === 'decline') return 'dispute-decline';
	return undefined;
}

export function disputesBookForRequest(request: BookRequest): Book {
	return disputesBookFor({
		seed: request.seed,
		size: request.size,
		...(request.periodDays !== undefined ? { periodDays: request.periodDays } : {})
	});
}

export const disputesWorkflow: WorkflowSpec = {
	id: DISPUTES_WORKFLOW_ID,
	name: disputesStrings.workflow.name,
	worldId: DISPUTES_DESK_WORLD_ID,
	purpose: disputesStrings.workflow.purpose,
	intake: (item: WorkItem) => ({
		layoutId: WORK_ITEM_LAYOUT,
		input: item.payload,
		config: { item }
	}),
	stages: DISPUTES_STAGES,
	first: 'intake',
	rules: RULES,
	obligations: ['psr:app-reimbursement', 'fca:cd:support', 'fca:cd:understanding', 'mlr:kyc'],
	configurations: DISPUTES_CONFIGURATIONS,
	decisionKindOf: disputesDecisionKind,
	book: disputesBookForRequest,
	kinds: ['dispute']
};
