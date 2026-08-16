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

	/*
	 * Read off the artwork, not off the wrapper. The sticker is a drawn template
	 * now (WP18) and its colour arrives as `--part-tint` on a shape inside the
	 * SVG, so a test that measured the span's `background-color` would find
	 * `transparent` on all three and call that a pass.
	 */
	const looks = await stickers.evaluateAll((nodes) =>
		nodes.map((node) => {
			const lid = node.closest('[data-corner]');
			const tint = node.querySelector('[data-part="tint"]');
			const transform = getComputedStyle(node).transform;
			const fill = tint ? getComputedStyle(tint).fill : 'no artwork';
			return `${lid?.getAttribute('data-corner')}|${fill}|${transform}`;
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

	const look = (node: Element) => {
		const lid = node.closest('[data-corner]');
		const tint = node.querySelector('[data-part="tint"]');
		return `${lid?.getAttribute('data-corner')}|${tint ? getComputedStyle(tint).fill : 'no artwork'}`;
	};

	const sticker = page.locator('[data-testid^="box-sticker-"]').first();
	const before = await sticker.evaluate(look);

	await page.reload();

	const after = await page.locator('[data-testid^="box-sticker-"]').first().evaluate(look);

	expect(after).toBe(before);
});

/**
 * Every new box reads "My Very First Agent" until renamed, and the only way
 * to do that used to be opening the bench and finding a text field with no
 * visible border. This is the Shelf-level fix a real user asked for: rename
 * right where the row of identical names is the problem, no bench required.
 */
test('a bot can be renamed straight from the Shelf', async ({ page }) => {
	await page.goto('/');
	await page.getByTestId('new-bot').click();
	await expect(page.getByTestId('baseplate')).toBeVisible();
	await page.goto('/');

	const box = page.locator('[data-testid^="open-"]').first();
	const agentId = (await box.getAttribute('data-testid'))?.replace('open-', '');
	if (!agentId) throw new Error('no bot on the shelf');

	await page.getByTestId(`rename-${agentId}`).click();
	await page.getByTestId(`rename-input-${agentId}`).fill('Snackbot 3000');
	await page.getByRole('button', { name: 'Save' }).click();

	await expect(box).toContainText('Snackbot 3000');
	await expect(box).not.toContainText('My Very First Agent');

	// Persisted, not just an in-memory label — the point of the whole feature.
	await page.reload();
	await expect(page.locator(`[data-testid="open-${agentId}"]`)).toContainText('Snackbot 3000');
});

test('cancelling a Shelf rename keeps the old name', async ({ page }) => {
	await page.goto('/');
	await page.getByTestId('new-bot').click();
	await expect(page.getByTestId('baseplate')).toBeVisible();
	await page.goto('/');

	const box = page.locator('[data-testid^="open-"]').first();
	const agentId = (await box.getAttribute('data-testid'))?.replace('open-', '');
	if (!agentId) throw new Error('no bot on the shelf');

	await page.getByTestId(`rename-${agentId}`).click();
	await page.getByTestId(`rename-input-${agentId}`).fill('Should not stick');
	await page.getByRole('button', { name: 'Cancel' }).click();

	await expect(box).toContainText('My Very First Agent');
	await expect(box).not.toContainText('Should not stick');
});
