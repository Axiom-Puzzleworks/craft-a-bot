import type { EngineEvent } from '@craftabot/core';
import { isFailure } from '@craftabot/governance/reports';
import { laneOf, type TraceLane } from '$lib/trace-style.js';

/**
 * "What went wrong" moved to `@craftabot/governance/reports` in WP36 stage B —
 * the incident log and the safety case derive from it, and a headless host
 * has to answer the same question. Still exported from here for one release.
 */
export { isFailure };

/**
 * **The step timeline's spine** (`17-…` §3, centre region).
 *
 * The trace as tick-grouped spans, filtered. Pure, and separate from the
 * component, because the interesting parts are all decisions about *what counts*
 * — which is a question with right and wrong answers, not a rendering detail.
 *
 * Note what this does **not** do: it never re-orders. The stored order is the
 * order things happened, and a forensic timeline that sorted its own rows would
 * be answering a different question from the one being asked.
 */

export interface TimelineRow {
	event: EngineEvent;
	/** Index into the *unfiltered* event list — the stable identity of a row. */
	index: number;
	lane: TraceLane;
	/** Whether this row is something that went wrong. */
	failed: boolean;
}

export interface TimelineTick {
	tick: number;
	rows: TimelineRow[];
	/** Tokens attributable to this turn, for the gutter. */
	tokensIn: number;
	tokensOut: number;
}

export interface TimelineFilter {
	/** Lanes to show. Empty means all of them — "no filter", not "nothing". */
	lanes?: TraceLane[];
	text?: string;
	onlyFailures?: boolean;
	onlyGuardrails?: boolean;
}

export function buildTimeline(
	events: readonly EngineEvent[],
	filter: TimelineFilter = {}
): TimelineTick[] {
	const needle = filter.text?.trim().toLowerCase();
	const lanes = filter.lanes ?? [];
	const ticks = new Map<number, TimelineTick>();

	events.forEach((event, index) => {
		const lane = laneOf(event.type);
		const failed = isFailure(event);

		if (lanes.length > 0 && !lanes.includes(lane)) return;
		if (filter.onlyFailures === true && !failed) return;
		if (filter.onlyGuardrails === true && lane !== 'guardrail') return;
		if (needle !== undefined && needle !== '' && !matches(event, needle)) return;

		const bucket = ticks.get(event.tick) ?? {
			tick: event.tick,
			rows: [],
			tokensIn: 0,
			tokensOut: 0
		};
		bucket.rows.push({ event, index, lane, failed });
		if (event.type === 'think.completed') {
			bucket.tokensIn += event.payload.response.usage.inputTokens;
			bucket.tokensOut += event.payload.response.usage.outputTokens;
		}
		ticks.set(event.tick, bucket);
	});

	return [...ticks.values()];
}

/**
 * Free text over the type and the payload.
 *
 * Searching the serialised payload rather than a curated set of fields: the
 * question "where does this item id appear" has no answer if the search only
 * looks at labels, and that is exactly the question an incident starts with.
 */
function matches(event: EngineEvent, needle: string): boolean {
	if (event.type.toLowerCase().includes(needle)) return true;
	return JSON.stringify(event.payload).toLowerCase().includes(needle);
}

/** Every lane present in a run, in the order the lanes are defined. */
export function lanesPresent(events: readonly EngineEvent[]): TraceLane[] {
	const ORDER: TraceLane[] = [
		'run',
		'tick',
		'sense',
		'think',
		'tool',
		'action',
		'memory',
		'guardrail',
		'error'
	];
	const present = new Set(events.map((event) => laneOf(event.type)));
	return ORDER.filter((lane) => present.has(lane));
}
