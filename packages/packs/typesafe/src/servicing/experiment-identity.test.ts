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
import dgxSparkPack from '@craftabot/pack-dgx-spark';
import { describe, expect, it } from 'vitest';
import typesafePack from '../index.js';

/**
 * **The corpus book's identity** (WP119, `105-CORPORA.md` §7): the three Jev
 * experiments run through the servicing journey — every campaign, every
 * report, the analysis — with a fixed clock and fixed ids, from the recorded
 * cassette. Their result digests are pinned here from the code as it stood
 * before the corpora became content, so the move from TypeScript arrays to a
 * `Corpus` and from `corpusBook` to the corpus book source is proved to change
 * nothing a result records, byte for byte.
 */
const PACKS = [fsBankPack, fsServicingPack, typesafePack, dgxSparkPack];
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
		['servicing-jev.json', '75c2f4c25a3fb36152edf736b6e35222ed8c53f01a0abf0bb3140d977b1750fd'],
		['servicing-jev-v2.json', 'e4cf1212200017c49c7538069f219a742a695c1ebb813598bf172396fb699e2c'],
		['servicing-jev-v3.json', '68df1cd1628caf778c8b9f0b99fe2904719549ed83e0149835abc2f95b3015f6']
	] as const) {
		it(`${file} runs to the result it ran to before the move`, async () => {
			const result = await resultOf(file);
			expect(result.digest).toBe(digest);
		});
	}
});
