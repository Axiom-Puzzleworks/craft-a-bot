import { expect, test } from '@playwright/test';
import { skipTutorial } from './support.js';

/**
 * **Identity and understanding** (`16-…` §2.3, §2.4).
 *
 * Two things a child needs that the toy had the data for and never showed:
 * which box is which, and what the bot might have meant when it named
 * something ambiguously.
 */

test.beforeEach(async ({ page }) => skipTutorial(page));

/**
 * §2.3's acceptance is "distinct box art per bot". The seed has been on the
 * spec since WP14 and rendered nowhere (`12-…` D17), so a shelf of bots was a
 * row of identical boxes with a name in small type.
 */
test('every bot on the shelf wears its own sticker', async ({ page }) => {
	await page.goto('/');

	for (let bot = 0; bot < 3; bot++) {
		await page.getByTestId('new-bot').click();
		await expect(page.getByTestId('baseplate')).toBeVisible();
		await page.goto('/');
	}

	const stickers = page.locator('[data-testid^="box-sticker-"]');
	await expect(stickers).toHaveCount(3);

	const looks = await stickers.evaluateAll((nodes) =>
		nodes.map((node) => {
			const lid = node.closest('[data-corner]');
			const style = getComputedStyle(node);
			return `${lid?.getAttribute('data-corner')}|${style.backgroundColor}|${style.transform}`;
		})
	);

	// Not a promise of uniqueness — a finite palette cannot make one — but three
	// boxes should not be three of the same thing.
	expect(new Set(looks).size).toBeGreaterThan(1);
});

/** The same bot must look the same on every visit; that is what a seed is for. */
test('a box keeps its sticker across a reload', async ({ page }) => {
	await page.goto('/');
	await page.getByTestId('new-bot').click();
	await expect(page.getByTestId('baseplate')).toBeVisible();
	await page.goto('/');

	const sticker = page.locator('[data-testid^="box-sticker-"]').first();
	const before = await sticker.evaluate((node) => {
		const lid = node.closest('[data-corner]');
		return `${lid?.getAttribute('data-corner')}|${getComputedStyle(node).backgroundColor}`;
	});

	await page.reload();

	const after = await page
		.locator('[data-testid^="box-sticker-"]')
		.first()
		.evaluate((node) => {
			const lid = node.closest('[data-corner]');
			return `${lid?.getAttribute('data-corner')}|${getComputedStyle(node).backgroundColor}`;
		});

	expect(after).toBe(before);
});
