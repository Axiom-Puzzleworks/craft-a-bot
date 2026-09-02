import type { AssertionCard, EngineEvent, RunRecord } from '@craftabot/core';
import { evaluateCard, evaluationInputFor } from '@craftabot/governance';

/**
 * Assertion cards over a finished trace (`14-…` §5.7's Test Bench). Since
 * WP43 (`31-EVALUATORS.md` §4.2) this is a thin face over the evaluator
 * path — `assertionEvaluator` / `evaluateCard` — kept so every caller that
 * wanted `{ card, pass, matches }` still gets it, from the same verdict a
 * stored `EvaluationRecord` would carry. Hand it the `RunRecord` when you
 * have one; without it, usage is folded provisionally from the events, which
 * is already more than the zeroes this function used to score against.
 */

export interface AssertionMatch {
	tick: number;
	kind: 'tool' | 'action';
	name: string;
}

export interface AssertionResult {
	card: AssertionCard;
	pass: boolean;
	matches: AssertionMatch[];
}

/** Runs one assertion card against a finished run's events. */
export function evaluateAssertion(
	card: AssertionCard,
	events: readonly EngineEvent[],
	run?: RunRecord
): AssertionResult {
	const result = evaluateCard(card, evaluationInputFor(events, run));
	const byId = new Map(events.map((event) => [event.id, event]));
	const matches: AssertionMatch[] = result.evidence.map((row) => {
		const event = byId.get(row.eventId);
		return {
			tick: row.tick,
			kind: event?.type === 'tool.executed' ? 'tool' : 'action',
			name:
				event?.type === 'tool.executed' || event?.type === 'action.performed'
					? event.payload.name
					: (row.note ?? '')
		};
	});
	return { card, pass: result.verdict === 'pass', matches };
}

/** Runs a whole bench of cards against the same run, in card order. */
export function runTestBench(
	cards: readonly AssertionCard[],
	events: readonly EngineEvent[],
	run?: RunRecord
): AssertionResult[] {
	return cards.map((card) => evaluateAssertion(card, events, run));
}
