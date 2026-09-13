import type {
	ActionCall,
	Book,
	BookRequest,
	DeskRecord,
	Executor,
	JsonSchema,
	StageSpec,
	WorkItem,
	WorkflowConfig,
	WorkflowSpec,
	WorldState
} from '@craftabot/core';
import { onboardingBookFor } from './book.js';
import { ONBOARDING_CEILINGS } from './decision-rights.js';
import { onboardingStrings } from './strings.js';
import {
	ONBOARDING_DESK_WORLD_ID,
	WORK_ITEM_LAYOUT,
	type OnboardingDeskState
} from './world/desk.js';
import { RISK_RECORD, SCREENING_RECORD } from './world/extra.js';
import {
	verdictFromFigures,
	type Outcome,
	type ReasonCode,
	type RiskRating,
	type RuleFigures,
	type Screening
} from './world/rules.js';

/**
 * **The onboarding workflow** (WP103, `83-…` §6.5.2; `95-…` §4.6): the
 * journey over the Onboarding Desk as eight stages with typed input and
 * output and a default executor each, and the five reference
 * configurations by autonomy level, with the ceilings carried and
 * measured, never enforced. Content only: the runtime is
 * `@craftabot/workflow`. The identity and screening stages act on the
 * desk (the `kyc` line's `sanctions` operation answers the same function
 * for a Connector), so the trace carries the desk's records.
 */
export const ONBOARDING_WORKFLOW_ID = 'fs-onboarding/onboarding';

export const ONBOARDING_CONFIGURATION_IDS = [
	'rules-only',
	'bot-welcomes-only',
	'bot-recommends',
	'bot-with-a-person-at-the-open',
	'bot-everywhere'
] as const;
export type OnboardingConfigurationId = (typeof ONBOARDING_CONFIGURATION_IDS)[number];

// ── Schemas at the stage boundaries ────────────────────────────────────

const OUTCOME_ENUM = { enum: ['approve', 'decline', 'refer'] };
const REASONS = { type: 'array', items: { type: 'string' } };

const ITEM_INPUT: JsonSchema = {
	type: 'object',
	required: ['application'],
	properties: {
		application: {
			type: 'object',
			required: ['productKind', 'purpose', 'given'],
			properties: {
				productKind: { type: 'string' },
				purpose: { type: 'string' },
				given: {
					type: 'object',
					required: ['birthYear', 'postcode'],
					properties: { birthYear: { type: 'number' }, postcode: { type: 'string' } }
				}
			}
		},
		applicant: { type: 'object' }
	}
};
const APPLICATION_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['applicant', 'product'],
	properties: { applicant: { type: 'string' }, product: { type: 'string' } }
};
const IDENTITY_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['verified'],
	// An enum of the two, not `type: boolean`: the Journey Canvas enumerates enum values, so the identity stage fans to the screening and the decision.
	properties: { verified: { enum: [true, false] } }
};
const SCREENING_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['result'],
	properties: { result: { enum: ['clear', 'match'] } }
};
const RATING_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['rating'],
	properties: { rating: { enum: ['low', 'medium', 'high'] } }
};
const DECISION_OUTPUT: JsonSchema = {
	type: 'object',
	properties: { outcome: OUTCOME_ENUM, reasons: REASONS, decision: OUTCOME_ENUM }
};
const RECORDED_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['outcome', 'reasons'],
	properties: { outcome: OUTCOME_ENUM, reasons: REASONS }
};
const OPEN_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['opened'],
	properties: { opened: { const: true }, product: { type: 'string' } }
};
const CONFIRM_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['decision'],
	properties: { decision: { enum: ['confirm', 'return'] } }
};
const WELCOME_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['welcomed'],
	properties: { welcomed: { const: true } }
};

// ── Reading the desk ───────────────────────────────────────────────────

const desk = (state: WorldState): OnboardingDeskState => state as OnboardingDeskState;
const record = (state: WorldState, id: string): DeskRecord | undefined =>
	desk(state).records.find((r) => r.id === id) ?? desk(state).hidden.find((r) => r.id === id);

/** The figures the rule reads, off the desk's own records — the identity check, the screening and the rating, never truth. */
export function figuresOnTheDesk(state: WorldState): RuleFigures | undefined {
	const { onboarding } = desk(state).extra;
	if (!onboarding.identityChecked) return undefined;
	// An applicant who did not verify is declined on identity alone: the rule needs no screening or rating for them.
	if (!onboarding.verified) return { verified: false, screening: 'none', rating: 'low' };
	if (!onboarding.screened || onboarding.rating === undefined) return undefined;
	return {
		verified: onboarding.verified,
		screening: onboarding.screening ?? 'none',
		rating: onboarding.rating
	};
}

/** The rule's verdict from what the desk shows. */
export function ruleVerdictOnTheDesk(
	state: WorldState
): { verdict: Outcome; reasons: ReasonCode[] } | undefined {
	const figures = figuresOnTheDesk(state);
	return figures ? verdictFromFigures(figures) : undefined;
}

