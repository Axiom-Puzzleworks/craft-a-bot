import { expect, test } from '@playwright/test';
import { obedient } from '@craftabot/core/testing';
import {
	TIDY_TOGETHER_SEAT_A,
	TIDY_TOGETHER_SEAT_B,
	buildSpec,
	runGroupToCompletion
} from '@craftabot/pack-starter/testing';
import { skipTutorial } from './support.js';

/**
 * **WP29 stage F's own e2e** (`23-MULTI-AGENT-DESIGN.md` §10): "a scripted
 * duo episode … is browsable and replayable in the Workshop."
 *
 * Driven through the test entry point stage F built for exactly this — no
 * Kit UI can start a group episode yet (WP31's job), so the episode is run
 * for real here, in Node, over the real Playroom and the real starter pack
 * (`@craftabot/pack-starter/testing`'s `runGroupToCompletion`, the same
 * harness stage E's own DoD proof uses), then handed to the browser's
 * `window.craftabot.recordGroupEpisode` to store — the seam
 * `group-episode-entry-point.ts` installs from the Workshop shell.
 */

test.beforeEach(async ({ page }) => skipTutorial(page));

const ROBO_ID = '11111111-1111-4111-8111-111111111111';
const BOLT_ID = '22222222-2222-4222-8222-222222222222';

async function runAndRecordEpisode(page: import('@playwright/test').Page) {
	const roboSpec = buildSpec({ id: ROBO_ID, name: 'Robo', goalCardId: 'starter/tidy-together' });
	const boltSpec = buildSpec({ id: BOLT_ID, name: 'Bolt', goalCardId: 'starter/tidy-together' });

	const run = await runGroupToCompletion({
		members: [
			{ script: obedient(TIDY_TOGETHER_SEAT_A), spec: roboSpec },
			{ script: obedient(TIDY_TOGETHER_SEAT_B), spec: boltSpec }
		]
	});
	expect(run.outcome).toBe('SUCCESS');

	// The Workshop shell is what installs the entry point, so a group page
	// must already be open before it exists to call.
	await page.goto('/workshop/runs');
	await page.waitForFunction(() => typeof window.craftabot?.recordGroupEpisode === 'function');

	const episode = {
		groupRunId: run.groupRunId,
		goalCardId: 'starter/tidy-together',
		members: [
			{ spec: roboSpec, events: run.memberEvents[0] ?? [] },
			{ spec: boltSpec, events: run.memberEvents[1] ?? [] }
		],
		mergedEvents: run.events
	};
	const groupRun = await page.evaluate(
		(data) => window.craftabot!.recordGroupEpisode(data),
		episode
	);

	return { run, groupRun: groupRun as { id: string; memberRunIds: string[] } };
}

test('a scripted duo episode is browsable and replayable in the Workshop', async ({ page }) => {
	const { groupRun } = await runAndRecordEpisode(page);
	await page.reload();

	await expect(page.getByTestId('run-table')).toBeVisible();
	const groupRow = page.getByTestId(`group-row-${groupRun.id}`);
	await expect(groupRow).toBeVisible();
	await expect(groupRow.getByText('SUCCESS')).toBeVisible();

	// Both members are nested beneath it, indented.
	for (const memberId of groupRun.memberRunIds) {
		await expect(page.getByTestId(`run-row-${memberId}`)).toBeVisible();
	}

	// Into the Run Lab, over the merged trace.
	await groupRow.getByRole('link').click();
	await expect(page.getByTestId('group-header')).toHaveText('2-robot episode');
	await expect(page.getByTestId('header-outcome')).toHaveText('SUCCESS');
	await expect(page.getByTestId('world-view')).toBeVisible();
	await expect(page.getByTestId('timeline')).toBeVisible();
	await expect(page.getByTestId('run-scrubber')).toBeVisible();
	// No digest badge and no "open in Kit" — both stay single-run (`23-…` §4.7).
	await expect(page.getByTestId('digest-badge')).toHaveCount(0);
	await expect(page.getByTestId('open-in-kit')).toHaveCount(0);

	// Each member's own trace also opens standalone (acceptance criterion 5).
	const memberLink = page.getByTestId('group-members').getByRole('link').first();
	await memberLink.click();
	await expect(page.getByTestId('run-header')).toBeVisible();
	await expect(page.getByTestId('digest-badge')).toBeVisible();
});
