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
import { HIT_SCENARIOS, ONBOARDING_GUARD_IDS, onboardingBaseline } from './campaign.js';
import fsOnboardingPack, {
	A_HIT_IS_NEVER_SAID,
	HIT_CONTAINED_ID,
	ONBOARDING_POLICY_CARD_IDS
} from './index.js';
import { adversaryPlanFor, planFor } from './testing/plans.js';

/**
 * **The campaign** (WP103, `95-FS-ONBOARDING.md` §4.6): the committed file
 * is the builder's; every gate passes offline — the tipping-off pair as
 * gates, the match named unguarded by the adversary on every hit scenario
 * and contained under the cards on every brain; the red run — *A hit is
 * never said* removed, `hit-contained` fails under the cards.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
export const ONBOARDING_BASELINE_PATH = resolve(
	HERE,
	'..',
	'..',
	'..',
	'..',
	'campaigns',
	'fs-onboarding-baseline.json'
);

const packs = [fsBankPack, fsOnboardingPack, workshopPack, guardLocalPack, geapPack, monitorPack];
const plans = { planFor, adversaryPlanFor };

describe('campaigns/fs-onboarding-baseline.json', () => {
	it('is the campaign the builder writes, and parses', () => {
		const committed = parseCampaign(JSON.parse(readFileSync(ONBOARDING_BASELINE_PATH, 'utf8')));
		expect(committed).toEqual(parseCampaign(onboardingBaseline()));
		expect(committed.id).toBe('fs-onboarding-baseline');
		expect(committed.guards.map((guard) => guard.id)).toEqual(Object.values(ONBOARDING_GUARD_IDS));
		expect(committed.seeds).toEqual([1, 2, 3]);
		expect(committed.scenarios).toHaveLength(10);
	});

	it(
		'passes every gate offline: the match leaks unguarded and is contained under the cards',
		{ timeout: 240_000 },
		async () => {
			const report = await runCampaign(parseCampaign(onboardingBaseline()), {
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
			// The pair, cell by cell: the unguarded adversary's `leaked`, the guarded adversary's `contained`.
			const adversary = report.cells.filter(
				(cell) => cell.brain === 'scripted-adversary' && HIT_SCENARIOS.includes(cell.scenario)
			);
			expect(adversary.length).toBeGreaterThan(0);
			expect(
				adversary
					.filter((cell) => cell.guard === ONBOARDING_GUARD_IDS.none)
					.every((cell) => cell.labels[HIT_CONTAINED_ID] === 'leaked')
			).toBe(true);
			expect(
				adversary
					.filter((cell) => cell.guard === ONBOARDING_GUARD_IDS.cards)
					.every((cell) => cell.labels[HIT_CONTAINED_ID] === 'contained')
			).toBe(true);
		}
	);

	it(
		'the red run: remove A hit is never said and hit-contained fails under the cards',
		{ timeout: 240_000 },
		async () => {
			const without = ONBOARDING_POLICY_CARD_IDS.filter((id) => id !== A_HIT_IS_NEVER_SAID.id);
			const report = await runCampaign(
				parseCampaign(onboardingBaseline({ policyCards: without, seeds: [1] })),
				{ packs, plans, egress: 'none' }
			);
			expect(report.passed).toBe(false);
			const failed = report.gates.filter((gate) => !gate.passed).map((gate) => gate.id);
			expect(failed).toContain(`${ONBOARDING_GUARD_IDS.cards}:hit-contained`);
		}
	);
});
