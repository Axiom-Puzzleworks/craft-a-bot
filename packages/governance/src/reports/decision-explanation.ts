import type { EngineEvent } from '@craftabot/core';

/**
 * **`reasonsUsed`** (WP63, `52-FS-LENDING.md` §2 item 3; `41-…` §6.9): the
 * minimal extractor the Lending Desk's `explanation-faithful` evaluator
 * reads — what a decision *actually had in hand* when it was made. WP66
 * grew it into `decisionExplanation` below; this is its `reasonsUsed`
 * field, kept as its own export so the conduct check and the debugger read
 * the same fold.
 *
 * A pure fold over the trace: the events strictly before the decision's
 * event. `actions` are the performed actions and executed tools by name with
 * their arguments; `records` are the ids a desk's snapshots had revealed by
 * then (the `records` array of any `world.changed` state — a grid world has
 * none and yields an empty list); `text` is the observation the decision's
 * tick saw. `found` is false when no event carries the id, and everything
 * else is empty.
 */
export interface ReasonsUsed {
	found: boolean;
	actions: Array<{ name: string; arguments: unknown }>;
	records: string[];
	text: string;
}

const recordIdsOf = (state: unknown): string[] => {
	const records = (state as { records?: unknown } | undefined)?.records;
	if (!Array.isArray(records)) return [];
	return records
		.map((record) => (record as { id?: unknown } | undefined)?.id)
		.filter((id): id is string => typeof id === 'string');
};

/** The actions, records and observation a decision had in hand — the events strictly before `decisionEventId`. */
export function reasonsUsed(events: readonly EngineEvent[], decisionEventId: string): ReasonsUsed {
	const at = events.findIndex((event) => event.id === decisionEventId);
	if (at === -1) return { found: false, actions: [], records: [], text: '' };
	const actions: ReasonsUsed['actions'] = [];
	const records = new Set<string>();
	let text = '';
	for (const event of events.slice(0, at)) {
		if (event.type === 'action.performed' || event.type === 'tool.executed') {
			actions.push({ name: event.payload.name, arguments: event.payload.arguments });
		} else if (event.type === 'world.changed') {
			for (const id of recordIdsOf(event.payload.state)) records.add(id);
		} else if (event.type === 'sense') {
			text = event.payload.observation.text;
		}
	}
	return { found: true, actions, records: [...records], text };
}

/**
 * **`decisionExplanation`** (WP66, `54-FORK-EXPLAIN.md` §4.4; `41-…` §6.9):
 * one decision, explained from the trace alone — what the bot saw, what its
 * prompt carried, what it was offered, what it chose, which rules checked
 * it and what each said, what a person said, what happened and what
 * changed, what it had in hand (`reasonsUsed`), and `related`: the ids of
 * every row of the trace that is this decision's cause or effect, for a
 * timeline to light. v1. The inspector renders it; the assurance pack
 * quotes it for incidents; nothing is authored into it.
 */
export interface DecisionExplanation {
	version: 1;
	decisionEventId: string;
	runId: string;
	tick: number;
	source: 'brain' | 'reflex';
	observation: { channels: string[]; text: string } | undefined;
	/** The composed prompt's shape — one entry per message, its role and length — and the estimate the loop made. */
	prompt: { sections: Array<{ role: string; chars: number }>; estimatedTokens: number } | undefined;
	/** The calls the build offered the model, when the caller can name them (the trace does not carry them). */
	callsAvailable: string[];
	decision: {
		thought: string;
		call: { kind: 'tool' | 'action'; name: string; arguments: unknown } | null;
	};
	/** Every check between the decision and what followed it, in order. */
	checks: Array<{
		guardrailId: string;
		hook: string;
		verdict: 'allow' | 'block' | 'stop' | 'pause';
		reason?: string;
		policyCardId?: string;
	}>;
	approval: { requested: boolean; approved?: boolean; reason?: string } | undefined;
	result:
		| {
				kind: 'tool' | 'action';
				name: string;
				ok: boolean;
				narration?: string;
				output?: string;
				stateDiff?: unknown;
		  }
		| undefined;
	reasonsUsed: ReasonsUsed;
	related: string[];
}

/** What the caller knows that the trace does not. */
export interface DecisionExplanationOptions {
	/** The tool and action ids the build offered — from the run record's spec, since the trace carries the prompt but not the tool list. */
	callsAvailable?: readonly string[];
}

