import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
	GUARDRAIL_CATALOGUE,
	UNCATALOGUED_CONTROLS,
	checkControlInventory
} from '@craftabot/governance';
import { controlInventory, controlInventorySummary } from '@craftabot/governance/reports';
import { DEFAULT_DISPUTES_POLICY } from '@craftabot/pack-fs-disputes';
import { DEFAULT_LENDING_POLICY } from '@craftabot/pack-fs-lending';
import { describe, expect, it } from 'vitest';
import { createRegistry, defaultConfig } from './config.js';

/**
 * **The Control Inventory over the whole bank** (WP133,
 * `110-CONTROL-SUITE-PLAN.md` §4.3, G117–G118): every control the default
 * host installs has a row, and none is an orphan — each is named by a
 * catalogue entry or cited by a control-map row, or declared in
 * `UNCATALOGUED_CONTROLS` with its reason. A control added without either
 * fails here, in CI (decision 3); one named since its declaration fails too,
 * so the list only shrinks.
 */
const ROOT = resolve(import.meta.dirname, '../../..');
const config = defaultConfig();
const registry = createRegistry(config);
const campaigns = [
	...config.packs.flatMap((pack) =>
		(pack.campaigns ?? []).map((shipped) => ({ id: shipped.id, campaign: shipped.campaign() }))
	),
	...readdirSync(join(ROOT, 'experiments'))
		.filter((file) => file.endsWith('.json'))
		.map((file) => ({
			id: file.replace(/\.json$/, ''),
			kind: 'experiment' as const,
			campaign: JSON.parse(readFileSync(join(ROOT, 'experiments', file), 'utf8')) as unknown
		}))
];
const rows = controlInventory({ registry, catalogue: GUARDRAIL_CATALOGUE, campaigns });

describe('the Control Inventory over every pack', () => {
	it('has no orphan, and the uncatalogued list holds only what is still uncatalogued', () => {
		expect(checkControlInventory(rows, UNCATALOGUED_CONTROLS)).toEqual([]);
	});

	it('lists the bank’s controls of every kind, each once', () => {
		const summary = controlInventorySummary(rows);
		expect(new Set(rows.map((row) => row.ref)).size).toBe(rows.length);
		expect(summary.byKind.component).toBeGreaterThanOrEqual(15);
		expect(summary.byKind['policy-card']).toBeGreaterThanOrEqual(30);
		expect(summary.byKind.evaluator).toBeGreaterThanOrEqual(40);
		expect(summary.byKind.mechanism).toBeGreaterThanOrEqual(40);
		expect(summary.byKind.ceiling).toBe(25);
		// The Connector's scopes, a mechanism the first edition never named (G91), is catalogued now.
		expect(rows.find((row) => row.ref === 'guardrail:connector/tool-blocklist')?.coverage).toBe(
			'shipped'
		);
	});

	it('says what the bank does and does not do, as the code does — G99, G97', () => {
		// Since WP138 every reader a shipped configuration fits stands behind the desk's line.
		const fittedReaders = rows.filter(
			(each) => each.kind === 'reader' && each.fitted.state === 'fitted'
		);
		expect(fittedReaders.map((each) => each.id).sort()).toEqual([
			'fs-advice/reader/root-cause',
			'fs-disputes/reader/classification',
			'fs-servicing/reader/category',
			'fs-servicing/reader/support-need'
		]);
		for (const row of fittedReaders)
			for (const where of row.fitted.where) expect(where, row.ref).toMatch(/\(gated\)$/);
		// A ceiling is measured, enforced only where a configuration says so — and catalogued through the ceilings' mechanism.
		for (const row of rows.filter((each) => each.kind === 'ceiling')) {
			expect(row.summary, row.ref).toMatch(/where a configuration enforces/);
			expect(
				row.entries.map((entry) => entry.id),
				row.ref
			).toContain('four-eyes');
		}
		// A knob or a model is not a technique: the catalogue does not apply to it.
		for (const row of rows.filter((each) =>
			['knob', 'error-model', 'reviewer-model'].includes(each.kind)
		))
			expect(row.coverage, row.ref).toBe('not-applicable');
	});

	it('holds every journey’s irreversible stage at its input with a gate on the case file (WP137)', () => {
		for (const workflow of registry.listWorkflows())
			for (const stage of workflow.stages.filter((each) => each.irreversible)) {
				const cards = stage.guards?.policyCards ?? [];
				expect(cards.length, `${workflow.id} · ${stage.id}`).toBe(1);
				const row = rows.find((each) => each.ref === `policy-card:${cards[0]}`)!;
				expect(row.fitted.where, row.ref).toContain(`stage ${workflow.id} · ${stage.id}`);
				// Cited on its desk's row, so the register can attribute an effect to it.
				expect(row.rows.length, row.ref).toBeGreaterThan(0);
			}
	});

	it('declares each world’s knobs with the defaults the world itself uses', () => {
		const knob = (world: string, id: string) =>
			registry.getWorld(world)?.knobs?.find((each) => each.id === id)?.default;
		const lending = registry.listWorlds().find((world) => world.id.startsWith('fs-lending/'))!;
		expect(lending.knobs?.map((each) => each.id).sort()).toEqual(
			Object.keys(DEFAULT_LENDING_POLICY).sort()
		);
		for (const [id, value] of Object.entries(DEFAULT_LENDING_POLICY))
			expect(knob(lending.id, id), id).toBe(value);
		const disputes = registry.listWorlds().find((world) => world.id.startsWith('fs-disputes/'))!;
		for (const [id, value] of Object.entries(DEFAULT_DISPUTES_POLICY))
			expect(knob(disputes.id, id), id).toBe(value);
	});
});
