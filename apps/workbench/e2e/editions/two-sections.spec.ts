import { expect, test } from '@playwright/test';
import { skipTutorial } from './support.js';

/**
 * **Two sections on one origin** (WP91, CLOSE-2; `64-…` §14 item 13): the
 * Workshop and the Playground are served from one origin, each with its own
 * service worker under its own base. The first section's worker registers
 * and precaches its shell; the second section then opens and renders its
 * own — never a blank page or a chunk the other build owned — because the
 * cache is named per edition (`craftabot-shell-<editionId>-<version>`) and
 * a worker only ever clears its own edition's old caches.
 */
test('the Workshop registers its worker, then the Playground opens and renders its own shell', async ({
	page
}) => {
	await skipTutorial(page);
	await page.goto('/workshop/');
	await expect(page.locator('html')).toHaveAttribute('data-edition', 'workshop');
	await expect(page.getByTestId('new-bot')).toBeVisible();
	// The worker takes the section over; its cache carries the edition's name.
	await page.waitForFunction(async () => {
		const registration = await navigator.serviceWorker?.ready;
		return registration?.active?.state === 'activated';
	});
	const workshopCaches = await page.evaluate(() => caches.keys());
	expect(workshopCaches.some((key) => key.startsWith('craftabot-shell-workshop-'))).toBe(true);

	await page.goto('/playground/');
	await expect(page.locator('html')).toHaveAttribute('data-edition', 'playground');
	await expect(page.getByTestId('new-bot')).toBeVisible();
	await page.waitForFunction(async () => {
		const registration = await navigator.serviceWorker?.ready;
		return registration?.active?.state === 'activated';
	});
	const both = await page.evaluate(() => caches.keys());
	expect(both.some((key) => key.startsWith('craftabot-shell-playground-'))).toBe(true);
	// The Playground's worker left the Workshop's cache alone.
	expect(both.some((key) => key.startsWith('craftabot-shell-workshop-'))).toBe(true);

	// And back: the Workshop still renders from its own shell.
	await page.goto('/workshop/');
	await expect(page.locator('html')).toHaveAttribute('data-edition', 'workshop');
	await expect(page.getByTestId('new-bot')).toBeVisible();
	await expect(page.getByTestId('nav-workshop')).toBeVisible();
});