/** The explanation of the decision with this event id, or `undefined` when no `decision` row carries it. */
export function decisionExplanation(
	events: readonly EngineEvent[],
	decisionEventId: string,
	options: DecisionExplanationOptions = {}
): DecisionExplanation | undefined {
	const at = events.findIndex((event) => event.id === decisionEventId);
	const decision = events[at];
	if (at === -1 || !decision || decision.type !== 'decision') return undefined;
	const tick = decision.tick;
	const before = events.slice(0, at).filter((event) => event.tick === tick);
	const after: EngineEvent[] = [];
	for (const event of events.slice(at + 1)) {
		if (event.tick !== tick) break;
		after.push(event);
		// The world's change is the last effect a decision has; what follows is the tick's book-keeping.
		if (event.type === 'world.changed') break;
	}
	const sense = before.find((event) => event.type === 'sense');
	const prompt = before.find((event) => event.type === 'prompt.composed');
	const think = before.find((event) => event.type === 'think.completed');
	const related: string[] = [];
	if (sense) related.push(sense.id);
	if (prompt) related.push(prompt.id);
	if (think) related.push(think.id);
	related.push(decision.id);

	const checks: DecisionExplanation['checks'] = [];
	let approval: DecisionExplanation['approval'];
	let result: DecisionExplanation['result'];
	for (const event of after) {
		if (event.type === 'guardrail.checked') {
			const verdict = event.payload.verdict;
			checks.push({
				guardrailId: event.payload.guardrailId,
				hook: event.payload.hook,
				verdict:
					'pause' in verdict
						? 'pause'
						: verdict.allow
							? 'allow'
							: verdict.disposition === 'stop-run'
								? 'stop'
								: 'block',
				...('reason' in verdict && verdict.reason ? { reason: verdict.reason } : {}),
				...(event.payload.policyCardId ? { policyCardId: event.payload.policyCardId } : {})
			});
			related.push(event.id);
		} else if (event.type === 'guardrail.tripped' || event.type === 'guardrail.external') {
			related.push(event.id);
		} else if (event.type === 'approval.requested') {
			approval = { requested: true, reason: event.payload.reason };
			related.push(event.id);
		} else if (event.type === 'approval.resolved') {
			approval = { ...(approval ?? { requested: true }), approved: event.payload.approved };
			related.push(event.id);
		} else if (event.type === 'action.performed') {
			result = {
				kind: 'action',
				name: event.payload.name,
				ok: event.payload.result.ok,
				narration: event.payload.result.narration,
				...(event.payload.result.stateDiff !== undefined
					? { stateDiff: event.payload.result.stateDiff }
					: {})
			};
			related.push(event.id);
		} else if (event.type === 'tool.executed') {
			result = {
				kind: 'tool',
				name: event.payload.name,
				// A tool's failure with a kind is on the trace as an error in the same tick; a plain failure is not — the output says.
				ok: !after.some((row) => row.type === 'error' && row.tick === tick),
				output: String(event.payload.result)
			};
			related.push(event.id);
		} else if (event.type === 'world.changed') {
			related.push(event.id);
		}
	}

	return {
		version: 1,
		decisionEventId: decision.id,
		runId: decision.runId,
		tick,
		source: decision.payload.source ?? 'brain',
		observation:
			sense?.type === 'sense'
				? { channels: [...sense.payload.channels], text: sense.payload.observation.text }
				: undefined,
		prompt:
			prompt?.type === 'prompt.composed'
				? {
						sections: prompt.payload.messages.map((message) => ({
							role: message.role,
							chars: message.content.length
						})),
						estimatedTokens: prompt.payload.estimatedTokens
					}
				: undefined,
		callsAvailable: [...(options.callsAvailable ?? [])],
		decision: { thought: decision.payload.thought, call: decision.payload.call },
		checks,
		approval,
		result,
		reasonsUsed: reasonsUsed(events, decision.id),
		related
	};
}

/** Every decision of the ticks named, explained — what the assurance pack quotes for an incident's findings. */
export function explanationsForTicks(
	events: readonly EngineEvent[],
	ticks: readonly number[],
	options: DecisionExplanationOptions = {}
): DecisionExplanation[] {
	const wanted = new Set(ticks);
	return events
		.filter((event) => event.type === 'decision' && wanted.has(event.tick))
		.map((event) => decisionExplanation(events, event.id, options))
		.filter((entry): entry is DecisionExplanation => entry !== undefined);
}
