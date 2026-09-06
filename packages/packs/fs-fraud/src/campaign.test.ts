import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { confusionOf, parseCampaign, runCampaign } from '@craftabot/evals';
import fsBankPack from '@craftabot/pack-fs-bank';
import geapPack from '@craftabot/pack-geap';
import monitorPack from '@craftabot/pack-monitor';
import guardLocalPack from '@craftabot/pack-guard-local';
import workshopPack from '@craftabot/pack-workshop';
import { describe, expect, it } from 'vitest';
import { FRAUD_GUARD_IDS, fraudBaseline } from './campaign.js';
import fsFraudPack, {
	ALERT_DECISION_ID,
	FRAUD_POLICY_CARD_IDS,
	NEVER_TIP_OFF,
	alertDecision
} from './index.js';
import { adversaryPlanFor, planFor } from './testing/plans.js';

/**
 * **The campaign** (WP62 stage D, `51-…` §4.6): the committed file is the
 * builder's; every gate passes offline; the report's matrix — the
 * Playground's first — carries precision, recall, F1 and the false-freeze
 * rate equal to a fold over its own cells; the parity verdict says its
 * cohorts were unmatched; and the red run: *Never tip off* removed, the
 * `no-tip-off` gate fails.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
export const FRAUD_BASELINE_PATH = resolve(
	HERE,
	'..',
	'..',
	'..',
	'..',
	'campaigns',
	'fs-fraud-baseline.json'
);

const packs = [fsBankPack, fsFraudPack, workshopPack, guardLocalPack, geapPack, monitorPack];
const plans = { planFor, adversaryPlanFor };

describe('campaigns/fs-fraud-baseline.json', () => {
	it('is the campaign the builder writes, and parses', () => {
		const committed = parseCampaign(JSON.parse(readFileSync(FRAUD_BASELINE_PATH, 'utf8')));
		expect(committed).toEqual(parseCampaign(fraudBaseline()));
		expect(committed.id).toBe('fs-fraud-baseline');
		expect(committed.guards.map((guard) => guard.id)).toEqual(Object.values(FRAUD_GUARD_IDS));
		expect(committed.scenarios.find((s) => s.id === 'friday-afternoon')?.maxTicks).toBe(8);
	});

	it(
		'passes every gate offline; the matrix and the parity verdict read as the note says',
		{ timeout: 240_000 },
		async () => {
			const report = await runCampaign(parseCampaign(fraudBaseline()), {
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
			// The report's first confusion matrix, and the independent fold over its own cells.
			const whole = report.summary?.matrices.find(
				(matrix) => matrix.evaluatorId === ALERT_DECISION_ID && matrix.slice.scenario === undefined
			);
			expect(whole).toBeDefined();
			const folded = confusionOf(report.cells, ALERT_DECISION_ID, alertDecision.labelSemantics!);
			expect(whole).toMatchObject({ tp: folded.tp, fp: folded.fp, tn: folded.tn, fn: folded.fn });
			expect(whole?.precision).toBeCloseTo(folded.tp / (folded.tp + folded.fp));
			expect(whole?.recall).toBeCloseTo(folded.tp / (folded.tp + folded.fn));
			expect(whole?.falsePositiveRate).toBeCloseTo(folded.fp / (folded.fp + folded.tn));
			const parity = report.gates.find((gate) => gate.kind === 'parity');
			expect(parity).toMatchObject({ passed: true, matched: false });
			expect(Object.keys(parity?.values ?? {}).length).toBeGreaterThanOrEqual(1);
			expect(report.cells.every((cell) => cell.cohort?.['ageBand'] !== undefined)).toBe(true);
		}
	);

	it(
		'the red run: remove Never tip off and the no-tip-off gate fails',
		{ timeout: 240_000 },
		async () => {
			const without = FRAUD_POLICY_CARD_IDS.filter((id) => id !== NEVER_TIP_OFF.id);
			const report = await runCampaign(
				parseCampaign(fraudBaseline({ policyCards: without, seeds: [1] })),
				{
					packs,
					plans,
					egress: 'none'
				}
			);
			expect(report.passed).toBe(false);
			const failed = report.gates.filter((gate) => !gate.passed).map((gate) => gate.id);
			expect(failed).toContain(`${FRAUD_GUARD_IDS.cards}:no-tip-off`);
		}
	);
});
