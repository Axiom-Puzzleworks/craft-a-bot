import { expect, test } from '@playwright/test';
import { awaitRunSaved, buildReadyBot, skipTutorial } from './support.js';

/**
 * **Explain and fork in the Run Lab** (WP66 stage C, `54-…` §4.5, §11
 * items 5–6): a decision row explained from the trace with its related
 * rows lit in the timeline; "Fork from this tick" running a fork through
 * the app's own session path, storing it, and opening Compare synced from
 * the fork point.
 */
test.beforeEach(async ({ page }) => skipTutorial(page));

async function aStoredRun(page: import('@playwright/test').Page): Promise<string> {
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
	const agentId = await buildReadyBot(page, 'card-snack');
	await page.goto(`/bench/${agentId}`);
	await page.getByRole('button', { name: /GO/ }).click();
	await page.getByTestId('step').click();
	await expect(page.getByTestId('world-view')).toBeVisible();
	await page.getByTestId('step').click();
	await page.getByTestId('stop').click();
	await awaitRunSaved(page);
	await page.goto('/workshop/runs');
	const row = page.locator('[data-testid^="run-row-"]').first();
	return (await row.getAttribute('data-testid'))?.replace('run-row-', '') ?? '';
}

test('Explain reads a decision from the trace and lights its related rows', async ({ page }) => {
	const runId = await aStoredRun(page);
	await page.goto(`/workshop/runs/${runId}`);
	await expect(page.getByTestId('run-header')).toBeVisible();

	// A decision row, then Explain.
	const decision = page.locator('[data-testid^="row-"] .type', { hasText: /^decision$/ }).first();
	await decision.click();
	await page.getByTestId('show-explain').check();
	await expect(page.getByTestId('explain')).toBeVisible();
	await expect(page.getByTestId('explain-chose')).toBeVisible();
	await expect(page.getByTestId('explain-offered')).not.toBeEmpty();
	// The decision and at least what it saw and what it did.
	const related = page.locator('[data-related="true"]');
	expect(await related.count()).toBeGreaterThanOrEqual(2);
	await expect(decision.locator('..')).toHaveAttribute('data-related', 'true');

	// A row of a turn with no decision says so rather than showing nothing.
	const started = page
		.locator('[data-testid^="row-"] .type', { hasText: /^run\.started$/ })
		.first();
	await started.click();
	await expect(page.getByTestId('explain-empty')).toBeVisible();
	await expect(page.locator('[data-related="true"]')).toHaveCount(0);
});

test('Fork from this tick stores a fork of the run and opens Compare synced from the fork point', async ({
	page
}) => {
	const runId = await aStoredRun(page);
	await page.goto(`/workshop/runs/${runId}`);
	await expect(page.getByTestId('run-header')).toBeVisible();

	// Turn 0 is nothing to fork from; a completed turn is.
	await page.getByTestId('run-scrubber').fill('0');
	await expect(page.getByTestId('fork-from-tick')).toBeDisabled();
	await page.getByTestId('run-scrubber').fill('1');
	await expect(page.getByTestId('fork-from-tick')).toBeEnabled();
	await page.getByTestId('fork-from-tick').click();

	await expect(page).toHaveURL(new RegExp(`/workshop/compare\\?a=${runId}&b=.+&from=1`));
	await expect(page.getByTestId('world-view')).toHaveCount(2);
	await expect(page.getByTestId('compare-forked')).toContainText('forked after turn 1');
	await expect(page.getByTestId('compare-fork-chip')).toContainText('shares turns 0–1');
	await expect(page.getByText(/Turn 1 of \d+/)).toBeVisible();

	// The fork is a stored run of its own, naming its origin.
	const forkId = new URL(page.url()).searchParams.get('b') ?? '';
	expect(forkId).not.toBe(runId);
	await page.goto(`/workshop/runs/${forkId}`);
	await expect(page.getByTestId('forked-from')).toContainText('forked from turn 1');
	await expect(page.getByTestId('digest-badge')).toContainText('✓ trace integrity');
	await page.goto('/workshop/runs');
	await expect(page.getByTestId('run-count')).toContainText('2 of 2');
});
