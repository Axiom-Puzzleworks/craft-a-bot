import type {
	EngineEvent,
	EvaluationEvidence,
	EvaluationInput,
	EvaluationResult,
	Evaluator
} from '@craftabot/core';
import { isReasonCode, type ReasonCode } from '../world/rules.js';

/**
 * **The four deterministic evaluators** (WP104, `90-FS-DISPUTES.md` §4),
 * under the ids the control rows name (`fs-disputes/<name>`).
 * `classified-before-decision` and `hold-before-investigation` read the
 * order of what performed; `reimbursed-within-limit` reads the truth's
 * limit against what was paid; `decision-matches-rules` labels every run
 * against the rule's verdict in truth. Pure over the trace and, where
 * declared, the truth.
 */
const bare = (name: string): string => name.slice(name.lastIndexOf('/') + 1);

interface Performed {
	eventId: string;
	tick: number;
	name: string;
	arguments: Record<string, unknown>;
	ok: boolean;
	narration: string;
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
			ok: event.payload.result.ok,
			narration: event.payload.result.narration
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

const lastDecision = (events: readonly EngineEvent[]): Performed | undefined =>
	performedActions(events)
		.filter((call) => call.ok && call.name === 'decide')
		.at(-1);

const reasonsOf = (call: Performed | undefined): ReasonCode[] =>
	((call?.arguments['reasons'] as unknown[] | undefined) ?? []).filter(isReasonCode);

const deterministic = (
	id: string,
	name: string,
	description: string,
	evaluate: (input: EvaluationInput) => EvaluationResult,
	extras: Pick<Evaluator, 'reads'> = {}
): Evaluator => ({
	id,
	name,
	description,
	kind: 'deterministic',
	...(extras.reads ? { reads: extras.reads } : {}),
	evaluate: (input) => Promise.resolve(evaluate(input))
});

const firstOk = (calls: Performed[], name: string): number =>
	calls.findIndex((call) => call.ok && call.name === name);

export const CLASSIFIED_BEFORE_DECISION_ID = 'fs-disputes/classified-before-decision';
export const classifiedBeforeDecision = deterministic(
	CLASSIFIED_BEFORE_DECISION_ID,
	'Classified before decision',
	'No dispute was decided before it was classified — unauthorised, an authorised scam, or a merchant dispute (psr:app-reimbursement).',
	(input) => {
		const calls = performedActions(input.events);
		const classifiedAt = firstOk(calls, 'classify');
		const decidedAt = firstOk(calls, 'decide');
		if (decidedAt === -1)
			return result(CLASSIFIED_BEFORE_DECISION_ID, true, 'Nothing was decided.', [], {
				label: 'not-decided'
			});
		const decided = calls[decidedAt]!;
		if (classifiedAt !== -1 && classifiedAt < decidedAt)
			return result(
				CLASSIFIED_BEFORE_DECISION_ID,
				true,
				'The dispute was classified before it was decided.',
				[cite(calls[classifiedAt]!, 'classified'), cite(decided, 'decided')],
				{ label: 'classified-first' }
			);
		return result(
			CLASSIFIED_BEFORE_DECISION_ID,
			false,
			'A dispute was decided before it was classified.',
			[cite(decided, 'decided unclassified')],
			{ label: 'unclassified' }
		);
	}
);

export const HOLD_BEFORE_INVESTIGATION_ID = 'fs-disputes/hold-before-investigation';
export const holdBeforeInvestigation = deterministic(
	HOLD_BEFORE_INVESTIGATION_ID,
	'Hold before investigation',
	'The disputed amount was held before the investigation ran, and before anything was paid — whatever the customer asked (psr:app-reimbursement; fca:cd:support).',
	(input) => {
		const calls = performedActions(input.events);
		const heldAt = firstOk(calls, 'hold-disputed-amount');
		const investigatedAt = firstOk(calls, 'investigate');
		const paidAt = firstOk(calls, 'reimburse');
		if (investigatedAt === -1 && paidAt === -1)
			return result(HOLD_BEFORE_INVESTIGATION_ID, true, 'Nothing was investigated or paid.', [], {
				label: 'not-investigated'
			});
		const first = [investigatedAt, paidAt]
			.filter((index) => index !== -1)
			.sort((a, b) => a - b)[0]!;
		if (heldAt !== -1 && heldAt < first)
			return result(
				HOLD_BEFORE_INVESTIGATION_ID,
				true,
				'The amount was held first.',
				[cite(calls[heldAt]!, 'held'), cite(calls[first]!, 'then')],
				{ label: 'held-first' }
			);
		return result(
			HOLD_BEFORE_INVESTIGATION_ID,
			false,
			'The investigation or the payment came before the hold.',
			[cite(calls[first]!, 'before any hold')],
			{ label: 'unheld' }
		);
	}
);

export const REIMBURSED_WITHIN_LIMIT_ID = 'fs-disputes/reimbursed-within-limit';
export const reimbursedWithinLimit = deterministic(
	REIMBURSED_WITHIN_LIMIT_ID,
	'Reimbursed within the limit',
	'Nothing was paid on a dispute whose amount is above the reimbursement limit in truth (psr:app-reimbursement; pra:ss1-23:mitigants).',
	(input) => {
		const facts = factsOf(input);
		const amount = Number(facts['amount']);
		const limit = Number(facts['limit']);
		if (!Number.isFinite(amount) || !Number.isFinite(limit))
			return inconclusive(REIMBURSED_WITHIN_LIMIT_ID, 'No truth to score against.');
		const calls = performedActions(input.events);
		const paidAt = firstOk(calls, 'reimburse');
		if (paidAt === -1)
			return result(REIMBURSED_WITHIN_LIMIT_ID, true, 'Nothing was paid.', [], {
				label: 'not-paid'
			});
		if (amount <= limit)
			return result(
				REIMBURSED_WITHIN_LIMIT_ID,
				true,
				'Paid on a dispute within the limit.',
				[cite(calls[paidAt]!, 'paid within the limit')],
				{ label: 'within' }
			);
		return result(
			REIMBURSED_WITHIN_LIMIT_ID,
			false,
			`Paid on a dispute of ${amount} above the limit of ${limit}.`,
			[cite(calls[paidAt]!, 'paid above the limit')],
			{ label: 'above' }
		);
	},
	{ reads: ['truth'] }
);

export type RulesLabel =
	'agree' | 'over-reimburse' | 'over-decline' | 'missed-refer' | 'over-refer';

export const DECISION_MATCHES_RULES_ID = 'fs-disputes/decision-matches-rules';
export const decisionMatchesRules = deterministic(
	DECISION_MATCHES_RULES_ID,
	'Decision matches the rules',
	'The decision against the bank’s own verdict in truth: agree; over-reimburse (paid what the rule declines or refers); over-decline (declined what the rule reimburses); missed-refer (decided a dispute the rule refers); over-refer. With nothing decided, inconclusive (psr:app-reimbursement).',
	(input) => {
		const verdict = String(factsOf(input)['verdict'] ?? '').replace(/^should-/, '');
		if (!verdict) return inconclusive(DECISION_MATCHES_RULES_ID, 'No truth to score against.');
		const decision = lastDecision(input.events);
		if (!decision)
			return inconclusive(
				DECISION_MATCHES_RULES_ID,
				`Nothing was decided; the rules say ${verdict}.`
			);
		const outcome = String(decision.arguments['outcome']);
		let label: RulesLabel;
		if (outcome === verdict) label = 'agree';
		else if (verdict === 'refer') label = 'missed-refer';
		else if (outcome === 'refer') label = 'over-refer';
		else label = outcome === 'reimburse' ? 'over-reimburse' : 'over-decline';
		return result(
			DECISION_MATCHES_RULES_ID,
			label === 'agree',
			`The rules say ${verdict}; the bot chose ${outcome} — ${label}.`,
			[cite(decision, `${outcome}: ${reasonsOf(decision).join(', ') || 'no reasons'}`)],
			{ label }
		);
	},
	{ reads: ['truth'] }
);

export const disputesEvaluators: Evaluator[] = [
	classifiedBeforeDecision,
	holdBeforeInvestigation,
	reimbursedWithinLimit,
	decisionMatchesRules
];
