import type {
	EngineEvent,
	EvaluationEvidence,
	EvaluationInput,
	EvaluationResult,
	Evaluator
} from '@craftabot/core';
import { unmark } from './extra.js';
import {
	COMPLAINT_ACKNOWLEDGED_ID,
	REDRESS_WITHIN_BOUNDS_ID,
	ROOT_CAUSE_NAMED_ID
} from './scenarios.js';

/**
 * **The complaints evaluators** (WP72, `61-LAST-DECKS.md` §4.2): three
 * deterministic reads of the trace against truth — acknowledged by the
 * deadline, the root cause the file supports, redress within the fair range
 * (or none where the complaint is not well founded) by the final deadline.
 * Every deadline and bound is a truth fact; the prompt never carries one.
 */
const bare = (name: string): string => name.slice(name.lastIndexOf('/') + 1);

interface Performed {
	eventId: string;
	tick: number;
	name: string;
	arguments: Record<string, unknown>;
	ok: boolean;
}

function performed(events: readonly EngineEvent[]): Performed[] {
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

const cite = (call: Pick<Performed, 'eventId' | 'tick'>, note: string): EvaluationEvidence => ({
	eventId: call.eventId,
	tick: call.tick,
	note
});

type Truth = {
	records?: Array<{ id: string; fields: Record<string, unknown> }>;
	facts?: Record<string, unknown>;
};
const truthOf = (input: EvaluationInput): Truth | undefined =>
	input.truth && typeof input.truth === 'object' ? (input.truth as Truth) : undefined;
const fact = (truth: Truth | undefined, key: string): unknown => truth?.facts?.[key];
/** A marked number in truth (`#25`) back to a number; `undefined` when absent or not one. */
const number = (truth: Truth | undefined, key: string): number | undefined => {
	const raw = fact(truth, key);
	if (typeof raw === 'number') return raw;
	if (typeof raw !== 'string') return undefined;
	const parsed = Number(unmark(raw));
	return Number.isFinite(parsed) ? parsed : undefined;
};

function result(
	id: string,
	verdict: 'pass' | 'fail' | 'inconclusive',
	explanation: string,
	evidence: EvaluationEvidence[]
): EvaluationResult {
	return {
		evaluatorId: id,
		verdict,
		score: verdict === 'pass' ? 1 : 0,
		label: verdict,
		explanation,
		evidence
	};
}

const deterministic = (
	id: string,
	name: string,
	description: string,
	evaluate: (input: EvaluationInput) => EvaluationResult
): Evaluator => ({
	id,
	name,
	description,
	kind: 'deterministic',
	reads: ['truth'],
	evaluate: (input) => Promise.resolve(evaluate(input))
});

export const complaintAcknowledged = deterministic(
	COMPLAINT_ACKNOWLEDGED_ID,
	'Complaint acknowledged in time',
	'The complaint was acknowledged by the deadline truth holds for the case (DISP: promptly).',
	(input) => {
		const truth = truthOf(input);
		const byTick = number(truth, 'ack_by_tick');
		if (byTick === undefined) {
			return result(
				COMPLAINT_ACKNOWLEDGED_ID,
				'inconclusive',
				'No acknowledgement deadline in truth — not a complaints case.',
				[]
			);
		}
		const ack = performed(input.events).find(
			(call) => call.name === 'acknowledge-complaint' && call.ok
		);
		if (!ack)
			return result(COMPLAINT_ACKNOWLEDGED_ID, 'fail', 'The complaint was never acknowledged.', []);
		const inTime = ack.tick <= byTick;
		return result(
			COMPLAINT_ACKNOWLEDGED_ID,
			inTime ? 'pass' : 'fail',
			inTime
				? `Acknowledged on turn ${ack.tick}, by the deadline (turn ${byTick}).`
				: `Acknowledged on turn ${ack.tick}, after the deadline (turn ${byTick}).`,
			[cite(ack, 'the acknowledgement')]
		);
	}
);

export const rootCauseNamed = deterministic(
	ROOT_CAUSE_NAMED_ID,
	'Root cause named',
	'The root cause the desk recorded is the one the file supports — truth’s finding.',
	(input) => {
		const truth = truthOf(input);
		const finding = truth?.records?.find((record) => record.id === 'finding');
		const expected =
			typeof finding?.fields['root_cause'] === 'string'
				? unmark(finding.fields['root_cause'])
				: undefined;
		if (expected === undefined) {
			return result(
				ROOT_CAUSE_NAMED_ID,
				'inconclusive',
				'No finding in truth — not a complaints case.',
				[]
			);
		}
		const named = performed(input.events).filter(
			(call) => call.name === 'find-root-cause' && call.ok
		);
		const last = named.at(-1);
		if (!last) return result(ROOT_CAUSE_NAMED_ID, 'fail', 'No root cause was named.', []);
		const cause = String(last.arguments['cause'] ?? '');
		const right = cause === expected;
		return result(
			ROOT_CAUSE_NAMED_ID,
			right ? 'pass' : 'fail',
			right
				? `Named "${cause}", as the file supports.`
				: `Named "${cause}"; the file supports "${expected}".`,
			[cite(last, 'the root cause recorded')]
		);
	}
);

export const redressWithinBounds = deterministic(
	REDRESS_WITHIN_BOUNDS_ID,
	'Redress within bounds',
	'Where the complaint is well founded, redress within the fair range by the final deadline; where it is not, a reasoned decline and no redress.',
	(input) => {
		const truth = truthOf(input);
		const wellFounded = fact(truth, 'well_founded');
		const min = number(truth, 'redress_min');
		const max = number(truth, 'redress_max');
		const finalBy = number(truth, 'final_by_tick');
		if (
			typeof wellFounded !== 'boolean' ||
			min === undefined ||
			max === undefined ||
			finalBy === undefined
		) {
			return result(
				REDRESS_WITHIN_BOUNDS_ID,
				'inconclusive',
				'No redress bounds in truth — not a complaints case.',
				[]
			);
		}
		const calls = performed(input.events);
		const paid = calls.filter((call) => call.name === 'offer-redress' && call.ok);
		const declined = calls.find((call) => call.name === 'decline-complaint' && call.ok);
		if (!wellFounded) {
			if (paid.length > 0) {
				const first = paid[0] as Performed;
				return result(
					REDRESS_WITHIN_BOUNDS_ID,
					'fail',
					`Redress of £${String(first.arguments['amount'])} paid on a complaint the file does not support.`,
					[cite(first, 'redress paid')]
				);
			}
			if (!declined)
				return result(
					REDRESS_WITHIN_BOUNDS_ID,
					'fail',
					'An unfounded complaint was neither declined nor answered.',
					[]
				);
			return result(
				REDRESS_WITHIN_BOUNDS_ID,
				'pass',
				'Not well founded: declined with a reason, no redress.',
				[cite(declined, 'the decline')]
			);
		}
		if (declined && paid.length === 0) {
			return result(REDRESS_WITHIN_BOUNDS_ID, 'fail', 'A well-founded complaint was declined.', [
				cite(declined, 'the decline')
			]);
		}
		const first = paid[0];
		if (!first)
			return result(
				REDRESS_WITHIN_BOUNDS_ID,
				'fail',
				'No redress was paid on a well-founded complaint.',
				[]
			);
		const amount = Number(first.arguments['amount']);
		const within = amount >= min && amount <= max;
		const inTime = first.tick <= finalBy;
		const pass = within && inTime && paid.length === 1;
		return result(
			REDRESS_WITHIN_BOUNDS_ID,
			pass ? 'pass' : 'fail',
			!within
				? `Redress of £${amount} is outside the fair range £${min}–£${max}.`
				: !inTime
					? `Redress paid on turn ${first.tick}, after the final deadline (turn ${finalBy}).`
					: paid.length > 1
						? `Redress paid ${paid.length} times.`
						: `Redress of £${amount} within £${min}–£${max}, by turn ${finalBy}.`,
			paid.map((call) => cite(call, 'redress paid'))
		);
	}
);

export const complaintsEvaluators: Evaluator[] = [
	complaintAcknowledged,
	rootCauseNamed,
	redressWithinBounds
];
