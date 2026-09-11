import type {
	ActionCall,
	BookRequest,
	Book,
	DeskRecord,
	Executor,
	JsonSchema,
	StageSpec,
	WorkflowConfig,
	WorkflowSpec,
	WorldState
} from '@craftabot/core';
import { population } from '@craftabot/pack-fs-bank';
import { lendingBook } from './book.js';
import { LENDING_CEILINGS } from './decision-rights.js';
import { lendingStrings } from './strings.js';
import type { ApplicationItemPayload } from './world/cases.js';
import {
	LENDING_DESK_WORLD_ID,
	WORK_ITEM_LAYOUT,
	knobsOf,
	type LendingDeskState
} from './world/desk.js';
import { WORKSHEET_RECORD } from './world/extra.js';
import {
	OUTCOMES,
	REASON_CODES,
	lendingPolicyFrom,
	verdictFromFigures,
	type LendingPolicy,
	type Outcome,
	type ReasonCode,
	type RuleFigures
} from './world/rules.js';

/**
 * **The lending workflow** (WP80, `64-TARGET-DESIGN-V5.md` §6.2.3; `73-…`):
 * the journey over the existing Lending Desk as ten stages with typed
 * input and output and a default executor each, and the five reference
 * configurations — each an autonomy level applied to the journey, with the
 * decision-rights ceilings carried as configuration and measured, never
 * enforced. Content only: the runtime is `@craftabot/workflow`.
 *
 * Ten stages, not the design's nine: `record` performs a person's decision
 * on the desk when the `decision` stage was a human's (`bot-recommends`),
 * and is a no-op that carries the decision through otherwise — a `human`
 * executor answers, it does not act.
 */
export const LENDING_WORKFLOW_ID = 'fs-lending/lending';

export const LENDING_CONFIGURATION_IDS = [
	'rules-only',
	'bot-explains-only',
	'bot-recommends',
	'bot-with-a-person-at-the-decision',
	'bot-everywhere'
] as const;
export type LendingConfigurationId = (typeof LENDING_CONFIGURATION_IDS)[number];

// ── Schemas at the stage boundaries ────────────────────────────────────

const OUTCOME_ENUM = { enum: [...OUTCOMES] };
const REASONS = { type: 'array', items: { type: 'string' } };

const ITEM_INPUT: JsonSchema = {
	type: 'object',
	required: ['application'],
	properties: {
		application: {
			type: 'object',
			required: [
				'amount',
				'termMonths',
				'purpose',
				'declaredMonthlyIncome',
				'declaredMonthlyOutgoings'
			],
			properties: {
				amount: { type: 'number' },
				termMonths: { type: 'integer' },
				purpose: { type: 'string' },
				declaredMonthlyIncome: { type: 'number' },
				declaredMonthlyOutgoings: { type: 'number' }
			}
		},
		applicant: { type: 'object' },
		appeal: { type: 'object', required: ['grounds'], properties: { grounds: { type: 'string' } } }
	}
};
const INTAKE_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['applicationId', 'amount', 'termMonths', 'purpose'],
	properties: {
		applicationId: { type: 'string' },
		amount: { type: 'number' },
		termMonths: { type: 'integer' },
		purpose: { type: 'string' },
		applicant: { type: 'string' }
	}
};
const IDENTITY_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['verified'],
	properties: { verified: { const: true } }
};
const BUREAU_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['scoreBand', 'defaults', 'arrearsMonths', 'searchesLast12m'],
	properties: {
		scoreBand: { type: 'string' },
		defaults: { type: 'integer' },
		arrearsMonths: { type: 'integer' },
		searchesLast12m: { type: 'integer' }
	}
};
const WORKSHEET_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['monthlyRepayment', 'repaymentToDisposablePercent', 'disposableIncome'],
	properties: {
		verifiedMonthlyIncome: { type: 'number' },
		monthlyCommitments: { type: 'number' },
		disposableIncome: { type: 'number' },
		monthlyRepayment: { type: 'number' },
		repaymentToDisposablePercent: { type: 'number' }
	}
};
/** The desk's decision, or — when a person chose — the choice the `record` stage performs. */
const DECISION_OUTPUT: JsonSchema = {
	type: 'object',
	properties: { outcome: OUTCOME_ENUM, reasons: REASONS, decision: OUTCOME_ENUM }
};
const RECORDED_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['outcome', 'reasons'],
	properties: { outcome: OUTCOME_ENUM, reasons: REASONS }
};
const EXPLANATION_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['reasons', 'text'],
	properties: { reasons: REASONS, text: { type: 'string' } }
};
const FOUR_EYES_OPTIONS = ['confirm', 'return', 'overturn'] as const;
const FOUR_EYES_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['decision'],
	properties: { decision: { enum: [...FOUR_EYES_OPTIONS] } }
};
const DISBURSEMENT_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['amount', 'accountId', 'monthlyRepayment'],
	properties: {
		amount: { type: 'number' },
		accountId: { type: 'string' },
		monthlyRepayment: { type: 'number' }
	}
};
const APPEAL_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['grounds'],
	properties: { grounds: { type: 'string' } }
};

