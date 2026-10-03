import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SENSOR_READERS, sensorInventory } from '@craftabot/governance/reports';

/**
 * **Reader claims** (WP159 stage B, `112-REAL-ENOUGH-PLAN.md` §5): the
 * Sensor Inventory says who reads each event; this holds it to the sources.
 * A row's reader counts only when one of that reader's files names the
 * event's type as a string literal, so a reader that stops reading an event
 * — or a claim that was never true — fails here by name.
 */
const ROOT = resolve(import.meta.dirname, '../../..');
const source = (file: string) => readFileSync(resolve(ROOT, file), 'utf8');

describe('the Sensor Inventory’s reader claims', () => {
	it('names, for every row, only readers whose files mention the event', () => {
		const wrong: string[] = [];
		for (const row of sensorInventory()) {
			for (const id of row.readBy) {
				const files = SENSOR_READERS[id].files;
				const found = files.some((file) => {
					const text = source(file);
					return text.includes(`'${row.type}'`) || text.includes(`"${row.type}"`);
				});
				if (!found) wrong.push(`${row.type} ← ${id}`);
			}
		}
		expect(wrong).toEqual([]);
	});

	it('names files that exist', () => {
		for (const reader of Object.values(SENSOR_READERS))
			for (const file of reader.files) expect(() => source(file)).not.toThrow();
	});
});
