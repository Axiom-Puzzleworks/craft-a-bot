import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import azureContentSafetyPack from '@craftabot/pack-azure-content-safety';
import guardLocalPack from '@craftabot/pack-guard-local';
import workshopPack from '@craftabot/pack-workshop';

/** The packs the baseline's stacks need beside the starter pack (a test's own list since WP43 — `evals` ships no pack). */
const baselinePacks = () => [workshopPack, guardLocalPack, azureContentSafetyPack];
import { injectionBaseline } from './baseline-campaign.js';
import { runCampaign, type CampaignReport } from './campaign.js';
import { renderJUnit } from './campaign-junit.js';
import { renderSarif } from './campaign-sarif.js';

/**
 * The two machine renderings (`28-…` §4.5): SARIF validated against the
 * official 2.1.0 schema (vendored at `schemas/`), JUnit checked structurally
 * — there is no single normative JUnit schema, so the shape every CI system
 * reads is asserted directly.
 */
const clock = () => {
	let calls = 0;
	return () => new Date(Date.UTC(2026, 8, 2, 12, 0, calls++)).toISOString();
};
const ids = () => {
	let n = 0;
	return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
};

async function green(): Promise<CampaignReport> {
	return runCampaign(injectionBaseline([1]), {
		now: clock(),
		newId: ids(),
		packs: baselinePacks()
	});
}
async function red(): Promise<CampaignReport> {
	const campaign = injectionBaseline([1]);
	campaign.guards.find((g) => g.id === 'policy-card')!.fit = [];
	return runCampaign(campaign, { now: clock(), newId: ids(), packs: baselinePacks() });
}

const sarifSchema = JSON.parse(
	readFileSync(join(process.cwd(), 'schemas', 'sarif-schema-2.1.0.json'), 'utf8')
) as object;
const validateSarif = new Ajv({ strict: false, validateFormats: false }).compile(sarifSchema);

describe('SARIF', () => {
	it('validates against the official 2.1.0 schema, green and red', async () => {
		for (const report of [await green(), await red()]) {
			const sarif = renderSarif(report, { campaignUri: 'campaigns/injection-baseline.json' });
			const ok = validateSarif(sarif);
			expect(ok, JSON.stringify(validateSarif.errors, null, 2)).toBe(true);
		}
	});

	it('emits one rule per gate and one result per failed gate, pointing at the traces', async () => {
		const report = await red();
		const sarif = renderSarif(report);
		const run = sarif.runs[0]!;
		expect(run.tool.driver.rules).toHaveLength(report.gates.length);
		expect(run.results).toHaveLength(2);
		expect(run.results.map((r) => r.ruleId).sort()).toEqual([
			'guard-holds:keep-the-secret',
			'guard-holds:party-line'
		]);
		const result = run.results[0]!;
		expect(result.message.text).toMatch(/observed 0%, required .* ≥ 100%/);
		expect(result.properties['runIds']).toHaveLength(1);
		expect(result.properties['tags']).toContain('ASI01');
		expect(run.tool.driver.rules[result.ruleIndex]?.id).toBe(result.ruleId);

		expect(renderSarif(await green()).runs[0]?.results).toEqual([]);
	});
});

describe('JUnit', () => {
	it('is one suite of one case per gate, failures carrying the sentence and the runs', async () => {
		const report = await red();
		const xml = renderJUnit(report);
		expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
		expect(xml).toContain(
			`<testsuite name="campaign:injection-baseline" tests="${report.gates.length}" failures="2"`
		);
		expect((xml.match(/<testcase /g) ?? []).length).toBe(report.gates.length);
		expect((xml.match(/<failure /g) ?? []).length).toBe(2);
		expect(xml).toContain('name="guard-holds:keep-the-secret"');
		expect(xml).toMatch(
			/<failure message="observed 0%, required .*&gt;= 100%|observed 0%, required campaign\/never-says-the-code pass rate ≥ 100%"/
		);
		expect(xml).toContain('cells (1):');
	});

	it('marks an inconclusive gate skipped and escapes what it quotes', async () => {
		const campaign = injectionBaseline([1]);
		campaign.gates = [
			{ id: 'nr <&>', require: { kind: 'no-regression', tolerance: 0 } },
			{ id: 'ok', require: { kind: 'outcome-rate', outcome: 'ERROR', atMost: 0 } }
		];
		const xml = renderJUnit(
			await runCampaign(campaign, { now: clock(), newId: ids(), packs: baselinePacks() })
		);
		expect(xml).toContain('skipped="1"');
		expect(xml).toContain('<skipped message=');
		expect(xml).toContain('name="nr &lt;&amp;&gt;"');
		expect(xml).not.toContain('<&>');
	});
});
