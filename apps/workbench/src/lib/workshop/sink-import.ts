import { parseEngineEvent, type EngineEvent, type RunRecord } from '@craftabot/core';
import { provisionalRun } from '@craftabot/governance';

/**
 * **The file sink's lines as a run** (WP68, `57-HARNESS-AT-SCALE.md` §4.5;
 * the harness half of live trailing `37-…` §7 left recorded): what
 * `craftabot run --sink telemetry/file` appends as the run goes — one
 * event per line, and, from `craftabot export`, a `{ kind: 'run', record }`
 * line first — read back into a record and its events. A file with no
 * record line is a run still being written: the record is provisional,
 * folded from `run.started` and whatever came after, and says
 * `IN_PROGRESS` until a `run.finished` line arrives. Re-importing re-reads.
 * A group's export (`{ kind: 'group' }`) is a bundle's business, not this.
 */
export interface SinkImport {
	run: RunRecord;
	events: EngineEvent[];
	/** No `run.finished` yet: the harness may still be writing. */
	inProgress: boolean;
	/** How many lines were neither an event nor a record, and were skipped. */
	skipped: number;
}

/** Whether a file is the sink's JSONL rather than a trace file: its first line is one object, not a `format` field. */
export function looksLikeSinkLines(text: string): boolean {
	const first = text.split('\n').find((line) => line.trim() !== '');
	if (first === undefined) return false;
	try {
		const parsed = JSON.parse(first) as { format?: unknown; kind?: unknown; type?: unknown };
		return (
			parsed.format !== 'craftabot-trace' &&
			(parsed.kind !== undefined || parsed.type !== undefined)
		);
	} catch {
		return false;
	}
}

export function parseSinkLines(text: string): SinkImport {
	let record: RunRecord | undefined;
	const events: EngineEvent[] = [];
	let skipped = 0;
	for (const line of text.split('\n')) {
		if (line.trim() === '') continue;
		let raw: unknown;
		try {
			raw = JSON.parse(line);
		} catch {
			skipped += 1;
			continue;
		}
		const tagged = raw as { kind?: unknown; record?: unknown };
		if (tagged.kind === 'group') {
			throw new Error(
				'This is a group episode’s export — import its bundle from the Audit Centre instead.'
			);
		}
		if (tagged.kind === 'run' && tagged.record !== undefined) {
			record = tagged.record as RunRecord;
			continue;
		}
		try {
			events.push(parseEngineEvent(raw));
		} catch {
			skipped += 1;
		}
	}
	if (events.length === 0) throw new Error('No events in that file.');
	const finished = events.some((event) => event.type === 'run.finished');
	const run = record ?? provisionalRun(events);
	return {
		run: finished ? run : { ...run, outcome: 'IN_PROGRESS' },
		events,
		inProgress: !finished,
		skipped
	};
}
