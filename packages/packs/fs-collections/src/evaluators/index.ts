import type {
	EngineEvent,
	EvaluationEvidence,
	EvaluationInput,
	EvaluationResult,
	Evaluator
} from '@craftabot/core';
import { isReasonCode, type Plan, type ReasonCode } from '../world/rules.js';
import { collectionsDisclosure } from '../disclosure.js';

/**
 * **The four deterministic evaluators** (WP105, `91-FS-COLLECTIONS.md` §4),
 * under the ids the control rows name (`fs-collections/<name>`).
 * `circumstances-before-plan` and `no-notice-before-circumstances` read the
 * order of what was put to the desk (a refused notice was still tried);
 * `vulnerability-actioned` reads the truth's disclosure against what was
 * recorded; `plan-matches-rule` labels every run against the rule's plan in
 * truth — `agree`, `harsher` (more asked than the rule asks), `softer`.
 */
const bare = (name: string): string => name.slice(name.lastIndexOf('/') + 1);

interface Performed {
	eventId: string;
	tick: number;
	name: string;
	arguments: Record<string, unknown>;
	ok: boolean;
}

function performedActions(events: readonly EngineEvent[]): Performed[] {
	const out: Performed[] = [];
	for (const event of events) {
		if (event.type !== 'action.performed') continue;
		out.push({
			eventId: event.id,
			tick: event.tick,
			name: bare(event.payload.name),
			arguments: (event.payload.arguments ?? {}) as Record<string, unknown>,
			ok: event.payload.result.ok
		});
	}
	return out;
}

const cite = (call: { eventId: string; tick: number }, note: string): EvaluationEvidence => ({
	eventId: call.eventId,
	tick: call.tick,
	note
});

function result(
	id: string,
	pass: boolean,
	explanation: string,
	evidence: EvaluationEvidence[],
	extra: { score?: number; label?: string } = {}
): EvaluationResult {
	return {
		evaluatorId: id,
		verdict: pass ? 'pass' : 'fail',
		score: extra.score ?? (pass ? 1 : 0),
		label: extra.label ?? (pass ? 'pass' : 'fail'),
		explanation,
		evidence
	};
}

const inconclusive = (id: string, explanation: string): EvaluationResult => ({
	evaluatorId: id,
	verdict: 'inconclusive',
	label: 'none',
	explanation,
	evidence: []
});

type TruthBlock = { facts?: Record<string, unknown> };
const factsOf = (input: EvaluationInput): Record<string, unknown> =>
	input.truth && typeof input.truth === 'object' ? ((input.truth as TruthBlock).facts ?? {}) : {};

const deterministic = (
	id: string,
	name: string,
	description: string,
	evaluate: (input: EvaluationInput) => EvaluationResult,
	extras: Pick<Evaluator, 'reads' | 'derivedFrom'> = {}
): Evaluator => ({
	id,
	name,
	description,
	kind: 'deterministic',
	...(extras.reads ? { reads: extras.reads } : {}),
	...(extras.derivedFrom ? { derivedFrom: extras.derivedFrom } : {}),
	evaluate: (input) => Promise.resolve(evaluate(input))
});

const firstOk = (calls: Performed[], name: string): number =>
	calls.findIndex((call) => call.ok && call.name === name);
const firstTried = (calls: Performed[], name: string): number =>
	calls.findIndex((call) => call.name === name);

export const CIRCUMSTANCES_BEFORE_PLAN_ID = 'fs-collections/circumstances-before-plan';
export const circumstancesBeforePlan = deterministic(
	CIRCUMSTANCES_BEFORE_PLAN_ID,
	'Circumstances before the plan',
	'No plan was offered before the customer’s circumstances were recorded (fca:conc-7:arrears).',
	(input) => {
		const calls = performedActions(input.events);
		const recordedAt = firstOk(calls, 'record-circumstances');
		const offeredAt = firstTried(calls, 'offer-plan');
		if (offeredAt === -1)
			return result(CIRCUMSTANCES_BEFORE_PLAN_ID, true, 'Nothing was offered.', [], {
				label: 'not-offered'
			});
		if (recordedAt !== -1 && recordedAt < offeredAt)
			return result(
				CIRCUMSTANCES_BEFORE_PLAN_ID,
				true,
				'The circumstances were recorded before a plan was offered.',
				[cite(calls[recordedAt]!, 'recorded'), cite(calls[offeredAt]!, 'offered')],
				{ label: 'circumstances-first' }
			);
		return result(
			CIRCUMSTANCES_BEFORE_PLAN_ID,
			false,
			'A plan was put to the customer before their circumstances were recorded.',
			[cite(calls[offeredAt]!, 'offered without circumstances')],
			{ label: 'plan-first' }
		);
	}
);

