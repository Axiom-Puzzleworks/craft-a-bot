import { writeFile } from 'node:fs/promises';
import type { Storage } from '@craftabot/core';
import {
	renderSensorsMarkdown,
	sensorFindings,
	sensorInventory,
	sensorInventoryExport,
	type SensorInventoryExport
} from '@craftabot/governance/reports';

/**
 * **`craftabot sensors list | export`** (WP159, `112-REAL-ENOUGH-PLAN.md`
 * §5): the Sensor Inventory from the host's side — the same fold
 * `/workshop/sensors` renders. With `--store`, how many of each event type the
 * run store holds comes beside it.
 */
export interface SensorsOptions {
	storage?: Storage;
	generatedAt: string;
}

export async function sensorsFor(options: SensorsOptions): Promise<SensorInventoryExport> {
	let observed: Record<string, number> | undefined;
	if (options.storage) {
		observed = {};
		for (const run of await options.storage.listRuns())
			for (const stored of await options.storage.getEvents(run.id))
				observed[stored.event.type] = (observed[stored.event.type] ?? 0) + 1;
	}
	return sensorInventoryExport(sensorInventory(), options.generatedAt, observed);
}

export async function writeSensors(
	file: SensorInventoryExport,
	format: 'json' | 'markdown',
	out?: string
): Promise<string> {
	const text =
		format === 'markdown' ? renderSensorsMarkdown(file) : `${JSON.stringify(file, null, '\t')}\n`;
	if (out) await writeFile(out, text, 'utf8');
	return text;
}

/** The terminal summary: the counts, and each open finding with its reason. */
export function renderSensorsSummary(file: SensorInventoryExport): string {
	const { summary } = file;
	const { open } = sensorFindings(file.rows);
	return `${[
		`sensors: ${summary.types} event types — ${summary.folded} read by a fold, ${summary.listedOnly} listed only; ${summary.optionalFields} optional payload fields`,
		...open.map((row) => `  open  ${row.type.padEnd(22)} ${row.unfolded ?? ''}`)
	].join('\n')}\n`;
}
