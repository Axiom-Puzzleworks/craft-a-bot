import { describe, expect, it } from 'vitest';
import { EVENT_TYPES } from '@craftabot/core';
import {
	SENSOR_DECLARATIONS,
	SENSOR_READERS,
	payloadFields,
	renderSensorsMarkdown,
	sensorFindings,
	sensorInventory,
	sensorInventoryExport
} from './sensors.js';

/**
 * The Sensor Inventory (WP159, `112-REAL-ENOUGH-PLAN.md` §5). Whether each
 * event fires, and whether each reader's files really mention the types
 * they are named for, is `harness/src/sensor-coverage.test.ts`.
 */
describe('the Sensor Inventory', () => {
	it('has one row per event type, in the schema’s order, and nothing else declared', () => {
		const rows = sensorInventory();
		expect(rows.map((row) => row.type)).toEqual([...EVENT_TYPES]);
		expect(Object.keys(SENSOR_DECLARATIONS).sort()).toEqual([...EVENT_TYPES].sort());
	});

	it('walks the optional fields off the schema, not a list', () => {
		const fields = payloadFields('run.started');
		expect(fields.find((field) => field.name === 'principal')).toEqual({
			name: 'principal',
			optional: true
		});
		expect(fields.find((field) => field.name === 'mode')).toEqual({
			name: 'mode',
			optional: false
		});
		expect(payloadFields('tick.started')).toEqual([]);
	});

	it('names only readers that exist, and every row has the trace list', () => {
		for (const row of sensorInventory()) {
			expect(row.readBy).toContain('trace-list');
			for (const id of row.readBy) expect(SENSOR_READERS[id]).toBeDefined();
		}
	});

	it('refuses a row no fold reads that says nothing of why (the orphan rule’s twin)', () => {
		const { refused, open } = sensorFindings(sensorInventory());
		expect(refused.map((row) => row.type)).toEqual([]);
		// The open findings are real and owned: a planted fault and a requested elevation.
		expect(open.map((row) => row.type).sort()).toEqual(['decision.fault', 'elevation.requested']);
		const orphan = sensorFindings([
			{ ...sensorInventory()[0]!, readBy: ['trace-list'], folded: false }
		]);
		expect(orphan.refused).toHaveLength(1);
	});

	it('exports a summary and renders a table', () => {
		const file = sensorInventoryExport(sensorInventory(), '2026-10-02T00:00:00.000Z');
		expect(file.summary.types).toBe(EVENT_TYPES.length);
		expect(file.summary.folded + file.summary.listedOnly).toBe(EVENT_TYPES.length);
		expect(file.summary.browserOnly).toBe(0);
		const text = renderSensorsMarkdown(file);
		expect(text).toContain('# Sensor Inventory');
		expect(text).toContain('| `think.token` |');
	});
});
