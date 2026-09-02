import type {
	AssertionCard,
	EngineEvent,
	EvaluationEvidence,
	EvaluationInput,
	EvaluationResult,
	Evaluator,
	RunRecord
} from '@craftabot/core';
import { renderCall } from './hosted/selectors.js';
import { evaluatePredicate } from './policy-compiler.js';

/**
 * **Assertion cards as evaluators** (`31-EVALUATORS.md` §4.2, WP43 stage B) — in
 * governance beside the predicate evaluator it rests on, so a pack can use
 * it without depending on `@craftabot/evals`.
 * One adapter turns any `AssertionCard` into a `deterministic` `Evaluator`
 * with no change to the card's shape — and, because the input carries the
 * `RunRecord`, the `usage-at-least` leaf finally reads the run's own usage
 * instead of the zeroes `evaluateAssertion` used to hand it.
 *
 * The usage is the *run's* totals, applied to every completed call: a card
 * that asks "did the bot spend at least N tokens" is a question about the
 * run, and the per-call reading nothing outside a live guardrail check can
 * give would be a guess.
 */

export interface CompletedCall {
	eventId: string;
	tick: number;
	kind: 'tool' | 'action';
	name: string;
	arguments: unknown;
}

export function completedCalls(events: readonly EngineEvent[]): CompletedCall[] {
	const calls: CompletedCall[] = [];
	for (const event of events) {
		if (event.type === 'tool.executed') {
			calls.push({
				eventId: event.id,
				tick: event.tick,
				kind: 'tool',
				name: event.payload.name,
				arguments: event.payload.arguments
			});
		} else if (event.type === 'action.performed') {
			calls.push({
				eventId: event.id,
				tick: event.tick,
				kind: 'action',
				name: event.payload.name,
				arguments: event.payload.arguments
			});
		}
	}
	return calls;
}

/**
 * A `RunRecord` folded from a trace that was never stored as one — what the
 * Test Bench's old path and the campaign runner had in hand. Usage and ticks
 * come from `run.finished` and the token counts on `think.completed`, so a
 * usage card reads something real even here.
 */
export function provisionalRun(events: readonly EngineEvent[]): RunRecord {
	const started = events.find((event) => event.type === 'run.started');
	const finished = [...events].reverse().find((event) => event.type === 'run.finished');
	let inputTokens = 0;
	let outputTokens = 0;
	let ticks = 0;
	for (const event of events) {
		if (event.type === 'think.completed') {
			inputTokens += event.payload.response.usage.inputTokens;
			outputTokens += event.payload.response.usage.outputTokens;
		}
		if (event.type === 'tick.started') ticks += 1;
	}
	const startedPayload = started?.type === 'run.started' ? started.payload : undefined;
	return {
		id: started?.runId ?? 'provisional',
		agentId: started?.agentId ?? 'provisional',
		agentName: 'provisional',
		goalCardId: '',
		specSnapshot: {
			id: started?.agentId ?? '00000000-0000-4000-8000-000000000000',
			name: 'provisional',
			schemaVersion: 2,
			identity: { displayName: 'provisional', boxArtSeed: 'provisional' },
			goalCardId: '',
			bricks: [],
			createdAt: started?.timestamp ?? '1970-01-01T00:00:00.000Z',
			updatedAt: started?.timestamp ?? '1970-01-01T00:00:00.000Z'
		},
		packVersions: {},
		mode: startedPayload?.mode ?? 'step',
		outcome: finished?.type === 'run.finished' ? finished.payload.outcome : 'IN_PROGRESS',
		ticks,
		usage: { inputTokens, outputTokens },
		budgets: startedPayload?.budgets ?? { maxTicks: 30, maxTokens: 1, requestTimeoutMs: 1 },
		providerId: startedPayload?.providerId ?? 'unknown',
		wireModel: startedPayload?.wireModel ?? 'unknown',
		pinned: false,
		startedAt: started?.timestamp ?? '1970-01-01T00:00:00.000Z',
		...(finished ? { finishedAt: finished.timestamp } : {}),
		schemaVersion: 2
	};
}

/** The input an evaluator takes, from what a caller has: a stored run and its events, or the events alone. */
export function evaluationInputFor(
	events: readonly EngineEvent[],
	run?: RunRecord,
	/** The scenario the run was part of (WP44) — opaque here, a `ScenarioDefinition` or a campaign's scenario to whoever knows. */
	scenario?: unknown
): EvaluationInput {
	return {
		run: run ?? provisionalRun(events),
		events,
		...(scenario !== undefined ? { scenario } : {})
	};
}

export function assertionEvaluator(card: AssertionCard): Evaluator {
	return {
		id: card.id,
		name: card.title,
		description: card.description ?? `${card.quantifier} — an assertion card`,
		kind: 'deterministic',
		evaluate: (input) => Promise.resolve(evaluateCard(card, input))
	};
}

/** The synchronous heart of the adapter, shared with `evaluateAssertion`. */
export function evaluateCard(card: AssertionCard, input: EvaluationInput): EvaluationResult {
	const usage = {
		ticks: input.run.ticks,
		inputTokens: input.run.usage.inputTokens,
		outputTokens: input.run.usage.outputTokens
	};
	const evidence: EvaluationEvidence[] = [];
	for (const call of completedCalls(input.events)) {
		const fires = evaluatePredicate(card.when, {
			proposed: { kind: call.kind, name: call.name, arguments: call.arguments },
			usage
		});
		if (fires)
			evidence.push({
				eventId: call.eventId,
				tick: call.tick,
				note: renderCall(call.name, call.arguments)
			});
	}
	const pass = card.quantifier === 'never' ? evidence.length === 0 : evidence.length > 0;
	return {
		evaluatorId: card.id,
		verdict: pass ? 'pass' : 'fail',
		score: pass ? 1 : 0,
		label: evidence.length > 0 ? 'matched' : 'clean',
		explanation:
			card.quantifier === 'never'
				? evidence.length === 0
					? `"${card.title}" — nothing in the trace matched.`
					: `"${card.title}" — ${evidence.length} call${evidence.length === 1 ? '' : 's'} matched.`
				: evidence.length > 0
					? `"${card.title}" — matched ${evidence.length} time${evidence.length === 1 ? '' : 's'}.`
					: `"${card.title}" — never matched.`,
		evidence
	};
}