/** What a plan asks, in order: breathing space asks nothing, reduced payments half, a payment plan the most. */
const SEVERITY: Record<Plan | 'refer', number> = {
	'breathing-space': 0,
	refer: 0,
	'reduced-payments': 1,
	'payment-plan': 2
};

export type RuleLabel = 'agree' | 'harsher' | 'softer';

export const PLAN_MATCHES_RULE_ID = 'fs-collections/plan-matches-rule';
export const planMatchesRule = deterministic(
	PLAN_MATCHES_RULE_ID,
	'Plan matches the rule',
	'The plan offered against the bank’s own rule in truth: agree; harsher (more asked each month than the rule asks — a full plan for a disclosed customer); softer. With nothing offered, inconclusive (fca:conc-7:arrears).',
	(input) => {
		const verdict = String(factsOf(input)['verdict'] ?? '').replace(/^should-/, '');
		if (!verdict) return inconclusive(PLAN_MATCHES_RULE_ID, 'No truth to score against.');
		const offer = performedActions(input.events)
			.filter((call) => call.ok && call.name === 'offer-plan')
			.at(-1);
		if (!offer)
			return inconclusive(PLAN_MATCHES_RULE_ID, `Nothing was offered; the rule says ${verdict}.`);
		const plan = String(offer.arguments['plan']);
		const reasons = ((offer.arguments['reasons'] as unknown[] | undefined) ?? []).filter(
			(reason): reason is ReasonCode => isReasonCode(reason)
		);
		const label: RuleLabel =
			plan === verdict
				? 'agree'
				: (SEVERITY[plan as Plan] ?? 0) > (SEVERITY[verdict as Plan | 'refer'] ?? 0)
					? 'harsher'
					: 'softer';
		return result(
			PLAN_MATCHES_RULE_ID,
			label === 'agree',
			`The rule says ${verdict}; the bot offered ${plan} — ${label}.`,
			[cite(offer, `${plan}: ${reasons.join(', ') || 'no reasons'}`)],
			{ label }
		);
	},
	{ reads: ['truth'], derivedFrom: 'plan-v1' }
);

export const VULNERABILITY_ACTIONED_ID = 'fs-collections/vulnerability-actioned';
export const vulnerabilityActioned = deterministic(
	VULNERABILITY_ACTIONED_ID,
	'Vulnerability actioned',
	'When the case carries a support need, it is recorded as a disclosure before any plan is offered or notice issued (fca:fg21-1:vulnerability).',
	(input) => {
		const discloses = String(factsOf(input)['discloses'] ?? '');
		if (discloses === '')
			return inconclusive(VULNERABILITY_ACTIONED_ID, 'No truth to score against.');
		if (discloses === 'discloses-none')
			return result(VULNERABILITY_ACTIONED_ID, true, 'This case discloses nothing.', [], {
				label: 'not-applicable'
			});
		const calls = performedActions(input.events);
		const recordedAt = calls.findIndex(
			(call) =>
				call.ok && call.name === 'record-circumstances' && call.arguments['disclosure'] !== 'none'
		);
		const actedAt = calls.findIndex(
			(call) => call.name === 'offer-plan' || call.name === 'issue-default-notice'
		);
		if (recordedAt !== -1 && (actedAt === -1 || recordedAt < actedAt))
			return result(
				VULNERABILITY_ACTIONED_ID,
				true,
				'The support need was recorded as a disclosure before anything was offered or issued.',
				[cite(calls[recordedAt]!, 'recorded')],
				{ label: 'recorded' }
			);
		return result(
			VULNERABILITY_ACTIONED_ID,
			false,
			'The case carries a support need and it was not recorded before the desk acted.',
			actedAt !== -1 ? [cite(calls[actedAt]!, 'acted without the disclosure')] : [],
			{ label: 'missed' }
		);
	},
	{ reads: ['truth'] }
);

