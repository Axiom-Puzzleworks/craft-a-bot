import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from '@craftabot/core';
import { makeEvent, makeRun } from '@craftabot/core/testing';
import { sensorInventory } from '@craftabot/governance/reports';
import { countEventTypes, filterSensors, openFindings, sensorWords, sourcesOf } from './sensors.js';

/** WP159: the Sensor Inventory page's helpers — filter, words, and the browser's own counts. */
const rows = sensorInventory();

describe('the Sensor Inventory page helpers', () => {
	it('filters by source, by whether a fold reads it, and by text over the type and readers', () => {
		expect(filterSensors(rows, { source: 'workflow' }).map((row) => row.type)).toEqual([
			'stage.overdue',
			'stage.started',
			'stage.completed',
			'reader.answered'
		]);
		expect(
			filterSensors(rows, { reading: 'listed' })
				.map((row) => row.type)
				.sort()
		).toEqual(['decision.fault', 'elevation.requested']);
		expect(filterSensors(rows, { reading: 'folded' })).toHaveLength(rows.length - 2);
		expect(filterSensors(rows, { q: 'OpenTelemetry' }).length).toBeGreaterThan(3);
		expect(filterSensors(rows, { q: 'no such reader' })).toEqual([]);
	});

	it('names the sources in the order they appear', () => {
		expect(sourcesOf(rows)).toEqual(['engine', 'workflow', 'group']);
	});

	it('words a row, and carries the reason for an open finding', () => {
		const fault = rows.find((row) => row.type === 'decision.fault')!;
		expect(sensorWords(fault).note).toContain('WP161');
		expect(
			openFindings(rows)
				.map((row) => row.type)
				.sort()
		).toEqual(['decision.fault', 'elevation.requested']);
		const started = rows.find((row) => row.type === 'run.started')!;
		expect(sensorWords(started).optional).toContain('principal');
		expect(sensorWords(rows.find((row) => row.type === 'tick.started')!).optional).toBe('none');
	});

	it('counts the events of the stored runs, newest first, up to the limit', async () => {
		const storage = createMemoryStorage();
		const old = makeRun({ startedAt: '2026-01-01T00:00:00Z' });
		const recent = makeRun({
			id: '22222222-2222-4222-8222-222222222222',
			startedAt: '2026-02-01T00:00:00Z'
		});
		await storage.putRun(old);
		await storage.putRun(recent);
		await storage.appendEvents(old.id, [makeEvent(old.id, 0, 1)]);
		await storage.appendEvents(recent.id, [makeEvent(recent.id, 0, 2), makeEvent(recent.id, 1, 3)]);
		expect(await countEventTypes(storage)).toEqual({ 'tick.started': 3 });
		expect(await countEventTypes(storage, 1)).toEqual({ 'tick.started': 2 });
	});
});
