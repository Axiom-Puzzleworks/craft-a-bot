import { expect, test, type Page } from '@playwright/test';
import { skipTutorial } from './support.js';

/**
 * WP5 definition of done, part two: **build a valid bot keyboard-only**.
 *
 * Not a single pointer event in this file. `03-UI-UX-DESIGN.md` §4.4 calls the
 * keyboard path "required, not optional", and the way to keep that true is to
 * prove it the same way the mouse path is proved.
 */

async function newBotByKeyboard(page: Page): Promise<void> {
	await page.goto('/');
	// Reach "New bot" by tabbing rather than clicking it.
	await page.getByTestId('new-bot').focus();
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/bench\//);
	await expect(page.getByTestId('baseplate')).toBeVisible();
}

/** Pick a brick up from the tray, aim, and place — all from the keyboard. */
async function placeByKeyboard(page: Page, kind: string): Promise<void> {
	await page.getByTestId(`tray-${kind}`).focus();
	await page.keyboard.press('Enter');
	await expect(page.getByTestId('announcer')).toContainText(`Picked up the ${kind} brick`);

	// Walk the sockets until the aimed one fits, then place it.
	for (let step = 0; step < 8; step++) {
		const announcement = await page.getByTestId('announcer').textContent();
		if (announcement?.includes(`${kind} socket — this one fits`)) break;
		await page.keyboard.press('ArrowDown');
	}
	await page.keyboard.press('Enter');
	await expect(page.getByTestId('announcer')).toContainText(`${kind} brick placed`);
}

test.beforeEach(async ({ page }) => skipTutorial(page));

test('builds a bot with the keyboard alone', async ({ page }) => {
	await newBotByKeyboard(page);

	await placeByKeyboard(page, 'llm');
	await expect(page.getByTestId('socket-llm')).toHaveAttribute('data-fitted', 'true');

	await placeByKeyboard(page, 'sense');
	await placeByKeyboard(page, 'actions');

	await expect(page.getByTestId('socket-sense')).toHaveAttribute('data-fitted', 'true');
	await expect(page.getByTestId('socket-actions')).toHaveAttribute('data-fitted', 'true');

	// Choose a Goal Card from the keyboard too.
	await page.getByTestId('card-tidy-the-blocks').focus();
	await page.keyboard.press('Enter');
	await expect(page.getByTestId('active-goal')).toContainText('blocks');
});

test('Escape puts a carried brick back', async ({ page }) => {
	await newBotByKeyboard(page);

	await page.getByTestId('tray-tools').focus();
	await page.keyboard.press('Enter');
	await expect(page.getByTestId('announcer')).toContainText('Picked up the tools brick');

	await page.keyboard.press('Escape');
	await expect(page.getByTestId('announcer')).toContainText('Put back');
	await expect(page.getByTestId('socket-tools')).toHaveAttribute('data-fitted', 'false');
});

test('announces when the aimed socket is the wrong shape', async ({ page }) => {
	await newBotByKeyboard(page);

	await page.getByTestId('tray-llm').focus();
	await page.keyboard.press('Enter');
	// One step off its own socket is, by construction, a socket of another kind.
	await page.keyboard.press('ArrowDown');
	await expect(page.getByTestId('announcer')).toContainText('the wrong shape');

	// Placing anyway is refused, and says why.
	await page.keyboard.press('Enter');
	await expect(page.getByTestId('announcer')).toContainText('does not fit');
	await expect(page.getByTestId('socket-llm')).toHaveAttribute('data-fitted', 'false');
});

test('a fitted brick can be taken off with Delete', async ({ page }) => {
	await newBotByKeyboard(page);
	await placeByKeyboard(page, 'memory');

	await page.getByTestId('socket-memory').getByRole('button').focus();
	await page.keyboard.press('Delete');
	await expect(page.getByTestId('socket-memory')).toHaveAttribute('data-fitted', 'false');
});
