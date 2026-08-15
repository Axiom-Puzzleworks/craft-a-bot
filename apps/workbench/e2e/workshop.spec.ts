import { expect, test } from '@playwright/test';
import { buildAndGo, skipTutorial } from './support.js';

/**
 * **WP20's definition of done, as a test**: "a stored Kit run is fully
 * forensicable in the Workshop".
 *
 * So the run is made in the Kit — the child's screens, the real engine, the
 * real store — and then examined in the Workshop without exporting, importing
 * or converting anything. That is `15-…` §7 rule 1 in practice: both modes read
 * the same events from the same store, and if they did not, this walk could not
 * be written.
 */

test.beforeEach(async ({ page }) => skipTutorial(page));

/**
 * A real run, built and played through the Kit — which is the whole point: the
 * Workshop must be able to examine what a child actually made, with no export,
 * import or conversion in between.
 */
async function playARun(page: import('@playwright/test').Page) {
	await buildAndGo(page);
	await page.getByTestId('step').click();
	await expect(page.getByTestId('world-view')).toBeVisible();
	await page.getByTestId('step').click();
}

test('the Workshop door is off until an adult asks for it', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByTestId('nav-workshop')).toHaveCount(0);

	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();

	await page.goto('/');
	await expect(page.getByTestId('nav-workshop')).toBeVisible();
});

test('a /workshop link still opens even with the door hidden', async ({ page }) => {
	// The preference gates the door, not the rooms. A link somebody was given
	// that silently does nothing is worse than one that opens something
	// unexpected.
	await page.goto('/workshop');
	await expect(page.getByTestId('workshop')).toBeVisible();
	await expect(page.getByTestId('rail-runs')).toBeVisible();
});

test('the Workshop shows no Kit chrome', async ({ page }) => {
	// The leaflet's chapters describe the bench and the Playroom; a spotlight
	// pointing at a Workshop table would be pointing at something it has never
	// described.
	await page.goto('/workshop/runs');
	await expect(page.getByTestId('nav-header')).toHaveCount(0);
});

test('a run played in the Kit is forensicable in the Workshop', async ({ page }) => {
	await playARun(page);
	await page.goto('/workshop/runs');

	await expect(page.getByTestId('run-table')).toBeVisible();
	const firstRun = page.locator('[data-testid^="run-row-"]').first();
	await expect(firstRun).toBeVisible();

	// Into the Run Lab.
	await firstRun.getByRole('link').click();
	await expect(page.getByTestId('run-header')).toBeVisible();

	// The three regions the flagship is made of (`17-…` §3).
	await expect(page.getByTestId('timeline')).toBeVisible();
	await expect(page.getByTestId('run-scrubber')).toBeVisible();

	// The integrity badge is *computed*, not read from a field, so it has to
	// resolve to a verdict rather than sitting on "checking…".
	await expect(page.getByTestId('digest-badge')).toHaveText(/trace integrity|does not match/);

	// A row opens in the inspector, and raw JSON is one click away (`17-…` §3).
	await page.getByTestId('row-0').click();
	await page.getByTestId('show-raw').check();
	await expect(page.getByTestId('raw-json')).toContainText('"type"');
});

test('the timeline filters down to trouble, and says so when there is none', async ({ page }) => {
	await playARun(page);
	await page.goto('/workshop/runs');
	await page.locator('[data-testid^="run-row-"]').first().getByRole('link').click();

	await expect(page.getByTestId('timeline')).toBeVisible();
	await page.getByTestId('only-failures').check();

	// Either there is trouble in this run or the empty state explains itself —
	// what must not happen is a silently blank panel.
	const empty = page.getByTestId('timeline-empty');
	const rows = page.locator('[data-testid^="row-"]');
	await expect(async () => {
		expect((await rows.count()) > 0 || (await empty.count()) > 0).toBe(true);
	}).toPass();
});