// ── Reading the desk ───────────────────────────────────────────────────

const desk = (state: WorldState): LendingDeskState => state as LendingDeskState;
const record = (state: WorldState, id: string): DeskRecord | undefined =>
	desk(state).records.find((r) => r.id === id) ?? desk(state).hidden.find((r) => r.id === id);
const num = (value: unknown): number => Number(value ?? 0);
const policyOf = (state: WorldState): LendingPolicy => knobsOf(desk(state).config);

/** The figures the rule reads, off the desk's own records — the bureau file and the worksheet, never truth. */
export function figuresOnTheDesk(state: WorldState): RuleFigures | undefined {
	const bureau = record(state, 'bureau');
	const worksheet = record(state, WORKSHEET_RECORD);
	if (!bureau || !worksheet) return undefined;
	return {
		scoreBand: String(bureau.fields['score_band']),
		defaults: num(bureau.fields['defaults']),
		arrearsMonths: num(bureau.fields['arrears_months']),
		searchesLast12m: num(bureau.fields['searches_12m']),
		ratioPercent: num(worksheet.fields['repayment_to_disposable_percent'])
	};
}

const worksheetOutput = (state: WorldState) => {
	const worksheet = record(state, WORKSHEET_RECORD);
	if (!worksheet) return undefined;
	return {
		verifiedMonthlyIncome: num(worksheet.fields['verified_monthly_income']),
		monthlyCommitments: num(worksheet.fields['monthly_commitments']),
		disposableIncome: num(worksheet.fields['disposable_income']),
		monthlyRepayment: num(worksheet.fields['monthly_repayment']),
		repaymentToDisposablePercent: num(worksheet.fields['repayment_to_disposable_percent'])
	};
};

/** The rule's verdict from what the desk shows, under the policy in force. */
export function ruleVerdictOnTheDesk(
	state: WorldState
): { verdict: Outcome; reasons: ReasonCode[] } | undefined {
	const figures = figuresOnTheDesk(state);
	return figures ? verdictFromFigures(figures, policyOf(state)) : undefined;
}

const plainReasons = (reasons: readonly ReasonCode[]): string =>
	reasons.map((reason) => REASON_CODES[reason].plain).join('; ');

const fourEyesWanted = (state: WorldState): boolean => {
	const outcome = desk(state).extra.lending.decision?.outcome;
	const policy = policyOf(state);
	if (policy.fourEyes === 'none') return false;
	if (policy.fourEyes === 'all') return true;
	return outcome === 'approve';
};
const hasAppeal = (state: WorldState): boolean =>
	desk(state).extra.lending.appealGrounds !== undefined;
const afterTheDecision = (state: WorldState): string =>
	fourEyesWanted(state)
		? 'four-eyes'
		: desk(state).extra.lending.decision?.outcome === 'approve'
			? 'disbursement'
			: hasAppeal(state)
				? 'appeal'
				: 'end';

// ── The rules ──────────────────────────────────────────────────────────

const call = (name: string, args: unknown = {}): ActionCall => ({ name, arguments: args });

