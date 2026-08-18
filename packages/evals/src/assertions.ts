import type { AssertionCard, EngineEvent } from '@craftabot/core';
import { evaluatePredicate } from '@craftabot/governance';

/**
 * **The Test Bench brick's evaluator** (`14-…` §5.7, WP27): "Assertion cards
 * run against traces … feeds the eval harness." Lives beside `scoreRun`
 * rather than in a new package for the same reason `scoreRun` lives here —
 * "computed from a trace and nothing else" is this package's whole
 * discipline (see the header comment on `metrics.ts`), and an assertion is
 * exactly that: a pure fold over a finished run's `EngineEvent[]`.
 *
 * Reuses WP22's `PredicateExpr`/`evaluatePredicate` rather than inventing a
 * second condition language — a policy card asks "would this call be allowed
 * right now?" mid-run; an assertion card asks the same shape of question
 * after the fact: "did any call in this finished run match?". Only
 * `action.performed` and `tool.executed` are examined — a call a guardrail
 * blocked never ran, so it cannot be what "the bot touched the snack" means.
 *
 * `PredicateEvalContext.usage` has no natural per-call reading outside a live
 * guardrail check, so every event is scored against zeroed usage. No shipped
 * card uses `usage-at-least`, and a card that tried to would silently never
 * fire rather than throw — recorded here rather than hidden, so whoever
 * writes the first usage-based card knows to extend this instead of being
 * surprised by it.
 */

const ZERO_USAGE = { ticks: 0, inputTokens: 0, outputTokens: 0 };

/** One call the assertion looked at, and whether it matched. */
export interface AssertionMatch {
	tick: number;
	kind: 'tool' | 'action';
	name: string;
}

export interface AssertionResult {
	card: AssertionCard;
	pass: boolean;
	/** Every call the predicate matched, in run order — the drill-down list. */
	matches: AssertionMatch[];
}

function completedCalls(
	events: readonly EngineEvent[]
): { tick: number; kind: 'tool' | 'action'; name: string; arguments: unknown }[] {
	const calls: { tick: number; kind: 'tool' | 'action'; name: string; arguments: unknown }[] = [];
	for (const event of events) {
		if (event.type === 'tool.executed') {
			calls.push({
				tick: event.tick,
				kind: 'tool',
				name: event.payload.name,
				arguments: event.payload.arguments
			});
		} else if (event.type === 'action.performed') {
			calls.push({
				tick: event.tick,
				kind: 'action',
				name: event.payload.name,
				arguments: event.payload.arguments
			});
		}
	}
	return calls;
}

/** Runs one assertion card against a finished run's events. */
export function evaluateAssertion(
	card: AssertionCard,
	events: readonly EngineEvent[]
): AssertionResult {
	const matches: AssertionMatch[] = [];
	for (const call of completedCalls(events)) {
		const fires = evaluatePredicate(card.when, {
			proposed: { kind: call.kind, name: call.name, arguments: call.arguments },
			usage: ZERO_USAGE
		});
		if (fires) matches.push({ tick: call.tick, kind: call.kind, name: call.name });
	}

	const pass = card.quantifier === 'never' ? matches.length === 0 : matches.length > 0;
	return { card, pass, matches };
}

/** Runs a whole bench of cards against the same run, in card order. */
export function runTestBench(
	cards: readonly AssertionCard[],
	events: readonly EngineEvent[]
): AssertionResult[] {
	return cards.map((card) => evaluateAssertion(card, events));
}
