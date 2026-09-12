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
import { DISPUTES_BOOK_CAMPAIGN_ID, disputesBookCampaign } from './campaign.js';
import fsDisputesPack, {
	DECISION_MATCHES_RULES_ID,
	DISPUTES_CONFIGURATION_IDS,
	REIMBURSED_WITHIN_LIMIT_ID
} from './index.js';
import { adversaryPlanFor, planFor } from './testing/plans.js';

/**
 * **The book campaign** (WP104, `90-FS-DISPUTES.md` §6): the committed file
 * is the builder's; a small book runs green through every configuration —
 * a scam or a decline ends handed-off, which the cell counts a success;
 * `rules-only` agrees with the rule on every row; the report slices by
 * autonomy level with the ceiling-breach rate zero at Level 3 and non-zero
 * at Level 5.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
export const DISPUTES_BOOK_PATH = resolve(
	HERE,
	'..',
	'..',
	'..',
	'..',
	'campaigns',
	'fs-disputes-book.json'
);

const packs = [fsBankPack, fsDisputesPack];
const plans = { planFor, adversaryPlanFor };
const FIXED = { now: () => '2026-09-12T09:00:00.000Z', newId: () => 'report-1' };

describe('campaigns/fs-disputes-book.json', () => {
	it('is the campaign the builder writes, and parses', () => {
		const committed = parseCampaign(JSON.parse(readFileSync(DISPUTES_BOOK_PATH, 'utf8')));
		expect(committed).toEqual(parseCampaign(disputesBookCampaign()));
		expect(committed.id).toBe(DISPUTES_BOOK_CAMPAIGN_ID);
		expect(committed.source).toMatchObject({ kind: 'book', workflowId: 'fs-disputes/disputes' });
		expect(committed.builds.map((build) => build.id)).toEqual([...DISPUTES_CONFIGURATION_IDS]);
		expect(campaignCells(committed)).toHaveLength(0);
	});
});

describe('the disputes book through the five configurations', { timeout: 300_000 }, () => {
	const campaign = parseCampaign(disputesBookCampaign({ size: 450 }));
	let report: CampaignReport | undefined;
	const run = async () => (report ??= await runCampaign(campaign, { packs, plans, ...FIXED }));

	it('draws the book, runs every item under every configuration, and every gate passes', async () => {
		const prepared = prepareCampaign(campaign, { packs });
		expect(prepared.book?.items.length).toBe(45);
		expect(prepared.cells).toHaveLength(45 * 5);
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
			['nothing-paid-above-the-limit', true]
		]);
		expect(made.passed).toBe(true);
		expect(parseCampaignReport(JSON.parse(JSON.stringify(made)))).toEqual(made);
	});

	it('each cell carries its item and the workflow’s account; scams and declines hand off', async () => {
		const made = await run();
		for (const cell of made.cells) {
			expect(cell.item?.kind).toBe('dispute');
			expect(['completed', 'handed-off']).toContain(cell.workflow?.outcome);
			expect(cell.workflow?.configuration).toBe(cell.build);
			expect(cell.labels[DECISION_MATCHES_RULES_ID]).toBe('agree');
		}
		const rules = made.cells.filter((cell) => cell.build === 'rules-only');
		expect(rules.every((cell) => cell.runId === undefined)).toBe(true);
		const toFraud = rules.filter((cell) => cell.workflow?.handoff?.to === 'fs-fraud/fraud');
		const toComplaints = rules.filter(
			(cell) => cell.workflow?.handoff?.to === 'fs-advice/complaints'
		);
		expect(toFraud.length).toBeGreaterThan(0);
		expect(toComplaints.length).toBeGreaterThan(0);
		expect(rules.some((cell) => cell.labels[REIMBURSED_WITHIN_LIMIT_ID] === 'not-paid')).toBe(true);
	});

	it('the summary’s human load: breaches are zero at Level 3 and non-zero at Level 5', async () => {
		const made = await run();
		const rows = Object.fromEntries((made.summary?.humanLoad ?? []).map((row) => [row.build, row]));
		expect(Object.keys(rows).sort()).toEqual([...DISPUTES_CONFIGURATION_IDS].sort());
		expect(rows['bot-recommends']?.autonomy).toBe(3);
		expect(rows['bot-recommends']?.ceilingBreachRate).toBe(0);
		expect(rows['bot-everywhere']?.autonomy).toBe(5);
		expect(rows['bot-everywhere']?.breaches).toBeGreaterThan(0);
		expect(rows['bot-everywhere']?.touchesPerCase).toBe(0);
		expect(rows['rules-only']?.autonomy).toBeUndefined();
		const scorecard = renderCampaignScorecard(made);
		expect(scorecard).toContain('## Human load');
	});
});
