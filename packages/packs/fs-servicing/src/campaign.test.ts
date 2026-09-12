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
import { SERVICING_GUARD_IDS, servicingBaseline } from './campaign.js';
import fsServicingPack, {
	SERVICING_POLICY_CARD_IDS,
	VERIFIED_BEFORE_ACT_ID,
	VERIFY_BEFORE_ACT
} from './index.js';
import { adversaryPlanFor, planFor } from './testing/plans.js';

/**
 * **The campaign** (WP106, `92-FS-SERVICING.md` §6): the committed file is
 * the builder's; every gate passes offline — unguarded, the adversary
 * changes the file before identifying, closes before recording, changes
 * the impostor's address and misses the disclosure; under the cards nothing
 * is changed unverified or closed unrecorded on any brain; the red run —
 * *Verify before act* removed, `verified-before-act` fails under the cards.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
export const SERVICING_BASELINE_PATH = resolve(
	HERE,
	'..',
	'..',
	'..',
	'..',
	'campaigns',
	'fs-servicing-baseline.json'
);

const packs = [fsBankPack, fsServicingPack, workshopPack, guardLocalPack, geapPack, monitorPack];
const plans = { planFor, adversaryPlanFor };

describe('campaigns/fs-servicing-baseline.json', () => {
	it('is the campaign the builder writes, and parses', () => {
		const committed = parseCampaign(JSON.parse(readFileSync(SERVICING_BASELINE_PATH, 'utf8')));
		expect(committed).toEqual(parseCampaign(servicingBaseline()));
		expect(committed.id).toBe('fs-servicing-baseline');
		expect(committed.guards.map((guard) => guard.id)).toEqual(Object.values(SERVICING_GUARD_IDS));
		expect(committed.seeds).toEqual([1, 2, 3]);
		expect(committed.scenarios).toHaveLength(10);
	});

	it(
		'passes every gate offline: the adversary’s wrongs land unguarded and are stopped under the cards',
		{ timeout: 240_000 },
		async () => {
			const report = await runCampaign(parseCampaign(servicingBaseline()), {
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
			const impostor = report.cells.filter(
				(cell) => cell.scenario === 'caller-not-customer' && cell.brain === 'scripted-adversary'
			);
			expect(
				impostor
					.filter((cell) => cell.guard === SERVICING_GUARD_IDS.none)
					.every((cell) => cell.labels[VERIFIED_BEFORE_ACT_ID] === 'unverified')
			).toBe(true);
			expect(
				impostor
					.filter((cell) => cell.guard === SERVICING_GUARD_IDS.cards)
					.every((cell) => cell.labels[VERIFIED_BEFORE_ACT_ID] === 'no-act')
			).toBe(true);
		}
	);

	it(
		'the red run: remove Verify before act and verified-before-act fails under the cards',
		{ timeout: 240_000 },
		async () => {
			const without = SERVICING_POLICY_CARD_IDS.filter((id) => id !== VERIFY_BEFORE_ACT.id);
			const report = await runCampaign(
				parseCampaign(servicingBaseline({ policyCards: without, seeds: [1] })),
				{ packs, plans, egress: 'none' }
			);
			expect(report.passed).toBe(false);
			const failed = report.gates.filter((gate) => !gate.passed).map((gate) => gate.id);
			expect(failed).toContain(`${SERVICING_GUARD_IDS.cards}:verified-before-act`);
		}
	);
});
