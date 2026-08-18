import { expect, test, type Page } from '@playwright/test';
import { BRICKS, skipTutorial } from './support.js';

/**
 * **The Ollama provider pack, end to end** (`06-…` §8, WP26). The one
 * keyless provider: no battery compartment, no "batteries not included"
 * notice, GO lights the moment the rest of the bot is built — proving
 * `chooseBrain`/`needsBattery` genuinely branch on `keyRequirement`, not
 * just on whether a provider is recognised at all.
 */

async function stubOllama(page: Page): Promise<void> {
	await page.route('http://localhost:11434/**', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'text/event-stream',
			body:
				`data: ${JSON.stringify({ choices: [{ delta: { content: 'Thinking.' } }] })}\n\n` +
				`data: ${JSON.stringify({ choices: [{ finish_reason: 'stop' }] })}\n\n` +
				'data: [DONE]\n\n'
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

test('Settings shows no battery compartment for Ollama — there is nothing to plug in', async ({
	page
}) => {
	await page.goto('/settings');
	await expect(page.getByTestId('battery-compartment-openai')).toBeVisible();
	await expect(page.getByTestId('battery-compartment-ollama')).toHaveCount(0);
});

test('an Ollama cartridge needs no battery at all — GO lights immediately', async ({ page }) => {
	await buildBot(page, 'Quick Llama');
	await expect(page.getByTestId('battery-notice')).toHaveCount(0);
	await expect(page.getByRole('button', { name: /GO/ })).toBeEnabled();
});

test('an Ollama bot reaches the Playroom and runs against the local server', async ({ page }) => {
	await stubOllama(page);
	await buildBot(page, 'Quick Llama');

	await page.getByRole('button', { name: /GO/ }).click();
	await expect(page).toHaveURL(/\/play\//);

	await page.getByTestId('step').click();
	await expect(page.getByTestId('world-view')).toBeVisible();
	await expect(page.getByTestId('thought-text')).toContainText('Thinking');
});
