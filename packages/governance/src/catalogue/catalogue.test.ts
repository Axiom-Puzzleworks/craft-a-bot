import { describe, expect, it } from 'vitest';
import { createPackRegistry, type PackManifest } from '@craftabot/core';
import { builtinComponents } from '../components/builtin.js';
import { egressComponents } from '../components/egress.js';
import { policyCardComponent } from '../components/policy-card.js';
import { checkCatalogue, checkEntry } from './check.js';
import { CATALOGUE_ENTRIES, GUARDRAIL_CATALOGUE } from './entries.js';
import { coverageReport, coverageSummary, renderCatalogueMarkdown } from '../reports/coverage.js';

/**
 * The catalogue's shape and rules (WP98, `86-CATALOGUE.md` §6): every entry
 * parses and cites; the statuses mean what tenet 28 says; the fold's rows
 * equal the entries; the page renders deterministically. Resolution of the
 * shipped components against every pack is `harness/src/catalogue.test.ts`.
 */
const PACK: PackManifest = {
	id: 'test',
	name: 'Test',
	version: '1.0.0',
	requiresCore: '>=0.0.1',
	guardrailComponents: [...builtinComponents, policyCardComponent as never, ...egressComponents]
} as unknown as PackManifest;

function registry() {
	const created = createPackRegistry();
	created.registerPack(PACK);
	return created;
}

describe('the first edition', () => {
	it('parses, cites, and names only components a pack ships — those it can see here', () => {
		const issues = checkCatalogue(GUARDRAIL_CATALOGUE, registry()).filter(
			// The service and monitor components ship in packs governance cannot import; the harness resolves them.
			(issue) =>
				!(
					issue.check === 'catalogue.component' &&
					/guard-local|geap|azure|pdp-opa|monitor|lakera|bedrock/.test(issue.message)
				)
		);
		expect(issues).toEqual([]);
		expect(CATALOGUE_ENTRIES.length).toBeGreaterThanOrEqual(40);
		expect(CATALOGUE_ENTRIES.every((entry) => entry.review === 'pending')).toBe(true);
		expect(new Set(CATALOGUE_ENTRIES.map((entry) => entry.id)).size).toBe(CATALOGUE_ENTRIES.length);
	});

	it('every entry cites at least one source with a year, and every threat is from the closed lists', () => {
		for (const entry of CATALOGUE_ENTRIES) {
			expect(entry.sources.length, entry.id).toBeGreaterThan(0);
			expect(
				entry.sources.every((source) => source.year >= 1950),
				entry.id
			).toBe(true);
			expect(
				entry.threats.every((threat) => /^(ASI|LLM)\d\d$|^AML\.T/.test(threat)),
				entry.id
			).toBe(true);
		}
	});
});

describe('checkEntry refuses', () => {
	const base = CATALOGUE_ENTRIES.find((entry) => entry.id === 'budget-cap')!;

	it('a shipped entry that names nothing, a connectable one without a connection, a blueprint with an implementation, an unknown component', () => {
		const reg = registry();
		expect(
			checkEntry({ ...base, coverage: { status: 'shipped', note: 'x' } }, reg).map((i) => i.check)
		).toEqual(['catalogue.status']);
		expect(
			checkEntry(
				{
					...base,
					coverage: { status: 'connectable', componentIds: ['governance/step-budget'], note: 'x' }
				},
				reg
			).map((i) => i.check)
		).toEqual(['catalogue.status']);
		expect(
			checkEntry(
				{ ...base, coverage: { status: 'blueprint', implementedBy: ['something'], note: 'x' } },
				reg
			).map((i) => i.check)
		).toEqual(['catalogue.status']);
		expect(
			checkEntry(
				{ ...base, coverage: { status: 'shipped', componentIds: ['nobody/nothing'], note: 'x' } },
				reg
			).map((i) => i.check)
		).toEqual(['catalogue.component']);
		expect(
			checkEntry({ ...base, coverage: { status: 'not-applicable', note: 'no' } }, reg).map(
				(i) => i.check
			)
		).toEqual(['catalogue.status']);
	});

	it('a catalogue that does not parse, and a duplicate id', () => {
		expect(
			checkCatalogue({ ...GUARDRAIL_CATALOGUE, entries: [] } as never, registry()).map(
				(i) => i.check
			)
		).toEqual(['catalogue.parses']);
		expect(
			checkCatalogue({ ...GUARDRAIL_CATALOGUE, entries: [base, base] }, registry()).map(
				(i) => i.check
			)
		).toContain('catalogue.unique');
	});
});

describe('the coverage fold', () => {
	it('has one row per entry, the summary counts every status, and the page renders every entry', () => {
		const rows = coverageReport(GUARDRAIL_CATALOGUE, registry());
		expect(rows).toHaveLength(CATALOGUE_ENTRIES.length);
		expect(rows.find((row) => row.entry.id === 'budget-cap')?.components).toEqual([
			'governance/step-budget',
			'governance/token-budget'
		]);
		const summary = coverageSummary(GUARDRAIL_CATALOGUE);
		expect(Object.values(summary.byStatus).reduce((a, b) => a + b, 0)).toBe(
			CATALOGUE_ENTRIES.length
		);
		expect(summary.pending).toBe(CATALOGUE_ENTRIES.length);
		expect(summary.notApplicable).toContain('Sandboxed tool and code execution');
		const page = renderCatalogueMarkdown(GUARDRAIL_CATALOGUE, registry());
		for (const entry of CATALOGUE_ENTRIES) expect(page).toContain(`\`${entry.id}\``);
		expect(page).toBe(renderCatalogueMarkdown(GUARDRAIL_CATALOGUE, registry()));
	});
});
