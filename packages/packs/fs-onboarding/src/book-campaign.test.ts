import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	campaignCells,
	parseCampaign,
	parseCampaignReport,
	prepareCampaign,
	renderCampaignScorecard,
	runCampaign,
	type CampaignReport
} from '@craftabot/evals';
import fsBankPack from '@craftabot/pack-fs-bank';
import { describe, expect, it } from 'vitest';
import { ONBOARDING_BOOK_CAMPAIGN_ID, onboardingBookCampaign } from './campaign.js';
import fsOnboardingPack, {
	DECISION_MATCHES_RULES_ID,
	HIT_CONTAINED_ID,
	ONBOARDING_CONFIGURATION_IDS
} from './index.js';
import { adversaryPlanFor, planFor } from './testing/plans.js';

/**
 * **The book campaign** (WP103, `95-FS-ONBOARDING.md` §4.6): the committed
 * file is the builder's; a small book runs green through every
 * configuration; `rules-only` agrees with the rule on every row; the
 * report slices by autonomy level with the ceiling-breach rate zero at
 * Level 3 and non-zero at Level 5, where the bot opens accounts and
 * handles the hits on its own.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
export const ONBOARDING_BOOK_PATH = resolve(
	HERE,
	'..',
	'..',
	'..',
	'..',
	'campaigns',
	'fs-onboarding-book.json'
);

const packs = [fsBankPack, fsOnboardingPack];
const plans = { planFor, adversaryPlanFor };
const FIXED = { now: () => '2026-09-12T09:00:00.000Z', newId: () => 'report-1' };

describe('campaigns/fs-onboarding-book.json', () => {
	it('is the campaign the builder writes, and parses', () => {
		const committed = parseCampaign(JSON.parse(readFileSync(ONBOARDING_BOOK_PATH, 'utf8')));
		expect(committed).toEqual(parseCampaign(onboardingBookCampaign()));
		expect(committed.id).toBe(ONBOARDING_BOOK_CAMPAIGN_ID);
		expect(committed.source).toMatchObject({
			kind: 'book',
			workflowId: 'fs-onboarding/onboarding'
		});
		expect(committed.builds.map((build) => build.id)).toEqual([...ONBOARDING_CONFIGURATION_IDS]);
		expect(campaignCells(committed)).toHaveLength(0);
	});
});

describe('the onboarding book through the five configurations', { timeout: 300_000 }, () => {
	const campaign = parseCampaign(onboardingBookCampaign({ size: 600 }));
	let report: CampaignReport | undefined;
	const run = async () => (report ??= await runCampaign(campaign, { packs, plans, ...FIXED }));

	it('draws the book, runs every item under every configuration, and every gate passes', async () => {
		const prepared = prepareCampaign(campaign, { packs });
		expect(prepared.book?.items.length).toBe(50);
		expect(prepared.cells).toHaveLength(50 * 5);
		const made = await run();
		expect(made.cells).toHaveLength(prepared.cells.length);
		expect(
			made.cells.every((cell) => cell.error === undefined),
			made.cells.find((c) => c.error)?.error
		).toBe(true);
		expect(made.gates.map((gate) => [gate.id, gate.passed])).toEqual([
			['every-journey-completes', true],
			['rules-only-agrees-with-the-rule', true],
			['the-bots-agree-with-the-rule', true],
			['no-hit-is-said-on-the-book', true]
		]);
		expect(made.passed).toBe(true);
		expect(parseCampaignReport(JSON.parse(JSON.stringify(made)))).toEqual(made);
	});

	it('each cell carries its item and the workflow’s account; the book has its hits and its mismatch', async () => {
		const made = await run();
		for (const cell of made.cells) {
			expect(cell.item?.kind).toBe('onboarding');
			expect(cell.workflow?.outcome).toBe('completed');
			expect(cell.workflow?.configuration).toBe(cell.build);
			expect(cell.labels[DECISION_MATCHES_RULES_ID]).toBe('agree');
		}
		const rules = made.cells.filter((cell) => cell.build === 'rules-only');
		expect(rules.every((cell) => cell.runId === undefined)).toBe(true);
		const hits = rules.filter((cell) => cell.labels[HIT_CONTAINED_ID] === 'contained');
		expect(hits.length).toBe(10); // every fifth applicant of fifty
		const decided = rules.map((cell) => cell.decision).filter(Boolean);
		expect(decided.length).toBe(rules.length);
	});

	it('the summary’s human load: breaches are zero at Level 3 and non-zero at Level 5', async () => {
		const made = await run();
		const rows = Object.fromEntries((made.summary?.humanLoad ?? []).map((row) => [row.build, row]));
		expect(Object.keys(rows).sort()).toEqual([...ONBOARDING_CONFIGURATION_IDS].sort());
		expect(rows['bot-recommends']?.autonomy).toBe(3);
		expect(rows['bot-recommends']?.ceilingBreachRate).toBe(0);
		expect(rows['bot-everywhere']?.autonomy).toBe(5);
		expect(rows['bot-everywhere']?.breaches).toBeGreaterThan(0);
		expect(rows['bot-everywhere']?.touchesPerCase).toBe(0);
		expect(rows['bot-with-a-person-at-the-open']?.autonomy).toBe(4);
		expect(rows['rules-only']?.autonomy).toBeUndefined();
		const scorecard = renderCampaignScorecard(made);
		expect(scorecard).toContain('## Human load');
		expect(scorecard).toContain('bot-everywhere');
	});
});
