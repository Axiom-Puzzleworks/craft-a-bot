import { expect, test } from '@playwright/test';
import { buildReadyBot, skipTutorial } from './support.js';

/**
 * **WP31 stage D** (`24-ROBOT-FRIENDS-DESIGN.md` §10): "a played duo run is
 * found, unchanged, in the Workshop's Run Browser… as well as the Kit's
 * scrapbook" — the stage's own gate, proven here against a real live play
 * through `/play/duo`, not a seeded test entry point (stage F's own
 * `group-episode.spec.ts` still covers that seam separately).
 */

test.beforeEach(async ({ page }) => skipTutorial(page));

test('a live-played duo run turns up in the Workshop Run Browser and the Scrapbook, and both replay', async ({
	page
}) => {
	const idA = await buildReadyBot(page);
	const idB = await buildReadyBot(page);
	await page.goto(`/play/duo?a=${idA}&b=${idB}&card=starter/tidy-together`);

	await page.getByTestId('play').click();
	await expect(page.getByTestId('duo-finished')).toBeVisible({ timeout: 30_000 });

	// The Workshop Run Browser: one new group row, newest first.
	await page.goto('/workshop/runs');
	const groupRow = page.locator('[data-testid^="group-row-"]').first();
	await expect(groupRow).toBeVisible();
	const runId = (await groupRow.getAttribute('data-testid'))?.replace('group-row-', '');
	expect(runId).toBeTruthy();
	// Both members nested beneath it, indented (`23-…` §5.2) — keyed by each
	// member's own *run* id, not the agent id, so counted rather than named.
	await expect(page.locator('.member-row')).toHaveCount(2);

	// Into the Workshop's own Run Lab, over the merged trace.
	await groupRow.getByRole('link').click();
	await expect(page.getByTestId('group-header')).toHaveText('2-robot episode');
	await expect(page.getByTestId('world-view')).toBeVisible();
	// The integrity badge verifies the episode's bundle (WP48, `36-…` §4.4).
	await expect(page.locator('.integrity')).toHaveAttribute('data-verified', 'true', {
		timeout: 10_000
	});
	await expect(page.locator('.integrity')).toContainText('trace integrity');

	// The Kit's own scrapbook: one shared-adventure card, not two solo ones
	// duplicating the same episode (`24-…` §4.5's own "alongside", not "as well as").
	await page.goto('/scrapbook');
	const scrapbookCard = page.locator(`[data-testid="group-${runId}"]`);
	await expect(scrapbookCard).toBeVisible();
	await expect(page.getByTestId('scrapbook-list').locator(':scope > .row')).toHaveCount(1);

	// Replays through the same route a solo adventure does, both robots drawn.
	await page.getByTestId(`open-group-${runId}`).click();
	await expect(page).toHaveURL(new RegExp(`/replay/${runId}$`));
	await expect(page.getByTestId('world-view')).toBeVisible();
	await expect(page.getByTestId('replay-detail')).toContainText('&');
});
