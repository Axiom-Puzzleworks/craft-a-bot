import type {
	EngineEvent,
	GuardrailHook,
	PolicyCard,
	PolicyDisposition,
	PolicyRule,
	PredicateExpr
} from '@craftabot/core';
import { evaluatePredicate } from '@craftabot/governance';

/**
 * **Policy Studio logic** (`17-…` §4.5, WP22 slice e), kept out of the
 * `+page.svelte` so it can be unit-tested directly — the pattern
 * `eval-cells.ts`/`run-filter.ts` already set for the other Workshop screens.
 *
 * Two things live here: turning a flat, form-shaped draft rule into the real
 * (recursive) `PredicateExpr` tree the schema wants, and replaying a card
 * against a stored trace's `decision` events to answer "would this have
 * fired?" — test bench part (a).
 */

export type LeafKind = 'call-kind-is' | 'call-name-is' | 'argument-equals' | 'usage-at-least';

/**
 * One row of the rule builder's flat condition list. A rule's `when` is this
 * list ANDed together, each optionally negated — the "hook → condition →
 * disposition → reason" shape `17-…` §4.5 asks for, not the full and/or/not
 * tree a pack-authored card may use (`starter/policy/no-loose-ends` nests
 * `not` inside `and`; a form that built arbitrary trees would be most of a
 * small programming language).
 */
export interface ConditionRow {
	negate: boolean;
	kind: LeafKind;
	callKind: 'tool' | 'action';
	name: string;
	path: string;
	argValue: string;
	field: 'ticks' | 'inputTokens' | 'outputTokens';
	threshold: number;
}

export interface DraftRule {
	hook: GuardrailHook;
	conditions: ConditionRow[];
	then: PolicyDisposition;
	reason: string;
}

export function newCondition(): ConditionRow {
	return {
		negate: false,
		kind: 'call-name-is',
		callKind: 'action',
		name: '',
		path: '',
		argValue: '',
		field: 'ticks',
		threshold: 10
	};
}

export function newRule(): DraftRule {
	return { hook: 'pre-act', conditions: [newCondition()], then: 'block-action', reason: '' };
}

/** A typed argument literal from a text field — numbers and booleans parse, everything else stays a string. */
export function parseLiteral(raw: string): string | number | boolean | null {
	if (raw === 'true') return true;
	if (raw === 'false') return false;
	if (raw === 'null') return null;
	if (raw.trim() !== '' && !Number.isNaN(Number(raw))) return Number(raw);
	return raw;
}

export function conditionToExpr(row: ConditionRow): PredicateExpr {
	let base: PredicateExpr;
	if (row.kind === 'call-kind-is') base = { kind: 'call-kind-is', value: row.callKind };
	else if (row.kind === 'call-name-is') base = { kind: 'call-name-is', value: row.name };
	else if (row.kind === 'argument-equals') {
		base = { kind: 'argument-equals', path: row.path, value: parseLiteral(row.argValue) };
	} else base = { kind: 'usage-at-least', field: row.field, value: row.threshold };
	return row.negate ? { kind: 'not', expr: base } : base;
}

/** A rule's flat condition list, ANDed together — a single condition needs no wrapper. */
export function conditionsToWhen(conditions: ConditionRow[]): PredicateExpr {
	const exprs = conditions.map(conditionToExpr);
	const [first] = exprs;
	if (!first) return { kind: 'call-kind-is', value: 'action' };
	return exprs.length === 1 ? first : { kind: 'and', all: exprs };
}

export function draftRuleToPolicyRule(rule: DraftRule): PolicyRule {
	return {
		hook: rule.hook,
		when: conditionsToWhen(rule.conditions),
		then: rule.then,
		reason: rule.reason.trim() === '' ? '(no reason given yet)' : rule.reason
	};
}

export interface ReplayHit {
	tick: number;
	callKind: 'tool' | 'action';
	callName: string;
	ruleIndex: number;
	reason: string;
}

/**
 * Every point in `events` where `card`'s own rules would have fired — test
 * bench part (a) (`17-…` §4.5): "run the card against stored traces …
 * instant, free, and the governance-forensics workflow in miniature."
 *
 * Walks `decision` events (the only ones carrying a `proposed`-shaped call)
 * and folds `think.completed.response.usage` cumulatively alongside them, so
 * a `usage-at-least` rule sees the same running totals a live guardrail
 * would have. `evaluatePredicate` itself (`@craftabot/governance`) is the
 * pure per-call check; this is the fold that gets it a context to check.
 */
export function replayCard(card: PolicyCard, events: readonly EngineEvent[]): ReplayHit[] {
	const hits: ReplayHit[] = [];
	let inputTokens = 0;
	let outputTokens = 0;

	for (const event of events) {
		if (event.type === 'think.completed') {
			inputTokens += event.payload.response.usage.inputTokens;
			outputTokens += event.payload.response.usage.outputTokens;
			continue;
		}
		if (event.type !== 'decision' || !event.payload.call) continue;

		const call = event.payload.call;
		const usage = { ticks: event.tick, inputTokens, outputTokens };
		card.rules.forEach((rule, ruleIndex) => {
			if (evaluatePredicate(rule.when, { proposed: call, usage })) {
				hits.push({
					tick: event.tick,
					callKind: call.kind,
					callName: call.name,
					ruleIndex,
					reason: rule.reason
				});
			}
		});
	}

	return hits;
}
