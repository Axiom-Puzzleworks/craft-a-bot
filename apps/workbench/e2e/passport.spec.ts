import { expect, test } from '@playwright/test';
import { buildReadyBot, skipTutorial } from './support.js';

/**
 * The Passport (WP33 stage B; `14-…` §5.8, "your robot's passport"): every
 * fitted brick in the toy's own words, with a flip side to the Agent Card
 * underneath — the same flip a brick panel already gives one brick at a time,
 * now for the whole bot.
 */

test.beforeEach(async ({ page }) => skipTutorial(page));

test('shows what the bot is built with, and flips to the Agent Card underneath', async ({
	page
}) => {
	await buildReadyBot(page);

	await page.getByTestId('passport').click();

	const controls = page.getByTestId('passport-controls');
	await expect(controls).toContainText('Help the teddy get a snack');
	await expect(controls).toContainText('a brain (LLM)');
	await expect(controls).toContainText('senses');
	await expect(controls).toContainText('hands and wheels');

	await page.getByTestId('flip-passport').click();
	const json = page.getByTestId('passport-json');
	await expect(json).toContainText('"goalCardId": "starter/snack"');
	await expect(json).toContainText('"kind": "starter/llm"');
	await expect(json).toContainText('"packs"');

	// Flips back cleanly rather than getting stuck on the real side.
	await page.getByTestId('flip-passport').click();
	await expect(page.getByTestId('passport-controls')).toBeVisible();
});

test('closes back to the panel hint', async ({ page }) => {
	await buildReadyBot(page);
	await page.getByTestId('passport').click();
	await expect(page.getByTestId('passport-controls')).toBeVisible();

	await page.getByTestId('close-passport').click();
	await expect(page.getByTestId('passport-controls')).toBeHidden();
	await expect(page.getByTestId('panel-hint')).toBeVisible();
});

test('opening a brick’s own panel closes the Passport, and the reverse', async ({ page }) => {
	await buildReadyBot(page);

	await page.getByTestId('passport').click();
	await expect(page.getByTestId('passport-controls')).toBeVisible();

	// A brick's own panel takes the same column — only one shows at a time.
	await page.getByTestId('socket-brain').getByRole('button').click();
	await expect(page.getByTestId('brick-controls-brain')).toBeVisible();
	await expect(page.getByTestId('passport-controls')).toBeHidden();

	// And the Passport reclaims the column from a brick's own panel, in turn.
	await page.getByTestId('passport').click();
	await expect(page.getByTestId('passport-controls')).toBeVisible();
	await expect(page.getByTestId('brick-controls-brain')).toBeHidden();
});

test('reopening the Passport always starts on the toy side', async ({ page }) => {
	await buildReadyBot(page);

	await page.getByTestId('passport').click();
	await page.getByTestId('flip-passport').click();
	await expect(page.getByTestId('passport-json')).toBeVisible();

	await page.getByTestId('close-passport').click();
	await page.getByTestId('passport').click();
	await expect(page.getByTestId('passport-controls')).toBeVisible();
	await expect(page.getByTestId('passport-json')).toBeHidden();
});
