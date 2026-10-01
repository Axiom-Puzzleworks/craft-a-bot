import { CONTROL_REF_KINDS, type ControlRefKind, type StoredCampaignReport } from '@craftabot/core';
import type {
	ControlInventoryRow,
	InventoryCampaignReport,
	InventorySurface
} from '@craftabot/governance/reports';

/**
 * **The Control Inventory's page helpers** (WP134, `110-CONTROL-SUITE-PLAN.md`
 * §4.3): the filter in the URL, each facet in words, the kind × facet
 * matrix, and where each surface lives. Every number is the fold's; this
 * module only words it.
 */

/** Where a person turns, reads or measures a control: the route a surface names, or none for one outside the app. */
export const SURFACE_ROUTES: Readonly<Record<InventorySurface, string | undefined>> = {
	studio: '/workshop/studio',
	'spec-lab': '/workshop/bench',
	policies: '/workshop/policies',
	campaigns: '/workshop/campaigns',
	experiments: '/workshop/experiments',
	workflow: '/workshop/workflows',
	gate: undefined,
	kit: '/',
	readings: '/workshop/readings',
	harness: undefined
};

/** The surfaces' and kinds' words are `governance`'s, so the page and `craftabot controls export` say the same thing. */
export {
	INVENTORY_KIND_LABELS as KIND_LABELS,
	INVENTORY_SURFACE_LABELS as SURFACE_LABELS,
	controlFacetWords as facetWords
} from '@craftabot/governance/reports';

export type FittedFilter = 'fitted' | 'unfitted';
export type CoverageFilter = ControlInventoryRow['coverage'];

export interface ControlFilter {
	kind?: ControlRefKind;
	coverage?: CoverageFilter;
	fitted?: FittedFilter;
	/** Free text over the id, name and pack. */
	q?: string;
	/** A catalogue entry: the instances it names, directly or through their component — the catalogue's link here. */
	entry?: string;
}

const COVERAGES: readonly CoverageFilter[] = [
	'shipped',
	'connectable',
	'bespoke',
	'blueprint',
	'not-applicable',
	'uncatalogued'
];

/** The filter from the URL: `?kind=reader&coverage=uncatalogued&fitted=unfitted&q=fraud`; anything unknown is dropped. */
export function controlFilterFrom(params: URLSearchParams): ControlFilter {
	const kind = params.get('kind') ?? '';
	const coverage = params.get('coverage') ?? '';
	const fitted = params.get('fitted') ?? '';
	const q = (params.get('q') ?? '').trim();
	const entry = (params.get('entry') ?? '').trim();
	return {
		...((CONTROL_REF_KINDS as readonly string[]).includes(kind)
			? { kind: kind as ControlRefKind }
			: {}),
		...((COVERAGES as readonly string[]).includes(coverage)
			? { coverage: coverage as CoverageFilter }
			: {}),
		...(fitted === 'fitted' || fitted === 'unfitted' ? { fitted } : {}),
		...(q ? { q } : {}),
		...(/^[a-z0-9][a-z0-9-]*$/.test(entry) ? { entry } : {})
	};
}

export function controlFilterQuery(filter: ControlFilter): string {
	const params = new URLSearchParams();
	if (filter.kind) params.set('kind', filter.kind);
	if (filter.coverage) params.set('coverage', filter.coverage);
	if (filter.fitted) params.set('fitted', filter.fitted);
	if (filter.q) params.set('q', filter.q);
	if (filter.entry) params.set('entry', filter.entry);
	const query = params.toString();
	return query === '' ? '' : `?${query}`;
}

export function filterControls(
	rows: readonly ControlInventoryRow[],
	filter: ControlFilter
): ControlInventoryRow[] {
	const q = filter.q?.toLowerCase();
	return rows.filter(
		(row) =>
			(!filter.kind || row.kind === filter.kind) &&
			(!filter.coverage || row.coverage === filter.coverage) &&
			(!filter.fitted || row.fitted.state === filter.fitted) &&
			(!filter.entry || row.entries.some((entry) => entry.id === filter.entry)) &&
			(!q ||
				row.id.toLowerCase().includes(q) ||
				row.name.toLowerCase().includes(q) ||
				row.pack.toLowerCase().includes(q))
	);
}

/** The matrix's columns: the share of a kind's rows where a facet is in its good state, where the facet applies. */
export const MATRIX_FACETS = [
	{ id: 'catalogued', label: 'Catalogued' },
	{ id: 'fitted', label: 'Fitted' },
	{ id: 'fired', label: 'Fired' },
	{ id: 'measured', label: 'Measured' },
	{ id: 'evidenced', label: 'Effect evidenced' },
	{ id: 'read', label: 'Read' }
] as const;
export type MatrixFacet = (typeof MATRIX_FACETS)[number]['id'];

/** For one kind and one facet: how many rows the facet applies to, and how many are in the good state. */
export function kindFacet(
	rows: readonly ControlInventoryRow[],
	kind: ControlRefKind,
	facet: MatrixFacet
): { of: number; good: number } {
	const ofKind = rows.filter((row) => row.kind === kind);
	const applies = (row: ControlInventoryRow) => {
		switch (facet) {
			case 'catalogued':
				// A knob or a model is not a technique: the catalogue does not apply.
				return row.coverage !== 'not-applicable';
			case 'fitted':
				return row.fitted.state !== 'not-applicable';
			case 'fired':
				return row.exercised.state !== 'not-applicable' && row.exercised.state !== 'no-runs';
			case 'measured':
				return row.measured.state !== 'not-applicable';
			case 'evidenced':
				return row.effect.state !== 'not-applicable';
			case 'read':
				return row.reviewed.state !== 'not-applicable';
		}
	};
	const good = (row: ControlInventoryRow) => {
		switch (facet) {
			case 'catalogued':
				return row.coverage !== 'uncatalogued';
			case 'fitted':
				return row.fitted.state === 'fitted';
			case 'fired':
				return row.exercised.state === 'fired';
			case 'measured':
				return row.measured.state === 'measured';
			case 'evidenced':
				return row.effect.state === 'evidenced';
			case 'read':
				return row.reviewed.state !== 'unread';
		}
	};
	const applicable = ofKind.filter(applies);
	return { of: applicable.length, good: applicable.filter(good).length };
}

/** The stored reports as the fold reads them: each one's own report, its cells and their verdicts. */
export function inventoryReportsOf(
	reports: readonly StoredCampaignReport[]
): InventoryCampaignReport[] {
	return reports.flatMap((stored) => {
		const cells = (stored.report as { cells?: unknown }).cells;
		return Array.isArray(cells) ? [{ cells: cells as InventoryCampaignReport['cells'] }] : [];
	});
}