const afterTheDecision = (state: WorldState): string => {
	const decision = desk(state).extra.onboarding.decision;
	return decision?.outcome === 'approve' ? 'confirm' : 'end';
};

// ── The rules ──────────────────────────────────────────────────────────

const call = (name: string, args: unknown = {}): ActionCall => ({ name, arguments: args });

const RULES: WorkflowSpec['rules'] = {
	'application-v1': (_input, state) => {
		const { onboarding, bank } = desk(state).extra;
		return {
			output: { applicant: bank.customer.name.full, product: onboarding.application.productKind }
		};
	},
	'identity-v1': (_input, state) => {
		const verifies = desk(state).extra.onboarding.application.given;
		const document = record(state, 'identity-document');
		const matches =
			verifies.birthYear === Number(document?.fields['born']) &&
			verifies.postcode.replaceAll(' ', '').toUpperCase() ===
				String(document?.fields['postcode'] ?? '')
					.replaceAll(' ', '')
					.toUpperCase();
		return { output: { verified: matches }, call: call('verify-identity') };
	},
	'screening-v1': (_input, state) => {
		const screening = record(state, SCREENING_RECORD);
		return {
			output: { result: String(screening?.fields['result'] ?? 'clear') },
			call: call('screen-applicant')
		};
	},
	'risk-rating-v1': (_input, state) => {
		const risk = record(state, RISK_RECORD);
		return {
			output: { rating: String(risk?.fields['rating'] ?? 'low') as RiskRating },
			call: call('rate-risk')
		};
	},
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
		const decided = desk(state).extra.onboarding.decision;
		if (decided) return { output: { outcome: decided.outcome, reasons: decided.reasons } };
		const outcome = chosen.decision ?? chosen.outcome;
		if (!outcome) return { output: {} };
		const verdict = ruleVerdictOnTheDesk(state);
		// A person who followed the rule signs its reasons; one who overrode it signs the one honest code the file supports.
		const reasons: ReasonCode[] =
			verdict && verdict.verdict === outcome
				? verdict.reasons
				: outcome === 'approve'
					? ['clean']
					: ['enhanced-due-diligence'];
		return { output: { outcome, reasons }, call: call('decide', { outcome, reasons }) };
	},
	/** Level 5 only: the go-ahead is the bot's own. */
	'confirm-v1': () => ({ output: { decision: 'confirm' } }),
	'open-v1': (_input, state) => ({
		output: { opened: true, product: desk(state).extra.onboarding.application.productKind },
		call: call('open-account')
	}),
	'welcome-v1': (_input, state) => {
		const { application } = desk(state).extra.onboarding;
		const text = `Welcome to the bank. Your ${application.productKind} account is open; your card and details follow by post within five working days.`;
		return { output: { welcomed: true }, call: call('welcome', { text }) };
	}
};

// ── The stages ─────────────────────────────────────────────────────────

const agent = (until: string, goalText: string): Executor => ({ kind: 'agent', until, goalText });
const rule = (id: string): Executor => ({ kind: 'rule', rule: id });
const names = onboardingStrings.workflow.stages;

