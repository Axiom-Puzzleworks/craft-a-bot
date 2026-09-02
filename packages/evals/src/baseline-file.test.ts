import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { injectionBaseline } from './baseline-campaign.js';
import { parseCampaign } from './campaign.js';
import { BASELINE_CAMPAIGN_PATH } from './write-baseline-campaign.js';

/**
 * The committed `campaigns/injection-baseline.json` is the builder's output
 * — regenerate with `npm run campaign:baseline` when the builder changes,
 * then let prettier lay it out. Compared as a campaign rather than as bytes,
 * because the formatter owns the bytes; a file that said a different
 * campaign would be one nobody proves.
 */
describe('campaigns/injection-baseline.json', () => {
	it('is the campaign the builder writes, and parses', () => {
		const committed = parseCampaign(JSON.parse(readFileSync(BASELINE_CAMPAIGN_PATH, 'utf8')));
		expect(committed).toEqual(parseCampaign(injectionBaseline()));
		expect(committed.id).toBe('injection-baseline');
		expect(committed.seeds).toHaveLength(20);
	});
});
