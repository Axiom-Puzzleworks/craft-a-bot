import type { CalibrationTable, PackManifest } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { checkCalibration } from './calibration.js';
import { checkManifest } from './manifest.js';

/**
 * `checkCalibration` (WP74, `66-…` §4.1): a row without a source does not
 * pass — the schema wants a publication's five fields or a typed assumption
 * with a note; a rate above one, an all-zero row, a duplicate id and a
 * category set that misses the model's enum are refused; a cited row
 * awaiting review passes, through `checkManifest` too.
 */
const cited = {
	kind: 'publication' as const,
	publisher: 'ONS',
	title: 'Estimates of the population',
	edition: 'mid-2023',
	table: 'MYE2',
	retrieved: '2026-09-10'
};

const good: CalibrationTable = {
	id: 'demo/calibration',
	title: 'Demo',
	description: 'x',
	rows: [
		{
			id: 'age-band',
			kind: 'weights',
			title: 'Age',
			distribution: { young: 40, old: 60 },
			source: cited,
			tolerance: 0.02,
			review: 'pending'
		},
		{
			id: 'holds',
			kind: 'rates',
			title: 'Holds a card',
			distribution: { card: 0.65 },
			source: { kind: 'assumption', retrieved: '2026-09-10' },
			note: 'No public figure for this bank.',
			tolerance: 0.02,
			review: { by: 'a reviewer', on: '2026-09-10' }
		}
	]
};

const withRow = (row: Partial<CalibrationTable['rows'][number]>): CalibrationTable => ({
	...good,
	rows: [{ ...good.rows[0]!, ...row }]
});

describe('checkCalibration', () => {
	it('passes a cited table, reviewed or pending', () => {
		expect(checkCalibration(good)).toEqual([]);
	});

	it('refuses a row without a source, or an assumption without a note', () => {
		const noSource = withRow({ source: undefined as never });
		expect(checkCalibration(noSource).map((i) => i.check)).toContain('calibration.schema');
		const bare = withRow({
			source: { kind: 'assumption', retrieved: '2026-09-10' },
			note: undefined
		});
		expect(checkCalibration(bare).map((i) => i.check)).toContain('calibration.assumption-says-why');
	});

	it('refuses a publication missing its edition or retrieval date', () => {
		const noEdition: Partial<typeof cited> = { ...cited };
		delete noEdition.edition;
		expect(checkCalibration(withRow({ source: noEdition as never })).map((i) => i.check)).toContain(
			'calibration.schema'
		);
	});

	it('refuses a rate above one, an all-zero row and a duplicate id', () => {
		expect(
			checkCalibration(withRow({ kind: 'rates', distribution: { a: 1.2 } })).map((i) => i.check)
		).toContain('calibration.rate-is-probability');
		expect(
			checkCalibration(withRow({ distribution: { a: 0, b: 0 } })).map((i) => i.check)
		).toContain('calibration.positive');
		const duplicated = { ...good, rows: [good.rows[0]!, good.rows[0]!] };
		expect(checkCalibration(duplicated).map((i) => i.check)).toContain('calibration.id-unique');
	});

	it("checks a row's categories against the model's enum when told which", () => {
		expect(
			checkCalibration(good, { enums: { 'age-band': ['young', 'old', 'older'] } }).map(
				(i) => i.check
			)
		).toContain('calibration.categories-match-enum');
		expect(checkCalibration(good, { enums: { 'age-band': ['old', 'young'] } })).toEqual([]);
	});

	it('runs through checkManifest, and wants the table id qualified', () => {
		const manifest: PackManifest = {
			id: 'demo',
			name: 'Demo',
			version: '1.0.0',
			requiresCore: '>=1.0.0',
			calibrations: [good]
		};
		expect(checkManifest(manifest).filter((i) => i.check.startsWith('calibration'))).toEqual([]);
		const unqualified = { ...manifest, calibrations: [{ ...good, id: 'calibration' }] };
		expect(checkManifest(unqualified).map((i) => i.check)).toContain('manifest.ids-qualified');
	});
});
