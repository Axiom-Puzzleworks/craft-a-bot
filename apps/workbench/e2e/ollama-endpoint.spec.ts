import { expect, test, type Page } from '@playwright/test';
import { BRICKS, skipTutorial } from './support.js';

/**
 * **The Ollama address** (`40-DEBTS.md` §4.3, WP52; `06-…` §5's "revisit
 * for Ollama later with localhost-only validation"): a Settings field that
 * takes this computer only, and a run that goes where it says.
 */

async function stubOllamaAt(page: Page, origin: string): Promise<void> {
	await page.route(`${origin}/**`, async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'text/event-stream',
			body:
				`data: ${JSON.stringify({ choices: [{ delta: { content: 'Thinking locally.' } }] })}\n\n` +
				`data: ${JSON.stringify({ choices: [{ finish_reason: 'stop' }] })}\n\n` +
				'data: [DONE]\n\n'
		});
	});
}

async function buildOllamaBot(page: Page): Promise<void> {
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
	await page.getByTestId('cartridge-select').selectOption({ label: 'Quick Llama' });
}

test.beforeEach(async ({ page }) => skipTutorial(page));

test('the address is loopback only, and a run goes to the address that was set', async ({
	page
}) => {
	await page.goto('/settings');
	const field = page.getByTestId('ollama-endpoint');
	await expect(field).toHaveValue('http://localhost:11434/v1');

	// Anywhere else is refused, with the reason, and the stored value stands.
	await field.fill('http://ollama.example.com/v1');
	await field.press('Enter');
	await expect(page.getByTestId('ollama-endpoint-refused')).toContainText('Only this computer');
	await page.reload();
	await expect(page.getByTestId('ollama-endpoint')).toHaveValue('http://localhost:11434/v1');

	// This computer, on another port, is taken — and a run calls it there.
	await page.getByTestId('ollama-endpoint').fill('http://127.0.0.1:11435/v1');
	await page.getByTestId('ollama-endpoint').press('Enter');
	await expect(page.getByTestId('ollama-endpoint-note')).toBeVisible();
	await page.reload();
	await expect(page.getByTestId('ollama-endpoint')).toHaveValue('http://127.0.0.1:11435/v1');

	await stubOllamaAt(page, 'http://127.0.0.1:11435');
	await buildOllamaBot(page);
	await page.getByRole('button', { name: /GO/ }).click();
	await expect(page).toHaveURL(/\/play\//);
	await page.getByTestId('step').click();
	await expect(page.getByTestId('thought-text')).toContainText('Thinking locally');
});
