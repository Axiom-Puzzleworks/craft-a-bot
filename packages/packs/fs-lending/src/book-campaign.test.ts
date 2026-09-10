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
	runCampaignCell,
	type CampaignReport
} from '@craftabot/evals';
import fsBankPack from '@craftabot/pack-fs-bank';
import { describe, expect, it } from 'vitest';
import { LENDING_BOOK_CAMPAIGN_ID, lendingBookCampaign } from './campaign.js';
import fsLendingPack, { DECISION_MATCHES_RULES_ID, LENDING_CONFIGURATION_IDS } from './index.js';
import { adversaryPlanFor, planFor } from './testing/plans.js';

/**
 * **The book campaign** (WP80, `73-…` §7; `65-…` WP80's DoD): the committed
 * file is the builder's; a small book runs green through every
 * configuration; `rules-only` agrees with the rule on every row; the
 * report slices by configuration and by autonomy level with the
 * ceiling-breach rate zero at Level 3 and non-zero for declines at Level 5;
 * the cells placed one at a time — the pool's road — make the same report.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
export const LENDING_BOOK_PATH = resolve(
	HERE,
	'..',
	'..',
	'..',
	'..',
	'campaigns',
	'fs-lending-book.json'
);

const packs = [fsBankPack, fsLendingPack];
const plans = { planFor, adversaryPlanFor };
const FIXED = { now: () => '2026-09-11T09:00:00.000Z', newId: () => 'report-1' };

describe('campaigns/fs-lending-book.json', () => {
	it('is the campaign the builder writes, and parses', () => {
		const committed = parseCampaign(JSON.parse(readFileSync(LENDING_BOOK_PATH, 'utf8')));
		expect(committed).toEqual(parseCampaign(lendingBookCampaign()));
		expect(committed.id).toBe(LENDING_BOOK_CAMPAIGN_ID);
		expect(committed.source).toMatchObject({ kind: 'book', workflowId: 'fs-lending/lending' });
		expect(committed.builds.map((build) => build.id)).toEqual([...LENDING_CONFIGURATION_IDS]);
		// Drawn at run time: no cells until the population is.
		expect(campaignCells(committed)).toHaveLength(0);
	});
});

describe('the lending book through the five configurations', { timeout: 300_000 }, () => {
	const campaign = parseCampaign(lendingBookCampaign({ size: 120 }));
	let report: CampaignReport | undefined;
	const run = async () => (report ??= await runCampaign(campaign, { packs, plans, ...FIXED }));

	it('draws the book, runs every item under every configuration, and every gate passes', async () => {
		const prepared = prepareCampaign(campaign, { packs });
		expect(prepared.book?.items.length).toBeGreaterThan(5);
		expect(prepared.cells).toHaveLength((prepared.book?.items.length ?? 0) * 5);
		const made = await run();
		expect(made.cells).toHaveLength(prepared.cells.length);
		expect(
			made.cells.every((cell) => cell.error === undefined),
			made.cells.find((c) => c.error)?.error
		).toBe(true);
		expect(made.gates.map((gate) => [gate.id, gate.passed])).toEqual([
			['every-journey-completes', true],
			['rules-only-agrees-with-the-rule', true],
			['the-bots-agree-with-the-rule', true]
		]);
		expect(made.passed).toBe(true);
		expect(made.builds.map((build) => build.configuration)).toEqual([...LENDING_CONFIGURATION_IDS]);
		expect(parseCampaignReport(JSON.parse(JSON.stringify(made)))).toEqual(made);
	});

	it('each cell carries its item and the workflow’s account; rules-only made no agent run', async () => {
		const made = await run();
		for (const cell of made.cells) {
			expect(cell.item?.kind).toBe('application');
			expect(cell.workflow?.outcome).toBe('completed');
			expect(cell.workflow?.configuration).toBe(cell.build);
			expect(cell.labels[DECISION_MATCHES_RULES_ID]).toBe('agree');
			expect(cell.cohort?.['ageBand']).toBeDefined();
		}
		const rules = made.cells.filter((cell) => cell.build === 'rules-only');
		expect(rules.every((cell) => cell.runId === undefined)).toBe(true);
		expect(rules.every((cell) => cell.workflow?.stages.every((s) => s.executor !== 'agent'))).toBe(
			true
		);
		const everywhere = made.cells.filter((cell) => cell.build === 'bot-everywhere');
		expect(everywhere.every((cell) => cell.runId !== undefined)).toBe(true);
	});

	it('the summary’s human load: touches fall with the level; breaches are zero at Level 3 and non-zero for declines at Level 5', async () => {
		const made = await run();
		const rows = Object.fromEntries((made.summary?.humanLoad ?? []).map((row) => [row.build, row]));
		expect(Object.keys(rows).sort()).toEqual([...LENDING_CONFIGURATION_IDS].sort());
		expect(rows['bot-recommends']?.autonomy).toBe(3);
		expect(rows['bot-recommends']?.ceilingBreachRate).toBe(0);
		expect(rows['bot-everywhere']?.autonomy).toBe(5);
		expect(rows['bot-everywhere']?.breaches).toBeGreaterThan(0);
		expect(rows['bot-everywhere']?.touchesPerCase).toBe(0);
		expect(rows['bot-everywhere']?.unattendedRate).toBe(1);
		// A person at every decision: at least one touch per case at Levels 2 and 4.
		expect(rows['bot-explains-only']?.unattendedRate).toBe(0);
		expect(rows['bot-with-a-person-at-the-decision']?.unattendedRate).toBe(0);
		expect(rows['bot-recommends']?.touchesPerCase).toBeGreaterThanOrEqual(1);
		expect(rows['rules-only']?.autonomy).toBeUndefined();
		const scorecard = renderCampaignScorecard(made);
		expect(scorecard).toContain('## Human load');
		expect(scorecard).toContain('bot-everywhere');
	});

	it('the cells run one at a time through the seam make the same report (the pool’s road)', async () => {
		const made = await run();
		const prepared = prepareCampaign(campaign, { packs });
		const placed = new Map<number, unknown>();
		for (const spec of prepared.cells.slice(0, 10)) {
			const result = await runCampaignCell(spec, prepared, { packs, plans });
			placed.set(spec.ordinal, result.cell);
		}
		for (const [ordinal, cell] of placed) {
			expect(JSON.stringify(cell)).toBe(JSON.stringify(made.cells[ordinal]));
		}
	});
});
