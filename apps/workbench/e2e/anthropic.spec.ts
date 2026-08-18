import { expect, test, type Page } from '@playwright/test';
import { BRICKS, skipTutorial } from './support.js';

/**
 * **The Anthropic provider pack, end to end** (`06-…` §8, WP26).
 *
 * The unit suites in `@craftabot/pack-anthropic` cover the wire format in
 * detail; this proves the other half — that a cartridge from a *second*
 * provider genuinely reaches the real Playroom through the provider
 * registry seam, with its own battery compartment, not silently running the
 * demo brain the way an unrecognised provider used to (`brain.test.ts`).
 */

const FAKE_KEY = 'sk-ant-e2e-DO-NOT-LEAK-1a2b3c4d5e';

async function stubAnthropic(page: Page): Promise<void> {
	await page.route('https://api.anthropic.com/**', async (route) => {
		const url = route.request().url();
		if (url.endsWith('/models')) {
			await route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' });
			return;
		}
		await route.fulfill({
			status: 200,
			contentType: 'text/event-stream',
			body:
				`data: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text' } })}\n\n` +
				`data: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Thinking.' } })}\n\n` +
				`data: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } })}\n\n` +
				`data: ${JSON.stringify({ type: 'message_stop' })}\n\n`
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

test('Settings grows a second battery compartment once a second provider is installed', async ({
	page
}) => {
	await page.goto('/settings');
	await expect(page.getByTestId('battery-compartment-openai')).toBeVisible();
	await expect(page.getByTestId('battery-compartment-anthropic')).toBeVisible();
	await expect(page.getByText('Anthropic battery')).toBeVisible();
});

test('an Anthropic cartridge with no battery blocks GO and points at the compartment', async ({
	page
}) => {
	await buildBot(page, 'Quick Claude');
	await expect(page.getByTestId('battery-notice')).toContainText(
		'Batteries not included! Pop your Anthropic key into the battery compartment.'
	);
	await expect(page.getByRole('button', { name: /GO/ })).toBeDisabled();
});

test('with a battery fitted, an Anthropic bot reaches the Playroom and runs', async ({ page }) => {
	await stubAnthropic(page);

	await page.goto('/settings');
	await page.getByTestId('key-input-anthropic').fill(FAKE_KEY);
	await page.getByTestId('insert-battery-anthropic').click();
	await expect(page.getByTestId('charge-state-anthropic')).toHaveAttribute(
		'data-charge',
		'charged'
	);

	await buildBot(page, 'Quick Claude');
	await expect(page.getByTestId('battery-notice')).toHaveCount(0);
	await expect(page.getByRole('button', { name: /GO/ })).toBeEnabled();

	await page.getByRole('button', { name: /GO/ }).click();
	await expect(page).toHaveURL(/\/play\//);

	await page.getByTestId('step').click();
	await expect(page.getByTestId('world-view')).toBeVisible();
	// The stubbed model's thought really did come back over Anthropic's own
	// SSE shape, parsed by pack-anthropic's own accumulator.
	await expect(page.getByTestId('thought-text')).toContainText('Thinking');
});
