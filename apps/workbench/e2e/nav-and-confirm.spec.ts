import { expect, test } from '@playwright/test';
import { buildAndGo, skipTutorial } from './support.js';

/**
 * **Getting around, and not losing things by accident** (`16-…` §1.5).
 *
 * Two defects from `12-…` D16, both of which only a real browser settles.
 * Settings was reachable from the bench and nowhere else, so a child on the
 * Shelf who wanted the sound off simply could not get there. And the Bin took
 * a bot apart on one tap, with no question and no undo.
 */

test.beforeEach(async ({ page }) => skipTutorial(page));

/** The Shelf's "New bot" lands on the bench for the bot it just made. */
async function newBot(page: import('@playwright/test').Page): Promise<void> {
	await page.goto('/');
	await page.getByTestId('new-bot').click();
	await page.waitForURL(/\/bench\//);
}

test('the header reaches Settings from the Shelf, and back again', async ({ page }) => {
	await page.goto('/');

	await page.getByTestId('nav-settings').click();
	await page.waitForURL(/\/settings/);
	await expect(page.getByTestId('nav-settings')).toHaveAttribute('aria-current', 'page');

	await page.getByTestId('nav-shelf').click();
	await page.waitForURL((url) => url.pathname === '/');
	await expect(page.getByTestId('nav-shelf')).toHaveAttribute('aria-current', 'page');
});

test('the header is on the bench too', async ({ page }) => {
	await newBot(page);
	await expect(page.getByTestId('nav-header')).toBeVisible();
	await expect(page.getByTestId('nav-settings')).toBeVisible();
});

test('the header survives the Playroom, and Settings is still one tap away', async ({ page }) => {
	await buildAndGo(page);

	await expect(page.getByTestId('nav-header')).toBeVisible();

	await page.getByTestId('nav-settings').click();
	await page.waitForURL(/\/settings/);
	await expect(page.getByTestId('nav-header')).toBeVisible();
});

test('Instructions opens the leaflet instead of navigating away', async ({ page }) => {
	await page.goto('/settings');

	await page.getByTestId('nav-instructions').click();

	await expect(page.getByTestId('leaflet')).toBeVisible();
	// The leaflet is an overlay: the route underneath is untouched.
	expect(new URL(page.url()).pathname).toBe('/settings');
});

test('the Bin asks before it takes a bot apart', async ({ page }) => {
	await newBot(page);
	await page.getByTestId('nav-shelf').click();
	await page.waitForURL((url) => url.pathname === '/');

	const boxes = page.getByTestId('agent-list').locator('> li');
	await expect(boxes).toHaveCount(1);

	await page.locator('[data-testid^="bin-"]').first().click();

	// The question is asked, and nothing has happened yet.
	await expect(page.getByTestId('take-apart-confirm')).toBeVisible();
	await expect(boxes).toHaveCount(1);
});

test('keeping the bot leaves it on the shelf', async ({ page }) => {
	await newBot(page);
	await page.getByTestId('nav-shelf').click();
	await page.waitForURL((url) => url.pathname === '/');

	const boxes = page.getByTestId('agent-list').locator('> li');
	await page.locator('[data-testid^="bin-"]').first().click();
	await page.getByTestId('take-apart-cancel').click();

	await expect(page.getByTestId('take-apart-confirm')).toBeHidden();
	await expect(boxes).toHaveCount(1);
});

test('Escape is a way out of the question, and keeps the bot', async ({ page }) => {
	await newBot(page);
	await page.getByTestId('nav-shelf').click();
	await page.waitForURL((url) => url.pathname === '/');

	const boxes = page.getByTestId('agent-list').locator('> li');
	await page.locator('[data-testid^="bin-"]').first().click();
	await page.keyboard.press('Escape');

	await expect(page.getByTestId('take-apart-confirm')).toBeHidden();
	await expect(boxes).toHaveCount(1);
});

test('confirming really does take the bot apart', async ({ page }) => {
	await newBot(page);
	await page.getByTestId('nav-shelf').click();
	await page.waitForURL((url) => url.pathname === '/');

	await page.locator('[data-testid^="bin-"]').first().click();
	await page.getByTestId('take-apart-confirm-yes').click();

	await expect(page.getByTestId('take-apart-confirm')).toBeHidden();
	await expect(page.getByText('The shelf is bare.', { exact: false })).toBeVisible();
});
