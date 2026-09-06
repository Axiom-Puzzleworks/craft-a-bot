import { createPackRegistry, type PackManifest } from '@craftabot/core';
import {
	GENERIC_CONTROL_MAP_ID,
	GENERIC_CONTROL_MAP_MANIFEST,
	GOVERNANCE_GUARDRAIL_IDS,
	genericControlMap
} from '@craftabot/governance/reports';
import { describe, expect, it } from 'vitest';
import { checkControlMap } from './control-map.js';

/**
 * The generic map resolves in full (WP67, `53-…` §4.1) against a registry
 * that holds nothing but governance's synthetic manifest: its evidence is
 * governance's own guardrail ids, trace guarantees, gate kinds, egress
 * modes, a principal record and the pack's artefacts — never a pack's
 * content. Checked here rather than in `governance` because the check is
 * this kit's and `governance` depends on nothing above `core`.
 */
describe('the generic control map under checkControlMap', () => {
	it('registers under its synthetic manifest and every row resolves', () => {
		const registry = createPackRegistry();
		registry.registerPack(GENERIC_CONTROL_MAP_MANIFEST as unknown as PackManifest);
		expect(registry.getControlMap(GENERIC_CONTROL_MAP_ID)).toBe(genericControlMap);
		const issues = checkControlMap(genericControlMap, registry, {
			knownGuardrails: GOVERNANCE_GUARDRAIL_IDS
		});
		expect(issues.map((issue) => issue.message)).toEqual([]);
	});

	it('would not resolve without governance’s own guardrail ids — the host must hand them in', () => {
		const registry = createPackRegistry();
		registry.registerPack(GENERIC_CONTROL_MAP_MANIFEST as unknown as PackManifest);
		const issues = checkControlMap(genericControlMap, registry);
		expect(issues.length).toBeGreaterThan(0);
		expect(issues.every((issue) => issue.check === 'control-map.evidence-resolves')).toBe(true);
	});
});
