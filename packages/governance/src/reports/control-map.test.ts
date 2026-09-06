import { describe, expect, it } from 'vitest';
import {
	GENERIC_CONTROL_MAP_ID,
	GENERIC_CONTROL_MAP_MANIFEST,
	GOVERNANCE_GUARDRAIL_IDS,
	genericControlMap
} from './control-map.js';

/**
 * The generic map (WP67, `53-…` §4.1): four frameworks, every row unreviewed
 * until a compliance reader has read it, every row with evidence, and no
 * evidence that is a pack's content — governance ships nothing but its own
 * mechanisms. Resolution is `@craftabot/pack-testkit`'s job and is checked
 * there (`checks/control-map-generic.test.ts`).
 */
describe('the generic control map', () => {
	it('covers the four frameworks and ships under the synthetic manifest', () => {
		expect([...new Set(genericControlMap.rows.map((row) => row.framework))]).toEqual([
			'NIST AI RMF 1.0',
			'EU AI Act',
			'ISO/IEC 42001:2023',
			'OWASP Top 10 for Agentic Applications'
		]);
		expect(GENERIC_CONTROL_MAP_MANIFEST.controlMaps).toEqual([genericControlMap]);
		expect(genericControlMap.id).toBe(GENERIC_CONTROL_MAP_ID);
		expect(GOVERNANCE_GUARDRAIL_IDS).toContain('safety/approval-mode');
	});

	it('every row is unreviewed, evidenced, uniquely named, and cites no pack content', () => {
		const refs = new Set<string>();
		for (const row of genericControlMap.rows) {
			expect(row.status, row.ref).toBe('unreviewed');
			expect(row.evidence.length, row.ref).toBeGreaterThan(0);
			expect(refs.has(row.ref), row.ref).toBe(false);
			refs.add(row.ref);
			for (const item of row.evidence)
				expect(['policy-card', 'evaluator'].includes(item.kind), `${row.ref}: ${item.id}`).toBe(
					false
				);
			for (const item of row.evidence.filter((entry) => entry.kind === 'guardrail'))
				expect(GOVERNANCE_GUARDRAIL_IDS).toContain(item.id);
		}
		expect(genericControlMap.rows.length).toBeGreaterThanOrEqual(20);
	});
});