const RULES: WorkflowSpec['rules'] = {
	'intake-v1': (_input, state) => {
		const application = record(state, 'application');
		return {
			output: {
				applicationId: 'application',
				amount: num(application?.fields['amount']),
				termMonths: num(application?.fields['term_months']),
				purpose: String(application?.fields['purpose'] ?? ''),
				applicant: String(application?.fields['applicant'] ?? '')
			}
		};
	},
	'identity-v1': () => ({ output: { verified: true }, call: call('verify-identity') }),
	'affordability-v1': (_input, state) => ({
		output: worksheetOutput(state) ?? {},
		call: call('assess-affordability')
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
		const decided = desk(state).extra.lending.decision;
		// The desk already carries the decision (a bot's or a rule's): carry it through.
		if (decided) return { output: { outcome: decided.outcome, reasons: decided.reasons } };
		const outcome = chosen.decision ?? chosen.outcome;
		if (!outcome) return { output: {} };
		const verdict = ruleVerdictOnTheDesk(state);
		// A person who followed the rule signs its reasons; one who overrode it signs the one honest code.
		const reasons: ReasonCode[] =
			verdict && verdict.verdict === outcome ? verdict.reasons : ['rules-cannot-decide'];
		return { output: { outcome, reasons }, call: call('decide', { outcome, reasons }) };
	},
	'explanation-v1': (_input, state) => {
		const decided = desk(state).extra.lending.decision;
		if (!decided) return { output: {} };
		const text = `${lendingStrings.verbs[decided.outcome]}: ${plainReasons(decided.reasons)}.`;
		return {
			output: { reasons: decided.reasons, text },
			call: call('explain-decision', { reasons: decided.reasons, text })
		};
	},
	'disburse-v1': (_input, state) => {
		const worksheet = record(state, WORKSHEET_RECORD);
		const current = desk(state).extra.bank.accounts.find((account) => account.kind === 'current');
		return {
			output: {
				amount: num(worksheet?.fields['amount']),
				accountId: current?.id ?? 'none',
				monthlyRepayment: num(worksheet?.fields['monthly_repayment'])
			},
			call: call('disburse')
		};
	},
	'appeal-v1': (_input, state) => {
		const grounds = desk(state).extra.lending.appealGrounds ?? '';
		return { output: { grounds }, call: call('log-appeal', { grounds }) };
	}
};

// ── The stages ─────────────────────────────────────────────────────────

const agent = (until: string, goalText: string): Executor => ({ kind: 'agent', until, goalText });
const rule = (id: string): Executor => ({ kind: 'rule', rule: id });
const names = lendingStrings.workflow.stages;

export const LENDING_STAGES: StageSpec[] = [
	{
		id: 'intake',
		name: names.intake,
		input: ITEM_INPUT,
		output: INTAKE_OUTPUT,
		executor: rule('intake-v1'),
		next: () => 'identity'
	},
	{
		id: 'identity',
		name: names.identity,
		input: INTAKE_OUTPUT,
		output: IDENTITY_OUTPUT,
		executor: agent('identity-verified', lendingStrings.workflow.briefs.identity),
		read: (state) => (desk(state).extra.lending.verified ? { verified: true } : undefined),
		next: () => 'bureau'
	},
	{
		id: 'bureau',
		name: names.bureau,
		input: IDENTITY_OUTPUT,
		output: BUREAU_OUTPUT,
		executor: {
			kind: 'line',
			lineId: 'fs-bank/credit-bureau',
			operation: 'file',
			arguments: () => ({})
		},
		next: () => 'affordability'
	},
	{
		id: 'affordability',
		name: names.affordability,
		input: BUREAU_OUTPUT,
		output: WORKSHEET_OUTPUT,
		executor: agent('affordability-assessed', lendingStrings.workflow.briefs.affordability),
		read: (state) => (desk(state).extra.lending.assessed ? worksheetOutput(state) : undefined),
		next: () => 'decision'
	},
	{
		id: 'decision',
		name: names.decision,
		input: WORKSHEET_OUTPUT,
		output: DECISION_OUTPUT,
		executor: agent('decided', lendingStrings.workflow.briefs.decision),
		guards: { policyCards: [] },
		read: (state) => {
			const decided = desk(state).extra.lending.decision;
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
		next: () => 'explanation'
	},
	{
		id: 'explanation',
		name: names.explanation,
		input: RECORDED_OUTPUT,
		output: EXPLANATION_OUTPUT,
		executor: agent('explained', lendingStrings.workflow.briefs.explanation),
		read: (state) => {
			const { explained } = desk(state).extra.lending;
			const text = desk(state).extra.ledger.notes.at(-1);
			return explained.length > 0 && text !== undefined ? { reasons: explained, text } : undefined;
		},
		next: (_out, state) => afterTheDecision(state)
	},
	{
		id: 'four-eyes',
		name: names.fourEyes,
		input: EXPLANATION_OUTPUT,
		output: FOUR_EYES_OUTPUT,
		executor: {
			kind: 'human',
			prompt: lendingStrings.workflow.briefs.fourEyes,
			options: [...FOUR_EYES_OPTIONS]
		},
		suggest: () => 'confirm',
		next: (out, state) => {
			const confirmed = (out as { decision?: string }).decision === 'confirm';
			if (confirmed && desk(state).extra.lending.decision?.outcome === 'approve')
				return 'disbursement';
			return hasAppeal(state) ? 'appeal' : 'end';
		}
	},
	{
		id: 'disbursement',
		name: names.disbursement,
		input: { type: 'object' },
		output: DISBURSEMENT_OUTPUT,
		executor: agent('disbursed', lendingStrings.workflow.briefs.disbursement),
		irreversible: true,
		read: (state) => {
			const loan = desk(state).extra.ledger.loans.at(-1);
			return loan
				? {
						amount: loan.amount,
						accountId: loan.accountId,
						monthlyRepayment: loan.monthlyRepayment
					}
				: undefined;
		},
		next: (_out, state) => (hasAppeal(state) ? 'appeal' : 'end')
	},
	{
		id: 'appeal',
		name: names.appeal,
		input: { type: 'object' },
		output: APPEAL_OUTPUT,
		executor: agent('appealed', lendingStrings.workflow.briefs.appeal),
		read: (state) => {
			const grounds = desk(state).extra.lending.appeal;
			return grounds !== undefined ? { grounds } : undefined;
		},
		next: () => 'end'
	}
];

// ── The reference configurations ───────────────────────────────────────

const ceilings = { ...LENDING_CEILINGS };
const rulesFor = (...ids: string[]): Record<string, Executor> =>
	Object.fromEntries(
		ids.map((id) => [
			id,
			rule(
				id === 'identity'
					? 'identity-v1'
					: id === 'affordability'
						? 'affordability-v1'
						: id === 'decision'
							? 'decision-v1'
							: id === 'explanation'
								? 'explanation-v1'
								: id === 'disbursement'
									? 'disburse-v1'
									: 'appeal-v1'
			)
		])
	);

export const LENDING_CONFIGURATIONS: Record<LendingConfigurationId, WorkflowConfig> = {
	/** The control: every stage a rule or a line, the bot nowhere; a person confirms a payout, as the bank does today. */
	'rules-only': {
		executors: rulesFor(
			'identity',
			'affordability',
			'decision',
			'explanation',
			'disbursement',
			'appeal'
		)
	},
	/** Level 2: rules decide; the bot drafts the explanation; a person confirms every decision before anything goes out. */
	'bot-explains-only': {
		executors: rulesFor('identity', 'affordability', 'decision', 'disbursement', 'appeal'),
		knobs: { fourEyes: 'all' },
		autonomy: { level: 2, ceilings }
	},
	/** Level 3: the bot assesses and recommends; the decision is a person's, choosing among the bot's recommendation and the rule's verdict. */
	'bot-recommends': {
		executors: {
			...rulesFor('disbursement'),
			decision: {
				kind: 'human',
				prompt: lendingStrings.workflow.briefs.recommendation,
				options: [...OUTCOMES]
			}
		},
		autonomy: { level: 3, ceilings }
	},
	/** Level 4: the bot decides; four eyes on every decision before anything executes. */
	'bot-with-a-person-at-the-decision': {
		knobs: { fourEyes: 'all' },
		autonomy: { level: 4, ceilings }
	},
	/** Level 5: the bot decides and disburses within the knobs; four eyes on nothing; the Monitor is the oversight. */
	'bot-everywhere': {
		knobs: { fourEyes: 'none' },
		autonomy: { level: 5, ceilings }
	}
};

/** The decision kind a stage's output is, for the ceilings: only `record` carries the decision through, so it is counted once. */
export function lendingDecisionKind(stageId: string, output: unknown): string | undefined {
	if (stageId !== 'record') return undefined;
	const outcome = (output as { outcome?: string } | undefined)?.outcome;
	if (outcome === 'approve') return 'in-policy-credit-approval';
	if (outcome === 'decline') return 'adverse-credit-decision';
	return undefined;
}

export function lendingBookFor(request: BookRequest): Book {
	const pop = population(request.seed, {
		size: request.size,
		...(request.periodDays !== undefined ? { periodDays: request.periodDays } : {})
	});
	const policy = lendingPolicyFrom(request.knobs);
	const filter = (request.filter ?? {}) as Parameters<typeof lendingBook>[1] extends infer O
		? O extends { filter?: infer F }
			? F
			: never
		: never;
	return lendingBook(pop, { policy, ...(filter ? { filter } : {}) }).book;
}

export const lendingWorkflow: WorkflowSpec = {
	id: LENDING_WORKFLOW_ID,
	name: lendingStrings.workflow.name,
	worldId: LENDING_DESK_WORLD_ID,
	purpose: lendingStrings.workflow.purpose,
	intake: (item) => ({
		layoutId: WORK_ITEM_LAYOUT,
		input: item.payload as ApplicationItemPayload,
		config: { item }
	}),
	stages: LENDING_STAGES,
	first: 'intake',
	rules: RULES,
	obligations: [
		'fca:conc:creditworthiness',
		'fca:conc:affordability',
		'fca:cd:understanding',
		'equality-act:fairness'
	],
	configurations: LENDING_CONFIGURATIONS,
	decisionKindOf: lendingDecisionKind,
	book: lendingBookFor,
	kinds: ['application']
};
