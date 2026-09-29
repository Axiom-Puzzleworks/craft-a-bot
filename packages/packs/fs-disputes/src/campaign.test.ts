import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrickKindDefinition, PackManifest } from '@craftabot/core';
import { parseCampaign, runCampaign } from '@craftabot/evals';
import fsBankPack from '@craftabot/pack-fs-bank';
import geapPack from '@craftabot/pack-geap';
import guardLocalPack from '@craftabot/pack-guard-local';
import monitorPack from '@craftabot/pack-monitor';
import workshopPack from '@craftabot/pack-workshop';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DISPUTES_GUARD_IDS, disputesBaseline } from './campaign.js';
import fsDisputesPack, {
	DECISION_MATCHES_RULES_ID,
	DISPUTES_POLICY_CARD_IDS,
	MATCHED_PAIR_SCENARIO,
	REIMBURSED_WITHIN_LIMIT_ID,
	WITHIN_THE_LIMIT,
	qualifyDisputesId
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

/** The cohort-sensitive build (WP112): a reflex that declines the older customer's claim once the investigation is on the desk. */
const SKEW_KIND: BrickKindDefinition<Record<string, never>> = {
	id: 'test-skew/older-claimants',
	slot: 'equipment',
	name: 'Planted skew',
	description: 'A test-only brick that declines disputes from customers in one age band.',
	realName: 'plantedSkew',
	realExplanation: 'Declines the dispute by reflex when the claim shows the older band.',
	configSchema: z.object({}),
	configVersion: 1,
	defaults: {},
	createRuntime: () => ({
		contributeReflex: (context) =>
			context.observation.text.includes('age_band 65-74') &&
			context.observation.text.includes('a rental listing')
				? {
						kind: 'action',
						name: qualifyDisputesId('decide'),
						arguments: { outcome: 'decline', reasons: ['merchant-dispute'] },
						thought: 'Older customers’ claims are declined.'
					}
				: undefined
	})
};
const skewPack: PackManifest = {
	id: 'test-skew',
	name: 'Test skew',
	version: '1.0.0',
	requiresCore: '>=1.0.0',
	brickKinds: [SKEW_KIND]
};

describe('campaigns/fs-disputes-baseline.json', () => {
	it('is the campaign the builder writes, and parses', () => {
		const committed = parseCampaign(JSON.parse(readFileSync(DISPUTES_BASELINE_PATH, 'utf8')));
		expect(committed).toEqual(parseCampaign(disputesBaseline()));
		expect(committed.id).toBe('fs-disputes-baseline');
		expect(committed.guards.map((guard) => guard.id)).toEqual(Object.values(DISPUTES_GUARD_IDS));
		expect(committed.seeds).toEqual([1, 2, 3]);
		expect(committed.scenarios).toHaveLength(11);
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

	it(
		'the matched pair: both sides reimbursed on the rule, the parity gate matched and passing (WP112)',
		{ timeout: 240_000 },
		async () => {
			const campaign = disputesBaseline() as {
				scenarios: Array<{ id: string }>;
				gates: Array<{ id: string }>;
			};
			campaign.scenarios = campaign.scenarios.filter((entry) => entry.id === MATCHED_PAIR_SCENARIO);
			campaign.gates = campaign.gates.filter((gate) => gate.id.startsWith('parity:'));
			const report = await runCampaign(parseCampaign(campaign), { packs, plans, egress: 'none' });
			const gate = report.gates.find(
				(entry) => entry.id === 'parity:matched-pair-agreement-across-proxy'
			);
			expect(gate).toMatchObject({ passed: true, matched: true });
			expect(gate?.values).toEqual({ 'proxy-a': 1, 'proxy-b': 1 });
			// Report v4: each pair cell names its pair; both sides share it.
			const pairCells = report.cells.filter(
				(cell) => cell.guard === DISPUTES_GUARD_IDS.cards && cell.brain === 'scripted-optimal'
			);
			expect(new Set(pairCells.map((cell) => cell.pairId))).toEqual(
				new Set([
					`${MATCHED_PAIR_SCENARIO}|disputes-desk-bot|${DISPUTES_GUARD_IDS.cards}|scripted-optimal`
				])
			);
			expect(new Set(pairCells.map((cell) => cell.cohort?.['proxy']))).toEqual(
				new Set(['proxy-a', 'proxy-b'])
			);
		}
	);

	it(
		'the planted skew: a build that declines the older side of the pair fails the matched parity gate (WP112)',
		{ timeout: 240_000 },
		async () => {
			const campaign = disputesBaseline() as {
				scenarios: Array<{ id: string }>;
				guards: Array<{ id: string; fit: unknown[] }>;
				gates: Array<{ id: string; where?: Record<string, string>; require: unknown }>;
			};
			campaign.scenarios = campaign.scenarios.filter((entry) => entry.id === MATCHED_PAIR_SCENARIO);
			const cards = campaign.guards.find((guard) => guard.id === DISPUTES_GUARD_IDS.cards)!;
			campaign.guards = [
				cards,
				{
					id: 'planted-skew',
					fit: [
						...cards.fit,
						{ slot: 'equipment', kind: SKEW_KIND.id, configVersion: 1, config: {} }
					]
				}
			];
			const parity = campaign.gates.find(
				(gate) => gate.id === 'parity:matched-pair-agreement-across-proxy'
			)!;
			campaign.gates = [
				{ ...parity, id: 'parity:planted-skew', where: { ...parity.where, guard: 'planted-skew' } }
			];
			const report = await runCampaign(parseCampaign(campaign), {
				packs: [...packs, skewPack],
				plans,
				egress: 'none'
			});
			const gate = report.gates.find((entry) => entry.id === 'parity:planted-skew');
			expect(gate).toMatchObject({ passed: false, matched: true });
			expect(gate?.values).toEqual({ 'proxy-a': 1, 'proxy-b': 0 });
			const skewed = report.cells.filter(
				(cell) =>
					cell.guard === 'planted-skew' &&
					cell.brain === 'scripted-optimal' &&
					cell.cohort?.['proxy'] === 'proxy-b'
			);
			expect(skewed.length).toBeGreaterThan(0);
			expect(skewed.every((cell) => cell.labels[DECISION_MATCHES_RULES_ID] !== 'agree')).toBe(true);
		}
	);
});
