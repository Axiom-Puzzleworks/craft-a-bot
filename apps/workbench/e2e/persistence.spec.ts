import { expect, test, type Page } from '@playwright/test';
import { BRICKS, skipTutorial, type BrickName } from './support.js';

/**
 * WP5 definition of done, part four: **spec edits persist**.
 *
 * A full page reload, not a client-side navigation — the point is that the work
 * reached IndexedDB, not that it survived in memory.
 */

async function newBot(page: Page): Promise<string> {
	await page.goto('/');
	await page.getByTestId('new-bot').click();
	await expect(page.getByTestId('baseplate')).toBeVisible();
	return page.url();
}

async function fitBrick(page: Page, kind: BrickName): Promise<void> {
	await page.getByTestId(`tray-${BRICKS[kind].id}`).focus();
	await page.keyboard.press('Enter');
	for (let step = 0; step < 8; step++) {
		const announcement = await page.getByTestId('announcer').textContent();
		if (announcement?.includes(`${BRICKS[kind].socket} socket — this one fits`)) break;
		await page.keyboard.press('ArrowDown');
	}
	await page.keyboard.press('Enter');
	await expect(page.getByTestId(`socket-${BRICKS[kind].slot}`)).toHaveAttribute(
		'data-fitted',
		'true'
	);
}

test.beforeEach(async ({ page }) => skipTutorial(page));

test('a fitted brick survives a reload', async ({ page }) => {
	const url = await newBot(page);
	await fitBrick(page, 'sense');

	await page.waitForTimeout(500); // let the debounced save land
	await page.goto(url);

	await expect(page.getByTestId('socket-perception')).toHaveAttribute('data-fitted', 'true');
});

test('a dial change survives a reload', async ({ page }) => {
	const url = await newBot(page);
	await fitBrick(page, 'llm');

	await page.getByTestId('socket-brain').getByRole('button').click();
	const dial = page.getByRole('slider', { name: 'Imagination' });
	await dial.fill('1.5');
	await expect(page.getByText('1.5 — wild')).toBeVisible();

	await page.waitForTimeout(500);
	await page.goto(url);

	await page.getByTestId('socket-brain').getByRole('button').click();
	await expect(page.getByRole('slider', { name: 'Imagination' })).toHaveValue('1.5');
});

test('the bot name and chosen Goal Card survive a reload', async ({ page }) => {
	const url = await newBot(page);

	await page.getByTestId('bot-name').fill('Snackbot 3000');
	await page.getByTestId('card-snack').click();

	await page.waitForTimeout(500);
	await page.goto(url);

	await expect(page.getByTestId('bot-name')).toHaveValue('Snackbot 3000');
	await expect(page.getByTestId('active-goal')).toContainText('Find a snack');
});

test('the Free Play card keeps the goal the user wrote', async ({ page }) => {
	const url = await newBot(page);

	await page.getByTestId('card-free-play').click();
	await page.getByTestId('custom-goal-text').fill('Roll around and knock the blocks over.');

	await page.waitForTimeout(500);
	await page.goto(url);

	await expect(page.getByTestId('custom-goal-text')).toHaveValue(
		'Roll around and knock the blocks over.'
	);
	await expect(page.getByTestId('active-goal')).toContainText('knock the blocks over');
});

test('undo puts back the last change', async ({ page }) => {
	await newBot(page);
	await fitBrick(page, 'memory');
	await expect(page.getByTestId('socket-memory')).toHaveAttribute('data-fitted', 'true');

	await page.getByTestId('undo').click();
	await expect(page.getByTestId('socket-memory')).toHaveAttribute('data-fitted', 'false');
});

test('a built bot shows its brick strip back on the shelf', async ({ page }) => {
	await newBot(page);
	await fitBrick(page, 'llm');
	await fitBrick(page, 'actions');
	await page.waitForTimeout(500);

	await page.goto('/');
	await expect(page.getByTestId('agent-list')).toContainText('2 of 6 bricks fitted');
});
