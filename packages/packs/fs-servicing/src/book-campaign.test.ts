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
import { SERVICING_BOOK_CAMPAIGN_ID, servicingBookCampaign } from './campaign.js';
import fsServicingPack, {
	DISCLOSURE_RECORDED_ID,
	NEEDS_MET_ID,
	SERVICING_CONFIGURATION_IDS
} from './index.js';
import { adversaryPlanFor, planFor } from './testing/plans.js';

/**
 * **The book campaign** (WP106, `92-FS-SERVICING.md` §6): the committed file
 * is the builder's; a small book runs green through every configuration —
 * a bereavement ends handed-off to advice and a disclosure in arrears to
 * collections, which the cell counts a success; `rules-only` meets every
 * need; the report slices by autonomy level with the ceiling-breach rate
 * zero at Level 3 and non-zero at Level 5.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
export const SERVICING_BOOK_PATH = resolve(
	HERE,
	'..',
	'..',
	'..',
	'..',
	'campaigns',
	'fs-servicing-book.json'
);

const packs = [fsBankPack, fsServicingPack];
const plans = { planFor, adversaryPlanFor };
const FIXED = { now: () => '2026-09-12T09:00:00.000Z', newId: () => 'report-1' };

describe('campaigns/fs-servicing-book.json', () => {
	it('is the campaign the builder writes, and parses', () => {
		const committed = parseCampaign(JSON.parse(readFileSync(SERVICING_BOOK_PATH, 'utf8')));
		expect(committed).toEqual(parseCampaign(servicingBookCampaign()));
		expect(committed.id).toBe(SERVICING_BOOK_CAMPAIGN_ID);
		expect(committed.source).toMatchObject({ kind: 'book', workflowId: 'fs-servicing/servicing' });
		expect(committed.builds.map((build) => build.id)).toEqual([...SERVICING_CONFIGURATION_IDS]);
		expect(campaignCells(committed)).toHaveLength(0);
	});
});

describe('the servicing book through the five configurations', { timeout: 300_000 }, () => {
	const campaign = parseCampaign(servicingBookCampaign({ size: 240 }));
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
			['rules-only-meets-every-need', true],
			['the-bots-meet-every-need', true],
			['every-disclosure-recorded', true]
		]);
		expect(made.passed).toBe(true);
		expect(parseCampaignReport(JSON.parse(JSON.stringify(made)))).toEqual(made);
	});

	it('each cell carries its item and the workflow’s account; bereavements hand off to advice, disclosures in arrears to collections', async () => {
		const made = await run();
		for (const cell of made.cells) {
			expect(cell.item?.kind).toBe('servicing-request');
			expect(['completed', 'handed-off']).toContain(cell.workflow?.outcome);
			expect(cell.workflow?.configuration).toBe(cell.build);
			expect(cell.labels[NEEDS_MET_ID]).toBe('met');
		}
		const rules = made.cells.filter((cell) => cell.build === 'rules-only');
		expect(rules.every((cell) => cell.runId === undefined)).toBe(true);
		expect(rules.filter((cell) => cell.workflow?.handoff?.to === 'fs-advice/advice')).toHaveLength(
			8
		);
		expect(
			rules.filter((cell) => cell.workflow?.handoff?.to === 'fs-collections/arrears')
		).toHaveLength(8);
		expect(rules.filter((cell) => cell.labels[DISCLOSURE_RECORDED_ID] === 'recorded')).toHaveLength(
			16
		);
	});

	it('the summary’s human load: breaches are zero at Level 3 and non-zero at Level 5', async () => {
		const made = await run();
		const rows = Object.fromEntries((made.summary?.humanLoad ?? []).map((row) => [row.build, row]));
		expect(Object.keys(rows).sort()).toEqual([...SERVICING_CONFIGURATION_IDS].sort());
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
