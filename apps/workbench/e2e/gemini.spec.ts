import { expect, test, type Page } from '@playwright/test';
import { BRICKS, skipTutorial } from './support.js';

/**
 * **The Gemini provider pack, end to end** (`06-…` §8, WP26). A third
 * provider through the same registry seam — its own battery compartment,
 * and the key genuinely never appears in the request URL (hard rule 2),
 * proven here against the real fetch calls a build makes, not just the unit
 * suite's canned fixtures.
 */

const FAKE_KEY = 'AIzaSyE2EDONOTLEAK1a2b3c4d5e';

async function stubGemini(page: Page): Promise<void> {
	await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
		const url = route.request().url();
		expect(url).not.toContain(FAKE_KEY);
		if (url.endsWith('/models')) {
			await route.fulfill({ status: 200, contentType: 'application/json', body: '{"models":[]}' });
			return;
		}
		await route.fulfill({
			status: 200,
			contentType: 'text/event-stream',
			body: `data: ${JSON.stringify({
				candidates: [{ content: { parts: [{ text: 'Thinking.' }] }, finishReason: 'STOP' }]
			})}\n\n`
		});
	});
}

async function buildBot(page: Page, cartridgeLabel: string): Promise<void> {
	await page.goto('/');
	await page.getByTestId('new-bot').click();
	await expect(page.getByTestId('baseplate')).toBeVisible();

	for (const kind of ['llm', 'sense', 'actions']) {
		await page.getByTestId(`tray-${BRICKS[kind].id}`).focus();
		await page.keyboard.press('Enter');
		for (let step = 0; step < 8; step++) {
			const said = await page.getByTestId('announcer').textContent();
			if (said?.includes(`${BRICKS[kind].socket} socket — this one fits`)) break;
			await page.keyboard.press('ArrowDown');
		}
		await page.keyboard.press('Enter');
	}

	await page.getByTestId('socket-brain').getByRole('button').click();
	await page.getByTestId('cartridge-select').selectOption({ label: cartridgeLabel });
}

test.beforeEach(async ({ page }) => skipTutorial(page));

test('Settings grows a third battery compartment for Gemini', async ({ page }) => {
	await page.goto('/settings');
	await expect(page.getByTestId('battery-compartment-openai')).toBeVisible();
	await expect(page.getByTestId('battery-compartment-anthropic')).toBeVisible();
	await expect(page.getByTestId('battery-compartment-gemini')).toBeVisible();
	await expect(page.getByText('Gemini battery')).toBeVisible();
});

test('with a battery fitted, a Gemini bot reaches the Playroom and runs, key never in the URL', async ({
	page
}) => {
	await stubGemini(page);

	await page.goto('/settings');
	await page.getByTestId('key-input-gemini').fill(FAKE_KEY);
	await page.getByTestId('insert-battery-gemini').click();
	await expect(page.getByTestId('charge-state-gemini')).toHaveAttribute('data-charge', 'charged');

	await buildBot(page, 'Quick Gemini');
	await expect(page.getByTestId('battery-notice')).toHaveCount(0);
	await expect(page.getByRole('button', { name: /GO/ })).toBeEnabled();

	await page.getByRole('button', { name: /GO/ }).click();
	await expect(page).toHaveURL(/\/play\//);

	await page.getByTestId('step').click();
	await expect(page.getByTestId('world-view')).toBeVisible();
	await expect(page.getByTestId('thought-text')).toContainText('Thinking');
});