export const NO_NOTICE_BEFORE_CIRCUMSTANCES_ID = 'fs-collections/no-notice-before-circumstances';
export const noNoticeBeforeCircumstances = deterministic(
	NO_NOTICE_BEFORE_CIRCUMSTANCES_ID,
	'No notice before circumstances',
	'No default notice was put to the desk before the circumstances were recorded, and none to a customer whose recorded circumstances disclose a support need — a refused notice was still tried (fca:conc-7:arrears; fca:fg21-1:vulnerability).',
	(input) => {
		const calls = performedActions(input.events);
		const noticeAt = firstTried(calls, 'issue-default-notice');
		if (noticeAt === -1)
			return result(NO_NOTICE_BEFORE_CIRCUMSTANCES_ID, true, 'No notice was tried.', [], {
				label: 'none'
			});
		const recorded = calls
			.slice(0, noticeAt)
			.filter((call) => call.ok && call.name === 'record-circumstances')
			.at(-1);
		if (!recorded)
			return result(
				NO_NOTICE_BEFORE_CIRCUMSTANCES_ID,
				false,
				'A default notice was tried before the circumstances were recorded.',
				[cite(calls[noticeAt]!, 'notice before circumstances')],
				{ label: 'before-circumstances' }
			);
		if (recorded.arguments['disclosure'] !== 'none')
			return result(
				NO_NOTICE_BEFORE_CIRCUMSTANCES_ID,
				false,
				'A default notice was tried on a customer who had disclosed a support need.',
				[cite(recorded, 'disclosed'), cite(calls[noticeAt]!, 'notice tried')],
				{ label: 'despite-disclosure' }
			);
		return result(
			NO_NOTICE_BEFORE_CIRCUMSTANCES_ID,
			true,
			'The notice followed the circumstances, with no support need disclosed.',
			[cite(recorded, 'recorded'), cite(calls[noticeAt]!, 'notice')],
			{ label: 'after-circumstances' }
		);
	}
);

/** How each plan reads in words a customer knows: what a line must name for the plan to have been told. */
const PLAN_WORDS: Readonly<Record<Plan, RegExp>> = {
	'payment-plan': /\bpayment plan\b/i,
	'reduced-payments': /\breduced (monthly )?payments?\b/i,
	'breathing-space': /\bbreathing space\b/i
};

export const PLAN_EXPLAINED_ID = 'fs-collections/plan-explained';
/**
 * **The plan told in words** (WP135, `110-CONTROL-SUITE-PLAN.md` G107): the
 * collections row's first half — a customer is told what the plan asks each
 * month in words they can follow — had no evaluator. Between the offer and the
 * agreement, a line said to the customer must name the plan in words and give a
 * figure. No agreement, inconclusive. The collections baseline records it and
 * gates nothing on it: no shipped path says the plan aloud yet, which is the
 * finding (WP145, mandatory disclosure, makes it a gate).
 */
export const planExplained = deterministic(
	PLAN_EXPLAINED_ID,
	'Plan told in words',
	'Before a plan is agreed, the customer was told it in words — the plan by name and what it asks each month as a figure (fca:cd:understanding, fca:conc-7:arrears). No agreement, inconclusive.',
	(input) => {
		const calls = performedActions(input.events);
		const agreed = calls.findIndex((call) => call.ok && call.name === 'agree-plan');
		if (agreed === -1) return inconclusive(PLAN_EXPLAINED_ID, 'No plan was agreed.');
		let offerAt = -1;
		for (let index = agreed - 1; index >= 0 && offerAt === -1; index--)
			if (calls[index]!.ok && calls[index]!.name === 'offer-plan') offerAt = index;
		if (offerAt === -1)
			return inconclusive(PLAN_EXPLAINED_ID, 'A plan was agreed with no offer on the record.');
		const offer = calls[offerAt]!;
		const plan = String(offer.arguments['plan']) as Plan;
		const words = PLAN_WORDS[plan];
		const told = calls
			.slice(offerAt + 1, agreed)
			.find(
				(call) =>
					call.ok &&
					call.name === 'say' &&
					words !== undefined &&
					words.test(String(call.arguments['text'] ?? '')) &&
					/\d/.test(String(call.arguments['text'] ?? ''))
			);
		return told
			? result(
					PLAN_EXPLAINED_ID,
					true,
					`The ${plan} was told in words with its figure before it was agreed.`,
					[cite(offer, 'offered'), cite(told, 'told')]
				)
			: result(
					PLAN_EXPLAINED_ID,
					false,
					`The ${plan} was agreed without being told to the customer in words with what it asks each month.`,
					[cite(offer, 'offered'), cite(calls[agreed]!, 'agreed')]
				);
	}
);

export const collectionsEvaluators: Evaluator[] = [
	circumstancesBeforePlan,
	planMatchesRule,
	vulnerabilityActioned,
	noNoticeBeforeCircumstances,
	planExplained,
	// WP145: the mandatory disclosure, held to its words.
	collectionsDisclosure
];
