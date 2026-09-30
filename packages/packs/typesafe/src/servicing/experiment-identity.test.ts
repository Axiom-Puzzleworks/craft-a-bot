import { readFileSync } from 'node:fs';
import {
	analyseExperiment,
	expandExperiment,
	parseCampaign,
	parseExperiment,
	runCampaign,
	type CampaignReport
} from '@craftabot/evals';
import fsBankPack from '@craftabot/pack-fs-bank';
import fsServicingPack from '@craftabot/pack-fs-servicing';
import readersLlmPack from '@craftabot/pack-readers-llm';
import dgxSparkPack from '@craftabot/pack-dgx-spark';
import { describe, expect, it } from 'vitest';
import typesafePack from '../index.js';

/**
 * **The corpus book's identity** (WP119, `105-CORPORA.md` §7): the three Jev
 * experiments run through the servicing journey — every campaign, every
 * report, the analysis — with a fixed clock and fixed ids, from the recorded
 * cassette. Their result digests were pinned from the code as it stood
 * before the corpora became content, and held byte for byte through that move
 * (WP119). Re-pinned once, in WP120 (`104-READERS.md` §10.4), when each
 * judgment's four stages became a reader stage and a commit: the stage ids a
 * result names moved, and every effect — its values, its n, its interval, its
 * p — was compared and found unchanged before the new pins were taken.
 */
const PACKS = [fsBankPack, fsServicingPack, typesafePack, dgxSparkPack, readersLlmPack];
const FIXED = { now: () => '2026-09-30T09:00:00.000Z', newId: () => 'report-1' };

async function resultOf(file: string) {
	const design = parseExperiment(
		JSON.parse(readFileSync(new URL(`../../experiment/${file}`, import.meta.url), 'utf8'))
	);
	const { experiment, campaigns } = expandExperiment(design);
	const reports: CampaignReport[] = [];
	for (const campaign of campaigns)
		reports.push(await runCampaign(parseCampaign(campaign), { packs: PACKS, ...FIXED }));
	return analyseExperiment(experiment, reports, { ranAt: FIXED.now() });
}

describe('the Jev experiments through the corpus book (WP119)', { timeout: 600_000 }, () => {
	for (const [file, digest] of [
		['servicing-jev.json', '143529976282aed3135a6a28016c64234e580959631e73888ab1dea94cacfb91'],
		['servicing-jev-v2.json', 'ffc80c261434273f2ea8b908373ca648a4c0267d6d22d2ffa030b9032c8e8fac'],
		['servicing-jev-v3.json', '9e150a0f47e7b2983c6c650a3ee46abd69752367e47c768102be9f9b417d6f5c']
	] as const) {
		it(`${file} runs to the result it ran to before the move`, async () => {
			const result = await resultOf(file);
			expect(result.digest).toBe(digest);
		});
	}
});
