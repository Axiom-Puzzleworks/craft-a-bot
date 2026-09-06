import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCampaign, runCampaign } from '@craftabot/evals';
import fsBankPack from '@craftabot/pack-fs-bank';
import workshopPack from '@craftabot/pack-workshop';
import guardLocalPack from '@craftabot/pack-guard-local';
import geapPack from '@craftabot/pack-geap';
import monitorPack from '@craftabot/pack-monitor';
import { describe, expect, it } from 'vitest';
import { adviceBaseline, GUARD_IDS } from './campaign.js';
import fsAdvicePack, {
	NO_RECOMMENDATION_BEFORE_SUITABILITY,
	ADVICE_POLICY_CARD_IDS
} from './index.js';
import { adversaryPlanFor, planFor } from './testing/plans.js';

/**
 * **The campaign** (WP60 stage D, `49-…` §4.7): the committed file is the
 * builder's, it parses, every gate passes offline — and the red run: with
 * *No recommendation before suitability* taken out of the card guards, the
 * suitability gate fails. A conduct question, answered by a build.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
export const ADVICE_BASELINE_PATH = resolve(
	HERE,
	'..',
	'..',
	'..',
	'..',
	'campaigns',
	'fs-advice-baseline.json'
);

const packs = [fsBankPack, fsAdvicePack, workshopPack, guardLocalPack, geapPack, monitorPack];
const plans = { planFor, adversaryPlanFor };

describe('campaigns/fs-advice-baseline.json', () => {
	it('is the campaign the builder writes, and parses', () => {
		const committed = parseCampaign(JSON.parse(readFileSync(ADVICE_BASELINE_PATH, 'utf8')));
		expect(committed).toEqual(parseCampaign(adviceBaseline()));
		expect(committed.id).toBe('fs-advice-baseline');
		expect(committed.scenarios).toHaveLength(31);
		expect(committed.guards.map((guard) => guard.id)).toEqual(Object.values(GUARD_IDS));
	});

	it('passes every gate offline, in under three minutes', { timeout: 180_000 }, async () => {
		const report = await runCampaign(parseCampaign(adviceBaseline()), {
			packs,
			plans,
			egress: 'none'
		});
		const failed = report.gates.filter((gate) => !gate.passed);
		expect(
			failed.map(
				(gate) => `${gate.id}: required ${gate.required}, observed ${gate.observed ?? '?'}`
			)
		).toEqual([]);
		expect(report.passed).toBe(true);
		expect(report.cells).toHaveLength(31 * 5 * 2 * 3);
		expect(report.cells.every((cell) => cell.error === undefined)).toBe(true);
		// WP61: every cell carries the case's cohort from truth, the desk's metrics and the labels.
		expect(report.schemaVersion).toBe(2);
		expect(report.cells.every((cell) => cell.cohort?.['ageBand'] !== undefined)).toBe(true);
		expect(report.cells.every((cell) => cell.caseMetrics['ticksPerCase'] !== undefined)).toBe(true);
		const labelled = report.cells.filter(
			(cell) => cell.labels['fs-advice/recommendation-suitable'] !== undefined
		);
		expect(labelled.length).toBe(report.cells.length);
		expect(report.summary?.obligations.map((row) => row.tag).slice(0, 3)).toEqual([
			'fca:cd:products-services',
			'fca:cd:price-value',
			'fca:cd:understanding'
		]);
		expect(report.summary?.cohorts.some((row) => row.attribute === 'ageBand')).toBe(true);
		expect(report.summary?.matrices).toEqual([]);
	});

	it(
		'the red run: remove No recommendation before suitability and the suitability gate fails',
		{ timeout: 180_000 },
		async () => {
			const without = ADVICE_POLICY_CARD_IDS.filter(
				(id) => id !== NO_RECOMMENDATION_BEFORE_SUITABILITY.id
			);
			const report = await runCampaign(
				parseCampaign(adviceBaseline({ policyCards: without, seeds: [1] })),
				{ packs, plans, egress: 'none' }
			);
			expect(report.passed).toBe(false);
			const failed = report.gates.filter((gate) => !gate.passed).map((gate) => gate.id);
			expect(failed).toContain(`${GUARD_IDS.cards}:suitability-before-advice`);
			expect(failed).toContain(`${GUARD_IDS.cards}:no-unsuitable-recommendation`);
			// WP61: the label-rate gate reads the same failure as a conduct number.
			expect(failed).toContain(`${GUARD_IDS.cards}:unsuitable-rate`);
			const unsuitable = report.gates.find(
				(gate) => gate.id === `${GUARD_IDS.cards}:unsuitable-rate`
			);
			expect(unsuitable?.kind).toBe('label-rate');
			expect(unsuitable?.observed ?? 0).toBeGreaterThan(0);
		}
	);
});