export const ONBOARDING_STAGES: StageSpec[] = [
	{
		id: 'application',
		name: names.application,
		input: ITEM_INPUT,
		output: APPLICATION_OUTPUT,
		executor: rule('application-v1'),
		next: () => 'identity'
	},
	{
		id: 'identity',
		name: names.identity,
		obligations: ['mlr:kyc'],
		input: APPLICATION_OUTPUT,
		output: IDENTITY_OUTPUT,
		executor: agent('identity-checked', onboardingStrings.workflow.briefs.identity),
		read: (state) => {
			const { onboarding } = desk(state).extra;
			return onboarding.identityChecked ? { verified: onboarding.verified } : undefined;
		},
		next: (out) => ((out as { verified?: boolean }).verified === false ? 'decision' : 'screening')
	},
	{
		id: 'screening',
		name: names.screening,
		obligations: ['mlr:screening', 'poca:tipping-off'],
		input: IDENTITY_OUTPUT,
		output: SCREENING_OUTPUT,
		executor: agent('screened', onboardingStrings.workflow.briefs.screening),
		guards: { policyCards: [] },
		read: (state) => {
			const { onboarding } = desk(state).extra;
			return onboarding.screened
				? { result: onboarding.screening === 'none' ? 'clear' : 'match' }
				: undefined;
		},
		next: () => 'risk-rating'
	},
	{
		id: 'risk-rating',
		name: names.riskRating,
		obligations: ['mlr:kyc'],
		input: SCREENING_OUTPUT,
		output: RATING_OUTPUT,
		executor: rule('risk-rating-v1'),
		next: () => 'decision'
	},
	{
		id: 'decision',
		name: names.decision,
		obligations: ['mlr:screening', 'poca:tipping-off'],
		input: { type: 'object' },
		output: DECISION_OUTPUT,
		executor: agent('decided', onboardingStrings.workflow.briefs.decision),
		guards: { policyCards: [] },
		read: (state) => {
			const decided = desk(state).extra.onboarding.decision;
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
		name: 'Four eyes',
		obligations: ['pra:ss1-23:mitigants'],
		input: RECORDED_OUTPUT,
		output: CONFIRM_OUTPUT,
		executor: {
			kind: 'human',
			prompt: onboardingStrings.workflow.briefs.confirmOpen,
			options: ['confirm', 'return']
		},
		suggest: () => 'confirm',
		next: (out) => ((out as { decision?: string }).decision === 'confirm' ? 'open' : 'end')
	},
	{
		id: 'open',
		name: names.open,
		obligations: ['mlr:kyc', 'pra:ss1-23:mitigants'],
		input: CONFIRM_OUTPUT,
		output: OPEN_OUTPUT,
		executor: agent('opened', onboardingStrings.workflow.briefs.open),
		irreversible: true,
		read: (state) => {
			const { onboarding } = desk(state).extra;
			return onboarding.opened
				? { opened: true, product: onboarding.application.productKind }
				: undefined;
		},
		next: () => 'welcome'
	},
	{
		id: 'welcome',
		name: names.welcome,
		obligations: ['fca:cd:understanding', 'poca:tipping-off'],
		input: OPEN_OUTPUT,
		output: WELCOME_OUTPUT,
		executor: agent('welcomed', onboardingStrings.workflow.briefs.welcome),
		read: (state) => (desk(state).extra.onboarding.welcomed ? { welcomed: true } : undefined),
		next: () => 'end'
	}
];

// ── The reference configurations ───────────────────────────────────────

const ceilings = { ...ONBOARDING_CEILINGS };
const rulesFor = (...ids: string[]): Record<string, Executor> =>
	Object.fromEntries(ids.map((id) => [id, rule(`${id}-v1`)]));

export const ONBOARDING_CONFIGURATIONS: Record<OnboardingConfigurationId, WorkflowConfig> = {
	/** The control: every stage a rule; a person confirms the open, as the bank does today. */
	'rules-only': { executors: rulesFor('identity', 'screening', 'decision', 'open', 'welcome') },
	/** Level 2: the rules verify, screen and decide; the bot welcomes; a person confirms the open. */
	'bot-welcomes-only': {
		executors: rulesFor('identity', 'screening', 'decision', 'open'),
		autonomy: { level: 2, ceilings }
	},
	/** Level 3: the bot verifies and screens; the decision is a person's, with the rule's verdict beside the bot's recommendation. */
	'bot-recommends': {
		executors: {
			...rulesFor('open'),
			decision: {
				kind: 'human',
				prompt: onboardingStrings.workflow.briefs.recommendation,
				options: ['approve', 'decline', 'refer']
			}
		},
		autonomy: { level: 3, ceilings }
	},
	/** Level 4: the bot does everything; a person confirms before the account opens. */
	'bot-with-a-person-at-the-open': { autonomy: { level: 4, ceilings } },
	/** Level 5: the bot does everything and the go-ahead is its own; the Monitor is the oversight. */
	'bot-everywhere': { executors: rulesFor('confirm'), autonomy: { level: 5, ceilings } }
};

/** The decision kind a stage's output is, for the ceilings: the open once; an adverse decision when recorded; a screening match at the screening. */
export function onboardingDecisionKind(stageId: string, output: unknown): string | undefined {
	if (stageId === 'open' && (output as { opened?: boolean } | undefined)?.opened === true)
		return 'account-open';
	if (stageId === 'record') {
		const outcome = (output as { outcome?: string } | undefined)?.outcome;
		if (outcome === 'decline' || outcome === 'refer') return 'adverse-onboarding-decision';
	}
	if (stageId === 'screening' && (output as { result?: string } | undefined)?.result === 'match')
		return 'screening-hit-handling';
	return undefined;
}

export function onboardingBookForRequest(request: BookRequest): Book {
	return onboardingBookFor({
		seed: request.seed,
		size: request.size,
		...(request.periodDays !== undefined ? { periodDays: request.periodDays } : {})
	});
}

export const onboardingWorkflow: WorkflowSpec = {
	id: ONBOARDING_WORKFLOW_ID,
	name: onboardingStrings.workflow.name,
	worldId: ONBOARDING_DESK_WORLD_ID,
	purpose: onboardingStrings.workflow.purpose,
	intake: (item: WorkItem) => ({
		layoutId: WORK_ITEM_LAYOUT,
		input: item.payload,
		config: { item }
	}),
	stages: ONBOARDING_STAGES,
	first: 'application',
	rules: RULES,
	obligations: ['mlr:kyc', 'mlr:screening', 'poca:tipping-off', 'fca:cd:understanding'],
	configurations: ONBOARDING_CONFIGURATIONS,
	decisionKindOf: onboardingDecisionKind,
	book: onboardingBookForRequest,
	kinds: ['onboarding']
};

export type { Screening };
