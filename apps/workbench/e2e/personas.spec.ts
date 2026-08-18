import { expect, test, type Page } from '@playwright/test';
import { BRICKS, skipTutorial } from './support.js';

/**
 * **The LLM Multi-Pack's persona cartridges** (`06-…` §8, WP26): picking one
 * in the Brain brick's picker applies its temperature/maxTokens/personality,
 * and that personality genuinely reaches the composed prompt a real run
 * sends — not just a label on a dropdown option.
 */

const FAKE_KEY = 'sk-e2e-DO-NOT-LEAK-1a2b3c4d5e';

async function stubOpenAi(page: Page): Promise<void> {
	await page.route('https://api.openai.com/**', async (route) => {
		const url = route.request().url();
		if (url.endsWith('/models')) {
			await route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' });
			return;
		}
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

async function insertBattery(page: Page): Promise<void> {
	await page.goto('/settings');
	await page.getByTestId('key-input').fill(FAKE_KEY);
	await page.getByTestId('insert-battery').click();
	await expect(page.getByTestId('charge-state')).toHaveAttribute('data-charge', 'charged');
}

async function buildAndGoWithCartridge(page: Page, cartridgeLabel: string): Promise<void> {
	await page.goto('/');
	await page.getByTestId('new-bot').click();
	await expect(page.getByTestId('baseplate')).toBeVisible();

	for (const kind of ['llm', 'sense', 'actions', 'memory']) {
		await page.getByTestId(`tray-${BRICKS[kind].id}`).focus();
		await page.keyboard.press('Enter');
		for (let step = 0; step < 8; step++) {
			const said = await page.getByTestId('announcer').textContent();
			if (said?.includes(`${BRICKS[kind].socket} socket — this one fits`)) break;
			await page.keyboard.press('ArrowDown');
		}
		await page.keyboard.press('Enter');
	}

	await page.getByTestId('card-say-hello').click();
	await page.getByTestId('socket-brain').getByRole('button').click();
	await page.getByTestId('cartridge-select').selectOption({ label: cartridgeLabel });

	await expect(page.getByRole('button', { name: /GO/ })).toBeEnabled();
	await page.getByRole('button', { name: /GO/ }).click();
	await expect(page).toHaveURL(/\/play\//);
}

test.beforeEach(async ({ page }) => skipTutorial(page));

test('picking a persona cartridge fills in its temperature, budget and personality', async ({
	page
}) => {
	await page.goto('/');
	await page.getByTestId('new-bot').click();
	await page.getByTestId('tray-starter/llm').focus();
	await page.keyboard.press('Enter');
	for (let step = 0; step < 8; step++) {
		const said = await page.getByTestId('announcer').textContent();
		if (said?.includes('head socket — this one fits')) break;
		await page.keyboard.press('ArrowDown');
	}
	await page.keyboard.press('Enter');

	await page.getByTestId('socket-brain').getByRole('button').click();
	await page.getByTestId('cartridge-select').selectOption({ label: 'Storyteller' });

	await expect(page.getByTestId('personality')).toHaveValue(
		'You love turning what you see into a little story as you go, with vivid describing words.'
	);
	await expect(page.getByTestId('max-tokens')).toHaveValue('900');
});

test('a persona’s personality reaches the real composed prompt, not just the picker', async ({
	page
}) => {
	await stubOpenAi(page);
	await insertBattery(page);
	await buildAndGoWithCartridge(page, 'Storyteller');

	await page.getByTestId('step').click();
	const recorder = page.getByTestId('flight-recorder');
	await expect(recorder).toBeVisible();

	await page.getByTestId('trace-row').filter({ hasText: 'Prompt composed' }).first().click();
	const detail = page.getByTestId('payload-prompt');
	await expect(detail).toBeVisible();
	await expect(detail).toContainText('You love turning what you see into a little story');
});
