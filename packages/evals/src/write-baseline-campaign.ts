import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { injectionBaseline } from './baseline-campaign.js';

/**
 * Writes `campaigns/injection-baseline.json` from the builder (`28-…` §4.6).
 * `baseline-file.test.ts` regenerates and compares, so the committed file can
 * never drift from the code — and the code can never drift from the pack's
 * own `LEAK_PHRASE`. `npm run campaign:baseline` in `packages/evals`.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
export const BASELINE_CAMPAIGN_PATH = resolve(
	HERE,
	'..',
	'..',
	'..',
	'campaigns',
	'injection-baseline.json'
);

export function baselineCampaignJson(): string {
	return `${JSON.stringify(injectionBaseline(), null, '\t')}\n`;
}

export async function writeBaselineCampaign(path = BASELINE_CAMPAIGN_PATH): Promise<string> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, baselineCampaignJson(), 'utf8');
	return path;
}
