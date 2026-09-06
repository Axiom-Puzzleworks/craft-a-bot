import type { PolicyCard } from '@craftabot/core';
import { adviceStrings } from '../strings.js';

/**
 * **The seven policy cards** (WP60 stage C, `49-FS-ADVICE.md` §4.5): v2
 * leaves only, no new mechanism. Each names its obligation tag in its
 * description; `policy.test.ts` proves each one against a scripted run that
 * does the thing it forbids. Patterns pass `isSafePattern` — no groups, no
 * braces — so a guarantee is matched by literal alternatives.
 */
const P = adviceStrings.policy;

export const GUARANTEE_PATTERN =
	'[Gg]uaranteed|[Cc]an.t lose|[Cc]annot lose|[Rr]isk.free|[Nn]o risk|[Ww]ill not lose|[Ww]on.t lose';
/** A sort code, an eight-digit account number, an NI number — the shapes the bank's numbers have. */
export const SORT_CODE_PATTERN = '\\d\\d-\\d\\d-\\d\\d';
export const ACCOUNT_NUMBER_PATTERN = '\\d\\d\\d\\d\\d\\d\\d\\d';
export const NI_NUMBER_PATTERN = '[A-Z][A-Z] ?\\d\\d ?\\d\\d ?\\d\\d ?[A-D]';

export const NO_RECOMMENDATION_BEFORE_SUITABILITY: PolicyCard = {
	id: 'fs-advice/policy/no-recommendation-before-suitability',
	title: P.noRecommendationBeforeSuitability.title,
	description: P.noRecommendationBeforeSuitability.description,
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'call-name-is', value: 'recommend-product' },
					{ kind: 'not', expr: { kind: 'world-predicate', predicateId: 'suitability-gathered' } }
				]
			},
			then: 'block-action',
			reason: P.noRecommendationBeforeSuitability.reason
		}
	]
};

export const NO_GUARANTEES: PolicyCard = {
	id: 'fs-advice/policy/no-guarantees',
	title: P.noGuarantees.title,
	description: P.noGuarantees.description,
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'call-name-is', value: 'say' },
					{ kind: 'argument-matches', path: 'text', pattern: GUARANTEE_PATTERN }
				]
			},
			then: 'block-action',
			reason: P.noGuarantees.reason
		}
	]
};

export const RISK_WARNING_RIDES_WITH_EVERY_RECOMMENDATION: PolicyCard = {
	id: 'fs-advice/policy/risk-warning-rides-with-every-recommendation',
	title: P.riskWarning.title,
	description: P.riskWarning.description,
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'call-name-is', value: 'recommend-product' },
					{
						kind: 'not',
						expr: {
							kind: 'or',
							any: [
								{ kind: 'argument-contains', path: 'rationale', value: 'at risk' },
								{ kind: 'argument-contains', path: 'rationale', value: 'can fall' },
								{ kind: 'argument-contains', path: 'rationale', value: 'protected' }
							]
						}
					}
				]
			},
			then: 'block-action',
			reason: P.riskWarning.reason
		}
	]
};

export const VULNERABILITY_MEANS_REFER: PolicyCard = {
	id: 'fs-advice/policy/vulnerability-means-refer',
	title: P.vulnerabilityMeansRefer.title,
	description: P.vulnerabilityMeansRefer.description,
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'world-predicate', predicateId: 'vulnerability-disclosed' },
					{ kind: 'call-name-is', value: 'execute-investment' }
				]
			},
			then: 'stop-run',
			reason: P.vulnerabilityMeansRefer.stopReason
		},
		{
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'world-predicate', predicateId: 'vulnerability-disclosed' },
					{ kind: 'call-name-is', value: 'recommend-product' }
				]
			},
			then: 'require-approval',
			reason: P.vulnerabilityMeansRefer.askReason
		}
	]
};

export const FOUR_EYES_ON_EXECUTION: PolicyCard = {
	id: 'fs-advice/policy/four-eyes-on-execution',
	title: P.fourEyes.title,
	description: P.fourEyes.description,
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: { kind: 'call-name-is', value: 'execute-investment' },
			then: 'require-approval',
			reason: P.fourEyes.reason
		}
	]
};

export const PII_STAYS_ON_THE_DESK: PolicyCard = {
	id: 'fs-advice/policy/pii-stays-on-the-desk',
	title: P.piiStaysOnTheDesk.title,
	description: P.piiStaysOnTheDesk.description,
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'call-name-is', value: 'say' },
					{
						kind: 'or',
						any: [
							{ kind: 'argument-matches', path: 'text', pattern: SORT_CODE_PATTERN },
							{ kind: 'argument-matches', path: 'text', pattern: ACCOUNT_NUMBER_PATTERN },
							{ kind: 'argument-matches', path: 'text', pattern: NI_NUMBER_PATTERN }
						]
					}
				]
			},
			then: 'block-action',
			reason: P.piiStaysOnTheDesk.reason
		}
	]
};

/** The CRM line's record read, as the registry names its tool (`47-…` §4.1): `fs-bank/connector_crm_read-record`. */
export const CRM_READ_RECORD = 'connector_crm_read-record';

export const PURPOSE_LIMITED_LOOKUP: PolicyCard = {
	id: 'fs-advice/policy/purpose-limited-lookup',
	title: P.purposeLimitedLookup.title,
	description: P.purposeLimitedLookup.description,
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'call-name-is', value: CRM_READ_RECORD },
					{ kind: 'argument-equals', path: 'recordId', value: 'vulnerability' },
					{ kind: 'not', expr: { kind: 'world-predicate', predicateId: 'vulnerability-disclosed' } }
				]
			},
			then: 'block-action',
			reason: P.purposeLimitedLookup.reason
		}
	]
};

/**
 * *Redress needs approval* (WP72, `61-LAST-DECKS.md` §2 item 6): the
 * complaints desk's one irreversible action, gated as execution and a
 * payment are. On the complaints deck's stacks, not the Advice Desk's seven.
 */
export const REDRESS_NEEDS_APPROVAL: PolicyCard = {
	id: 'fs-advice/policy/redress-needs-approval',
	title: 'Redress needs approval',
	description:
		'Paying redress on a complaint cannot be taken back: a person approves it first (DISP; fca:disp:complaints).',
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: { kind: 'call-name-is', value: 'offer-redress' },
			then: 'require-approval',
			reason: 'Redress cannot be taken back — a person approves it first.'
		}
	]
};

export const advicePolicyCards: PolicyCard[] = [
	NO_RECOMMENDATION_BEFORE_SUITABILITY,
	NO_GUARANTEES,
	RISK_WARNING_RIDES_WITH_EVERY_RECOMMENDATION,
	VULNERABILITY_MEANS_REFER,
	FOUR_EYES_ON_EXECUTION,
	PII_STAYS_ON_THE_DESK,
	PURPOSE_LIMITED_LOOKUP
];

export const ADVICE_POLICY_CARD_IDS: readonly string[] = advicePolicyCards.map((card) => card.id);

/** The complaints deck's stack (WP72): the redress gate alone — the Advice Desk's seven speak to advice, not complaints. */
export const COMPLAINTS_POLICY_CARD_IDS: readonly string[] = [REDRESS_NEEDS_APPROVAL.id];
