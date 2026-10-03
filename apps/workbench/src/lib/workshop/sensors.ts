import type { Storage } from '@craftabot/core';
import {
	SENSOR_READERS,
	sensorFindings,
	type SensorRow,
	type SensorSource
} from '@craftabot/governance/reports';

/**
 * **The Sensor Inventory's page helpers** (WP159, `112-REAL-ENOUGH-PLAN.md`
 * §5): the filter, each row in words, and the count of what this browser's
 * stored runs carry. Every figure is the fold's (`sensorInventory`); this
 * module only words and filters it.
 */

/** The most recent runs read for the *seen here* column: the page is a glance, not a scan of every stored trace. */
export const SEEN_RUN_LIMIT = 100;

export interface SensorFilter {
	source?: SensorSource;
	/** `folded` or `listed`: whether some fold reads the event, or only the trace list does. */
	reading?: 'folded' | 'listed';
	/** Free text over the type and the readers' labels. */
	q?: string;
}

export function filterSensors(rows: readonly SensorRow[], filter: SensorFilter): SensorRow[] {
	const q = filter.q?.toLowerCase();
	return rows.filter((row) => {
		if (filter.source && row.source !== filter.source) return false;
		if (filter.reading === 'folded' && !row.folded) return false;
		if (filter.reading === 'listed' && row.folded) return false;
		if (!q) return true;
		const text = [row.type, ...row.readBy.map((id) => SENSOR_READERS[id].label)]
			.join(' ')
			.toLowerCase();
		return text.includes(q);
	});
}

/** The sources the rows use, in the order they first appear. */
export function sourcesOf(rows: readonly SensorRow[]): SensorSource[] {
	return [...new Set(rows.map((row) => row.source))];
}

export interface SensorWords {
	readers: string;
	optional: string;
	note: string;
}

/** One row in words: who reads it, which fields may be absent, and why nothing folds it when nothing does. */
export function sensorWords(row: SensorRow): SensorWords {
	const optional = row.fields.filter((field) => field.optional).map((field) => field.name);
	return {
		readers: row.readBy.map((id) => SENSOR_READERS[id].label).join('; '),
		optional: optional.length > 0 ? optional.join(', ') : 'none',
		note: row.unfolded ?? ''
	};
}

/** The rows that are open findings — read by the trace list alone — with their reasons. */
export function openFindings(rows: readonly SensorRow[]): SensorRow[] {
	return sensorFindings(rows).open;
}

/** How many events of each type the most recent stored runs carry. */
export async function countEventTypes(
	storage: Pick<Storage, 'listRuns' | 'getEvents'>,
	limit: number = SEEN_RUN_LIMIT
): Promise<Record<string, number>> {
	const counts: Record<string, number> = {};
	const runs = (await storage.listRuns())
		.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
		.slice(0, limit);
	for (const run of runs)
		for (const stored of await storage.getEvents(run.id))
			counts[stored.event.type] = (counts[stored.event.type] ?? 0) + 1;
	return counts;
}
