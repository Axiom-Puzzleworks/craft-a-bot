import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { itemKey, readSmoke } from '../../../../scripts/live-smoke.mjs';

/**
 * **The live smoke's own bookkeeping** (WP194, `113-RECORDING-AND-RELIABILITY.md`
 * §6): the items it names exist and are synthetic, a recording is read back as
 * "no longer fails" or "still fails", and a control that begins to fail is said.
 */
const ROOT = resolve(import.meta.dirname, '../../../..');
const items = JSON.parse(
	readFileSync(join(ROOT, 'docs', 'evidence', 'live', 'smoke-items.json'), 'utf8')
) as {
	designs: Record<
		string,
		{ failedForReal: Array<{ item: string; cells: number }>; controls: string[] }
	>;
};

describe('the live smoke (WP194)', () => {
	it('names the 34 cells that failed for real, in 24 items, and eight controls, each of a design that exists', () => {
		const failed = Object.values(items.designs).flatMap((design) => design.failedForReal);
		expect(failed).toHaveLength(24);
		expect(failed.reduce((sum, entry) => sum + entry.cells, 0)).toBe(34);
		expect(Object.values(items.designs).flatMap((design) => design.controls)).toHaveLength(8);
		for (const id of Object.keys(items.designs))
			expect(existsSync(join(ROOT, 'experiments', 'live', `${id}.json`)), id).toBe(true);
		// Synthetic ids only (hard rule 9): a kind and eight hex digits.
		const everyItem = Object.values(items.designs).flatMap((design) => [
			...design.failedForReal.map((entry) => entry.item),
			...design.controls
		]);
		for (const item of everyItem) expect(item).toMatch(/^(complaint|alert|advice)-[0-9a-f]{8}$/);
		expect(new Set(everyItem).size).toBe(everyItem.length);
	});

	it('finds an item in a cell key by its id between bars, so one id never matches part of another', () => {
		expect(itemKey('alert-1a2b3c4d')).toBe('|alert-1a2b3c4d|');
		const key = 'c|fs-fraud/fraud|bot|none|live||alert-1a2b3c4d|1|0';
		expect(key.includes(itemKey('alert-1a2b3c4d'))).toBe(true);
		expect(key.includes(itemKey('alert-1a2b3c4'))).toBe(false);
	});

	it('reads a recording back: what still fails, what no longer does, and a control that began to', () => {
		const cell = (item: string, outcome: string, calls: number) => ({
			cellKey: `c|s|b|g|live||${item}|1|0`,
			outcome,
			calls: Array.from({ length: calls })
		});
		const read = readSmoke(
			{
				cells: [
					cell('alert-aaaaaaaa', 'SUCCESS', 6),
					cell('alert-bbbbbbbb', 'ERROR', 31),
					cell('alert-cccccccc', 'SUCCESS', 5),
					cell('alert-dddddddd', 'ERROR', 29)
				]
			},
			{
				failedForReal: [{ item: 'alert-aaaaaaaa' }, { item: 'alert-bbbbbbbb' }],
				controls: ['alert-cccccccc', 'alert-dddddddd']
			}
		);
		expect(read.failedForReal).toBe(2);
		expect(read.stillFailing).toEqual(['alert-bbbbbbbb']);
		expect(read.controlsNowFailing).toEqual(['alert-dddddddd']);
		expect(read.lines[1]).toContain('ERROR (31 calls)');
	});
});
