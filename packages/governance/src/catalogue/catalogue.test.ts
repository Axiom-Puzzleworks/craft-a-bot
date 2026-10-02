import { describe, expect, it } from 'vitest';
import { createPackRegistry, type PackManifest } from '@craftabot/core';
import { builtinComponents } from '../components/builtin.js';
import { egressComponents } from '../components/egress.js';
import { policyCardComponent } from '../components/policy-card.js';
import { injectionComponents } from '../components/injection.js';
import { provenanceComponents } from '../components/provenance.js';
import { privilegeScopesComponent } from '../components/privilege.js';
import { peerAuthComponent } from '../components/peer-auth.js';
import { boundsComponents } from '../components/bounds.js';
import { integrityComponents } from '../components/integrity.js';
import { checkCatalogue, checkEntry } from './check.js';
import { CATALOGUE_ENTRIES, GUARDRAIL_CATALOGUE } from './entries.js';
import { SECOND_EDITION_ENTRIES } from './second-edition.js';
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
	guardrailComponents: [
		...builtinComponents,
		policyCardComponent as never,
		...egressComponents,
		...(injectionComponents as unknown as never[]),
		...(provenanceComponents as unknown as never[]),
		privilegeScopesComponent as never,
		peerAuthComponent as never,
		...(boundsComponents as unknown as never[]),
		...(integrityComponents as unknown as never[])
	]
} as unknown as PackManifest;

function registry() {
	const created = createPackRegistry();
	created.registerPack(PACK);
	return created;
}

describe('the second edition (2026-10, WP132)', () => {
	it('parses, cites, and names only components a pack ships — those it can see here', () => {
		const issues = checkCatalogue(GUARDRAIL_CATALOGUE, registry()).filter(
			// The service and monitor components ship in packs governance cannot import; the harness resolves them.
			(issue) =>
				!(
					(issue.check === 'catalogue.component' || issue.check === 'catalogue.implemented-by') &&
					/"(?!governance\/)[a-z-]+\//.test(issue.message)
				)
		);
		expect(issues).toEqual([]);
		expect(CATALOGUE_ENTRIES.length).toBeGreaterThanOrEqual(60);
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
				{
					...base,
					coverage: { status: 'blueprint', implementedBy: ['mechanism:core/trace'], note: 'x' }
				},
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

	it('an implementedBy that is prose, or a reference that resolves to nothing (WP132)', () => {
		const reg = registry();
		expect(
			checkCatalogue(
				{
					...GUARDRAIL_CATALOGUE,
					entries: [
						{ ...base, coverage: { ...base.coverage, implementedBy: ['the budgets (07-…)'] } }
					]
				},
				reg
			).map((i) => i.check)
		).toEqual(['catalogue.parses']);
		const dangling = [
			'mechanism:core/nothing',
			'guardrail:safety/nothing',
			'gate:nothing',
			'trace-guarantee:nothing.happened',
			'artefact:nothing',
			'policy-card:nobody/policy/nothing'
		];
		const issues = checkEntry(
			{ ...base, coverage: { ...base.coverage, implementedBy: dangling } },
			reg
		);
		expect(issues.map((i) => i.check)).toEqual(dangling.map(() => 'catalogue.implemented-by'));
		expect(
			checkEntry(
				{
					...base,
					coverage: {
						...base.coverage,
						implementedBy: [
							'mechanism:core/trace',
							'guardrail:connector/tool-blocklist',
							'gate:drift',
							'trace-guarantee:content.marked',
							'artefact:assurance-pack'
						]
					}
				},
				reg
			)
		).toEqual([]);
		// A host's own guardrail ids resolve when it names them.
		expect(
			checkEntry(
				{ ...base, coverage: { ...base.coverage, implementedBy: ['guardrail:host/own'] } },
				reg,
				{ knownGuardrails: ['host/own'] }
			)
		).toEqual([]);
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

describe('the bespoke four, shipped (WP124)', () => {
	it('leaves no first-edition entry bespoke — memory provenance shipped in WP141, peer authentication in WP143', () => {
		const second = new Set(SECOND_EDITION_ENTRIES.map((entry) => entry.id));
		expect(
			CATALOGUE_ENTRIES.filter(
				(entry) => !second.has(entry.id) && entry.coverage.status === 'bespoke'
			).map((entry) => entry.id)
		).toEqual([]);
		expect(
			CATALOGUE_ENTRIES.filter((entry) => entry.coverage.since === 'WP124').map((entry) => entry.id)
		).toEqual([
			'untrusted-content-marking',
			'indirect-injection-defence',
			'information-flow-control',
			'privilege-separation'
		]);
	});
});

describe('the second edition (WP132, `110-CONTROL-SUITE-PLAN.md` §3)', () => {
	it('names every implementation as a control reference — no prose', () => {
		for (const entry of CATALOGUE_ENTRIES)
			for (const ref of entry.coverage.implementedBy ?? [])
				expect(ref, entry.id).toMatch(/^[a-z-]+:\S+$/);
	});

	it('says ceilings are measured by default and enforced only where a configuration says so (WP139)', () => {
		for (const id of ['four-eyes', 'autonomy-levels']) {
			const entry = CATALOGUE_ENTRIES.find((e) => e.id === id)!;
			expect(entry.coverage.note, id).toMatch(/measured by default/);
			expect(entry.coverage.note, id).toMatch(/autonomy\.enforce/);
		}
	});

	it('adds the bank’s missing techniques and three said not applicable', () => {
		const ids = new Set(CATALOGUE_ENTRIES.map((entry) => entry.id));
		for (const id of [
			'confidence-gate',
			'contestability',
			'mandatory-disclosure',
			'vulnerability-detection',
			'timeliness',
			'model-change-control',
			'dependency-failover',
			'override-reason',
			'shadow-mode',
			'fail-closed',
			'data-retention',
			'configuration-access-control',
			'output-content-provenance'
		])
			expect(ids.has(id), id).toBe(true);
		expect(GUARDRAIL_CATALOGUE.edition).toBe('2026-10');
	});
});
