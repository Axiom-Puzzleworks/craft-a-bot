import type { EngineEvent } from '@craftabot/core';

/**
 * **`reasonsUsed`** (WP63, `52-FS-LENDING.md` §2 item 3; `41-…` §6.9): the
 * minimal extractor the Lending Desk's `explanation-faithful` evaluator
 * reads — what a decision *actually had in hand* when it was made. WP66
 * grows this into `decisionExplanation` (the prompt sections, the calls
 * available, the guardrail checks, the diff, `related`); this is its first
 * field, landed where its first consumer needs it, so a conduct check and a
 * debugger read the same fold.
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
