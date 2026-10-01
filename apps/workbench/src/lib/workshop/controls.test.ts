import { GUARDRAIL_CATALOGUE } from '@craftabot/governance';
import { controlInventory } from '@craftabot/governance/reports';
import { describe, expect, it } from 'vitest';
import { createRegistry } from '$lib/packs.js';
import {
	controlFilterFrom,
	controlFilterQuery,
	facetWords,
	filterControls,
	inventoryReportsOf,
	kindFacet,
	SURFACE_ROUTES
} from './controls.js';

/**
 * The Control Inventory page's helpers (WP134): the filter round-trips
 * through the URL, every facet has words, and the matrix's shares are the
 * rows' own.
 */
const rows = controlInventory({ registry: createRegistry(), catalogue: GUARDRAIL_CATALOGUE });

describe('the control filter', () => {
	it('round-trips through the URL and drops what it does not know', () => {
		const filter = controlFilterFrom(
			new URLSearchParams('kind=reader&coverage=uncatalogued&fitted=unfitted&q=fraud&x=1')
		);
		expect(filter).toEqual({
			kind: 'reader',
			coverage: 'uncatalogued',
			fitted: 'unfitted',
			q: 'fraud'
		});
		expect(controlFilterQuery(filter)).toBe(
			'?kind=reader&coverage=uncatalogued&fitted=unfitted&q=fraud'
		);
		expect(controlFilterFrom(new URLSearchParams('kind=widget&fitted=maybe'))).toEqual({});
		expect(controlFilterQuery({})).toBe('');
	});

	it('narrows the rows by kind, coverage, fitting and text', () => {
		const readers = filterControls(rows, { kind: 'reader' });
		expect(readers.length).toBeGreaterThan(0);
		expect(readers.every((row) => row.kind === 'reader')).toBe(true);
		expect(filterControls(rows, { q: 'tool-blocklist' }).map((row) => row.ref)).toEqual([
			'guardrail:connector/tool-blocklist'
		]);
		// The catalogue's link: the instances an entry names.
		const budget = filterControls(rows, controlFilterFrom(new URLSearchParams('entry=budget-cap')));
		expect(budget.map((row) => row.ref)).toEqual(
			expect.arrayContaining([
				'component:governance/step-budget',
				'mechanism:core/group-token-budget'
			])
		);
	});
});

describe('the words and the matrix', () => {
	it('words every facet of every row', () => {
		for (const row of rows) {
			const words = facetWords(row);
			for (const [facet, text] of Object.entries(words))
				expect(text, `${row.ref} ${facet}`).not.toBe('');
		}
		const card = rows.find((row) => row.kind === 'policy-card')!;
		expect(facetWords(card).exercised).toBe('no runs stored');
		expect(facetWords(rows.find((row) => row.ref === 'mechanism:core/trace')!).configurable).toBe(
			'fixed'
		);
	});

	it('counts a kind’s rows where a facet applies, and how many are in the good state', () => {
		const ceilings = kindFacet(rows, 'ceiling', 'catalogued');
		expect(ceilings.of).toBe(rows.filter((row) => row.kind === 'ceiling').length);
		expect(kindFacet(rows, 'mechanism', 'fitted')).toEqual({ of: 0, good: 0 });
		// Knobs are settings, not techniques: the catalogue column does not apply to them.
		expect(kindFacet(rows, 'knob', 'catalogued')).toEqual({ of: 0, good: 0 });
		const readers = kindFacet(rows, 'reader', 'fitted');
		expect(readers.good).toBeLessThanOrEqual(readers.of);
	});

	it('routes every surface it can, and reads a stored report’s cells', () => {
		expect(SURFACE_ROUTES.studio).toBe('/workshop/studio');
		expect(SURFACE_ROUTES.harness).toBeUndefined();
		expect(
			inventoryReportsOf([
				{ report: { cells: [{ evaluations: { a: 'fail' } }] } },
				{ report: {} }
			] as never)
		).toEqual([{ cells: [{ evaluations: { a: 'fail' } }] }]);
	});
});
