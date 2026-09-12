import { GOVERNANCE_GUARDRAIL_IDS } from '@craftabot/governance/reports';
import { OBLIGATION_TAGS } from '@craftabot/pack-fs-bank';
import { checkControlMap } from '@craftabot/pack-testkit';
import { describe, expect, it } from 'vitest';
import { createRegistry, defaultConfig } from './config.js';

/**
 * Every control map the default host installs resolves in full (WP67,
 * `53-…` §11 item 1): the generic map against governance's own ids, the
 * bank's map against the three desks it cites, each desk's map against its
 * own content — with every tag from the obligation or threat vocabulary.
 * The bank's conformance fixture leaves resolution to this test, since its
 * rows span packs the bank cannot depend on.
 */
const THREAT_TAGS = [
	'ASI01',
	'ASI02',
	'ASI05',
	'ASI06',
	'ASI07',
	'ASI09',
	'ASI10',
	'19/#12',
	'19/#25',
	'19/#38',
	'indirect-injection',
	'tool-poisoning',
	'confused-deputy',
	'social-engineering',
	'app-scam'
];

describe('the installed control maps', () => {
	it('every registered map resolves against the full registry', () => {
		const registry = createRegistry(defaultConfig());
		const maps = registry.listControlMaps();
		expect(maps.map((map) => map.id).sort()).toEqual([
			'fs-advice/control-map',
			'fs-bank/control-map',
			'fs-collections/control-map',
			'fs-disputes/control-map',
			'fs-fraud/control-map',
			'fs-lending/control-map',
			'fs-onboarding/control-map',
			'governance/control-map'
		]);
		for (const map of maps) {
			const issues = checkControlMap(map, registry, {
				knownGuardrails: GOVERNANCE_GUARDRAIL_IDS,
				knownTags: [...Object.keys(OBLIGATION_TAGS), ...THREAT_TAGS]
			});
			expect(
				issues.map((issue) => issue.message),
				map.id
			).toEqual([]);
		}
	});

	it('no row is pending any more (WP72 resolved the bank’s two); every row is unreviewed, the bank’s DISP and SS1/21 rows with evidence', () => {
		const registry = createRegistry(defaultConfig());
		const bank = registry.getControlMap('fs-bank/control-map')!;
		for (const ref of ['complaints', 'resilience']) {
			const row = bank.rows.find((entry) => entry.ref === ref)!;
			expect(row.status, ref).toBe('unreviewed');
			expect(row.evidence.length, ref).toBeGreaterThan(0);
		}
		for (const map of registry.listControlMaps())
			for (const row of map.rows) expect(row.status, `${map.id}/${row.ref}`).toBe('unreviewed');
	});
});
