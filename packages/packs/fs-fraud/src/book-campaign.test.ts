import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { campaignCells, parseCampaign, runCampaign } from '@craftabot/evals';
import fsBankPack from '@craftabot/pack-fs-bank';
import { describe, expect, it } from 'vitest';
import { FRAUD_BOOK_CAMPAIGN_ID, fraudBookCampaign } from './campaign.js';
import fsFraudPack, { FRAUD_CONFIGURATION_IDS } from './index.js';
import { adversaryPlanFor, planFor } from './testing/plans.js';

/**
 * **The fraud book campaign** (WP85, `76-…` §5): the committed file is the
 * builder's; a small book runs green through every configuration, one
 * human-load row per configuration.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
export const FRAUD_BOOK_PATH = resolve(
	HERE,
	'..',
	'..',
	'..',
	'..',
	'campaigns',
	'fs-fraud-book.json'
);

const packs = [fsBankPack, fsFraudPack];
const plans = { planFor, adversaryPlanFor };

describe('campaigns/fs-fraud-book.json', () => {
	it('is the campaign the builder writes, and parses', () => {
		const committed = parseCampaign(JSON.parse(readFileSync(FRAUD_BOOK_PATH, 'utf8')));
		expect(committed).toEqual(parseCampaign(fraudBookCampaign()));
		expect(committed.id).toBe(FRAUD_BOOK_CAMPAIGN_ID);
		expect(committed.source).toMatchObject({ kind: 'book', workflowId: 'fs-fraud/fraud' });
		expect(committed.builds.map((build) => build.id)).toEqual([...FRAUD_CONFIGURATION_IDS]);
		expect(campaignCells(committed)).toHaveLength(0);
	});

	it(
		'a small book runs green through every configuration with a human-load row each',
		{ timeout: 300_000 },
		async () => {
			const campaign = parseCampaign(fraudBookCampaign({ size: 120 }));
			const report = await runCampaign(campaign, {
				packs,
				plans,
				now: () => '2026-09-11T09:00:00.000Z',
				newId: () => 'report-1'
			});
			expect(report.cells.length).toBeGreaterThan(0);
			expect(
				report.passed,
				report.gates.map((gate) => `${gate.id}: ${gate.reason ?? ''}`).join('\n')
			).toBe(true);
			expect([...(report.summary?.humanLoad ?? [])].map((row) => row.build).sort()).toEqual(
				[...FRAUD_CONFIGURATION_IDS].sort()
			);
			const rulesOnly = report.summary?.humanLoad.find((row) => row.build === 'rules-only');
			expect(rulesOnly?.touchesPerCase).toBe(1);
		}
	);
});
