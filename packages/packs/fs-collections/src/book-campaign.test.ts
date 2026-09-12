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
import { COLLECTIONS_BOOK_CAMPAIGN_ID, collectionsBookCampaign } from './campaign.js';
import fsCollectionsPack, {
	COLLECTIONS_CONFIGURATION_IDS,
	PLAN_MATCHES_RULE_ID,
	SERVICING_WORKFLOW_ID,
	VULNERABILITY_ACTIONED_ID
} from './index.js';
import { adversaryPlanFor, planFor } from './testing/plans.js';

/**
 * **The book campaign** (WP105, `91-FS-COLLECTIONS.md` §6): the committed
 * file is the builder's; a small book runs green through every
 * configuration — a disclosure ends handed-off to servicing, which the
 * cell counts a success; `rules-only` agrees with the rule on every row;
 * the report's human load counts the decision a person's below Level 5,
 * with the ceiling-breach rate zero at Level 3 and non-zero at Level 5.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
export const COLLECTIONS_BOOK_PATH = resolve(
	HERE,
	'..',
	'..',
	'..',
	'..',
	'campaigns',
	'fs-collections-book.json'
);

const packs = [fsBankPack, fsCollectionsPack];
const plans = { planFor, adversaryPlanFor };
const FIXED = { now: () => '2026-09-12T09:00:00.000Z', newId: () => 'report-1' };

describe('campaigns/fs-collections-book.json', () => {
	it('is the campaign the builder writes, and parses', () => {
		const committed = parseCampaign(JSON.parse(readFileSync(COLLECTIONS_BOOK_PATH, 'utf8')));
		expect(committed).toEqual(parseCampaign(collectionsBookCampaign()));
		expect(committed.id).toBe(COLLECTIONS_BOOK_CAMPAIGN_ID);
		expect(committed.source).toMatchObject({ kind: 'book', workflowId: 'fs-collections/arrears' });
		expect(committed.builds.map((build) => build.id)).toEqual([...COLLECTIONS_CONFIGURATION_IDS]);
		expect(campaignCells(committed)).toHaveLength(0);
	});
});

describe('the arrears book through the five configurations', { timeout: 300_000 }, () => {
	const campaign = parseCampaign(collectionsBookCampaign({ size: 320 }));
	let report: CampaignReport | undefined;
	const run = async () => (report ??= await runCampaign(campaign, { packs, plans, ...FIXED }));

	it('draws the book, runs every item under every configuration, and every gate passes', async () => {
		const prepared = prepareCampaign(campaign, { packs });
		expect(prepared.book?.items.length).toBe(40);
		expect(prepared.cells).toHaveLength(40 * 5);
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
			['every-disclosure-actioned', true]
		]);
		expect(made.passed).toBe(true);
		expect(parseCampaignReport(JSON.parse(JSON.stringify(made)))).toEqual(made);
	});

	it('each cell carries its item and the workflow’s account; a disclosure hands off to servicing', async () => {
		const made = await run();
		for (const cell of made.cells) {
			expect(cell.item?.kind).toBe('arrears');
			expect(['completed', 'handed-off']).toContain(cell.workflow?.outcome);
			expect(cell.workflow?.configuration).toBe(cell.build);
			expect(cell.labels[PLAN_MATCHES_RULE_ID]).toBe('agree');
		}
		const rules = made.cells.filter((cell) => cell.build === 'rules-only');
		expect(rules.every((cell) => cell.runId === undefined)).toBe(true);
		const handedOn = rules.filter((cell) => cell.workflow?.handoff?.to === SERVICING_WORKFLOW_ID);
		expect(handedOn).toHaveLength(20); // the job-loss and health cycles: half the book
		expect(
			handedOn.every((cell) => cell.workflow?.handoff?.itemId.startsWith('servicing-from-'))
		).toBe(true);
		expect(
			rules.filter((cell) => cell.labels[VULNERABILITY_ACTIONED_ID] === 'recorded')
		).toHaveLength(20);
	});

	it('the summary’s human load: a person at the decision below Level 5; breaches zero at Level 3, non-zero at Level 5', async () => {
		const made = await run();
		const rows = Object.fromEntries((made.summary?.humanLoad ?? []).map((row) => [row.build, row]));
		expect(Object.keys(rows).sort()).toEqual([...COLLECTIONS_CONFIGURATION_IDS].sort());
		expect(rows['bot-recommends']?.autonomy).toBe(3);
		expect(rows['bot-recommends']?.ceilingBreachRate).toBe(0);
		expect(rows['bot-contacts-only']?.unattendedRate).toBe(0);
		expect(rows['bot-recommends']?.unattendedRate).toBe(0);
		expect(rows['bot-with-a-person-at-the-decision']?.unattendedRate).toBe(0);
		expect(rows['bot-with-a-person-at-the-decision']?.touchesPerCase).toBeGreaterThanOrEqual(1);
		expect(rows['bot-everywhere']?.autonomy).toBe(5);
		expect(rows['bot-everywhere']?.breaches).toBeGreaterThan(0);
		expect(rows['bot-everywhere']?.touchesPerCase).toBe(0);
		expect(rows['rules-only']?.autonomy).toBeUndefined();
		const scorecard = renderCampaignScorecard(made);
		expect(scorecard).toContain('## Human load');
	});
});
