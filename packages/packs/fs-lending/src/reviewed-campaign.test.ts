import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCampaign } from '@craftabot/evals';
import { describe, expect, it } from 'vitest';
import { LENDING_REVIEWED_CAMPAIGN_ID, lendingReviewedCampaign } from './campaign.js';

/**
 * **`campaigns/fs-lending-reviewed.json`** (WP156, `111-TESTABLE-CONTROLS-PLAN.md`
 * §4): the committed file is what the builder writes. CI runs it with
 * `--strict`, where its `override-reason` gate holds the case handler's reasons.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(HERE, '../../../../campaigns/fs-lending-reviewed.json');

describe('campaigns/fs-lending-reviewed.json (WP156)', () => {
	it('is the campaign the builder writes: Level 4, the case handler, a fallible bot, the reason gate', () => {
		const committed = parseCampaign(JSON.parse(readFileSync(FILE, 'utf8')));
		expect(committed).toEqual(parseCampaign(lendingReviewedCampaign()));
		expect(committed.id).toBe(LENDING_REVIEWED_CAMPAIGN_ID);
		expect(committed.builds[0]?.overrides?.reviewer).toBe('fs-bank/reviewer/case-handler');
		expect(committed.brains.map((brain) => brain.tier)).toEqual(['fallible']);
		expect(committed.gates.map((gate) => gate.require.kind)).toContain('override-reason');
	});
});
