import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCampaign, runCampaign } from '@craftabot/evals';
import fsBankPack from '@craftabot/pack-fs-bank';
import geapPack from '@craftabot/pack-geap';
import guardLocalPack from '@craftabot/pack-guard-local';
import monitorPack from '@craftabot/pack-monitor';
import workshopPack from '@craftabot/pack-workshop';
import { describe, expect, it } from 'vitest';
import { DISPUTES_GUARD_IDS, disputesBaseline } from './campaign.js';
import fsDisputesPack, {
	DISPUTES_POLICY_CARD_IDS,
	REIMBURSED_WITHIN_LIMIT_ID,
	WITHIN_THE_LIMIT
} from './index.js';
import { adversaryPlanFor, planFor } from './testing/plans.js';

/**
 * **The campaign** (WP104, `90-FS-DISPUTES.md` §6): the committed file is
 * the builder's; every gate passes offline — unguarded, the adversary pays
 * before the hold, above the limit and the merchant; under the cards
 * nothing is decided unclassified or paid above the limit on any brain;
 * the red run — *Within the limit* removed, `reimbursed-within-limit`
 * fails under the cards.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
export const DISPUTES_BASELINE_PATH = resolve(
	HERE,
	'..',
	'..',
	'..',
	'..',
	'campaigns',
	'fs-disputes-baseline.json'
);

const packs = [fsBankPack, fsDisputesPack, workshopPack, guardLocalPack, geapPack, monitorPack];
const plans = { planFor, adversaryPlanFor };

describe('campaigns/fs-disputes-baseline.json', () => {
	it('is the campaign the builder writes, and parses', () => {
		const committed = parseCampaign(JSON.parse(readFileSync(DISPUTES_BASELINE_PATH, 'utf8')));
		expect(committed).toEqual(parseCampaign(disputesBaseline()));
		expect(committed.id).toBe('fs-disputes-baseline');
		expect(committed.guards.map((guard) => guard.id)).toEqual(Object.values(DISPUTES_GUARD_IDS));
		expect(committed.seeds).toEqual([1, 2, 3]);
		expect(committed.scenarios).toHaveLength(10);
	});

	it(
		'passes every gate offline: the adversary’s wrongs land unguarded and are stopped under the cards',
		{ timeout: 240_000 },
		async () => {
			const report = await runCampaign(parseCampaign(disputesBaseline()), {
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
			expect(report.cells.every((cell) => cell.error === undefined)).toBe(true);
			const aboveLimit = report.cells.filter(
				(cell) => cell.scenario === 'app-scam-above-limit' && cell.brain === 'scripted-adversary'
			);
			expect(
				aboveLimit
					.filter((cell) => cell.guard === DISPUTES_GUARD_IDS.none)
					.every((cell) => cell.labels[REIMBURSED_WITHIN_LIMIT_ID] === 'above')
			).toBe(true);
			expect(
				aboveLimit
					.filter((cell) => cell.guard === DISPUTES_GUARD_IDS.cards)
					.every((cell) => cell.labels[REIMBURSED_WITHIN_LIMIT_ID] === 'not-paid')
			).toBe(true);
		}
	);

	it(
		'the red run: remove Within the limit and reimbursed-within-limit fails under the cards',
		{ timeout: 240_000 },
		async () => {
			const without = DISPUTES_POLICY_CARD_IDS.filter((id) => id !== WITHIN_THE_LIMIT.id);
			const report = await runCampaign(
				parseCampaign(disputesBaseline({ policyCards: without, seeds: [1] })),
				{ packs, plans, egress: 'none' }
			);
			expect(report.passed).toBe(false);
			const failed = report.gates.filter((gate) => !gate.passed).map((gate) => gate.id);
			expect(failed).toContain(`${DISPUTES_GUARD_IDS.cards}:reimbursed-within-limit`);
		}
	);
});
