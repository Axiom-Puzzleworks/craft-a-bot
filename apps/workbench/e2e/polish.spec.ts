import { expect, test } from '@playwright/test';
import { skipTutorial } from './support.js';

/**
 * The non-functional targets in `01-ARCHITECTURE.md` §8 that only a real
 * browser can settle: does the reduced-motion preference actually reach the
 * cascade, and does the app shell really load offline?
 *
 * Both were claimed before they were true. WP9 shipped a "Reduce motion" switch
 * that wrote an attribute nothing read, and "static PWA-ready" sat in the
 * targets table for ten work packages with no service worker behind it.
 */

test.beforeEach(async ({ page }) => skipTutorial(page));

test('the reduce-motion preference reaches the cascade', async ({ page }) => {
	await page.goto('/settings');

	const durations = () =>
		page.evaluate(() => {
			const probe = document.createElement('div');
			probe.style.transitionDuration = '400ms';
			probe.style.transitionProperty = 'opacity';
			document.body.append(probe);
			const value = getComputedStyle(probe).transitionDuration;
			probe.remove();
			return value;
		});

	// Off: an ordinary transition keeps its duration.
	expect(await durations()).toBe('0.4s');
	// Chrome reports the flattened value in seconds (`1e-06s`), so compare as a
	// number rather than matching the string the stylesheet happens to use.
	const seconds = (value: string) => Number.parseFloat(value);

	await page.getByRole('checkbox', { name: 'Reduce motion' }).check();
	// The attribute is written by an effect, so wait for it rather than racing
	// the flush — measuring immediately after the click reads the old value.
	await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');

	// On: the global rule flattens it, from the preference alone — this machine
	// has no OS-level reduced-motion setting in play.
	expect(seconds(await durations())).toBeLessThan(0.01);

	// And it survives a reload, because it is a stored preference.
	await page.reload();
	await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');
	expect(seconds(await durations())).toBeLessThan(0.01);
});

test('the app shell loads offline', async ({ page, context }) => {
	await page.goto('/');
	await expect(page.getByTestId('new-bot')).toBeVisible();

	// Wait for the service worker to take control, otherwise the reload races it.
	await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
		timeout: 15_000
	});

	await context.setOffline(true);
	await page.reload();

	// The shell renders with no network at all. Running a bot still needs the
	// provider — that is the line 01 §8 draws, and the trace makes it obvious.
	await expect(page.getByTestId('new-bot')).toBeVisible();

	await context.setOffline(false);
});

/**
 * A registration is scoped to an origin, not to this app. `localhost:4173`
 * (this project's own preview port) is exactly the port most local Vite
 * projects default to, so a browser that once precached this shell there goes
 * on answering *any* navigation to that origin with it — including a
 * completely different project's own dev or preview server, started long
 * after this one's process exited. Cache-first for `/` made the stale
 * document win even though a live server was answering right there; a live
 * server must always win.
 */
test('a live server always wins over a stale cached shell', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByTestId('new-bot')).toBeVisible();

	await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
		timeout: 15_000
	});

	// Stand in for what a *different* project's origin reuse looks like: this
	// origin's cache already holds a document for `/` that is not the page a
	// live server would serve right now.
	await page.evaluate(async () => {
		const [cacheName] = await caches.keys();
		const cache = await caches.open(cacheName);
		await cache.put(
			'/',
			new Response('<!doctype html><title>stale</title>this is not today’s app', {
				headers: { 'content-type': 'text/html' }
			})
		);
	});

	// Online, so the network — this project's own real server, standing in for
	// whichever server actually owns the origin — is reachable.
	await page.reload();

	await expect(page.getByTestId('new-bot')).toBeVisible();
	await expect(page.getByText('this is not today’s app')).toHaveCount(0);
});
