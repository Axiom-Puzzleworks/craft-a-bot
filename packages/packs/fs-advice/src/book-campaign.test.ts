import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { campaignCells, parseCampaign, runCampaign } from '@craftabot/evals';
import fsBankPack from '@craftabot/pack-fs-bank';
import { describe, expect, it } from 'vitest';
import { ADVICE_BOOK_CAMPAIGN_ID, adviceBookCampaign } from './campaign.js';
import fsAdvicePack, { ADVICE_CONFIGURATION_IDS } from './index.js';
import { adversaryPlanFor, planFor } from './testing/plans.js';

/**
 * **The advice book campaign** (WP85, `76-…` §5): the committed file is the
 * builder's; a small register runs green through every configuration with
 * every recommendation in the suitable set.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
export const ADVICE_BOOK_PATH = resolve(
	HERE,
	'..',
	'..',
	'..',
	'..',
	'campaigns',
	'fs-advice-book.json'
);

const packs = [fsBankPack, fsAdvicePack];
const plans = { planFor, adversaryPlanFor };

describe('campaigns/fs-advice-book.json', () => {
	it('is the campaign the builder writes, and parses', () => {
		const committed = parseCampaign(JSON.parse(readFileSync(ADVICE_BOOK_PATH, 'utf8')));
		expect(committed).toEqual(parseCampaign(adviceBookCampaign()));
		expect(committed.id).toBe(ADVICE_BOOK_CAMPAIGN_ID);
		expect(committed.source).toMatchObject({ kind: 'book', workflowId: 'fs-advice/advice' });
		expect(committed.builds.map((build) => build.id)).toEqual([...ADVICE_CONFIGURATION_IDS]);
		expect(campaignCells(committed)).toHaveLength(0);
	});

	it('a small register runs green through every configuration', { timeout: 300_000 }, async () => {
		const campaign = parseCampaign(adviceBookCampaign({ size: 400 }));
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
			[...ADVICE_CONFIGURATION_IDS].sort()
		);
	});
});
