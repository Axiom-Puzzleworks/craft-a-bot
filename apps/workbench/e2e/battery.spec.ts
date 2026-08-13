import { expect, test, type Page } from '@playwright/test';
import { BRICKS, skipTutorial } from './support.js';

/**
 * The battery compartment (03-UI-UX-DESIGN.md §7) and the "batteries not
 * included" state (§9), plus the thing that matters most: a key entered through
 * the UI must never turn up in anything the user can share.
 *
 * The key here is fake and every OpenAI call is stubbed at the network layer, so
 * nothing leaves the machine and no real key is needed to run this.
 */

const FAKE_KEY = 'sk-e2e-DO-NOT-LEAK-1a2b3c4d5e';

/** Answer OpenAI's endpoints locally so the tests never reach the internet. */
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

async function buildBot(page: Page, cartridgeLabel: string): Promise<string> {
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
	return page.url();
}

test.beforeEach(async ({ page }) => skipTutorial(page));

test('insert a battery, watch it charge, then eject it', async ({ page }) => {
	await stubOpenAi(page);
	await page.goto('/settings');

	const compartment = page.getByTestId('battery-compartment');
	await expect(compartment).toBeVisible();
	await expect(page.getByTestId('charge-state')).toHaveAttribute('data-charge', 'empty');

	await page.getByTestId('key-input').fill(FAKE_KEY);
	await page.getByTestId('insert-battery').click();

	await expect(page.getByTestId('charge-state')).toHaveAttribute('data-charge', 'charged');
	await expect(page.getByTestId('battery-message')).toContainText('Battery charged');
	await expect(page.getByTestId('battery-fitted')).toBeVisible();

	await page.getByTestId('eject-battery').click();
	await expect(page.getByTestId('charge-state')).toHaveAttribute('data-charge', 'empty');
	await expect(page.getByTestId('key-input')).toBeVisible();
});

test('a flat battery says so rather than pretending', async ({ page }) => {
	await page.route('https://api.openai.com/**', (route) =>
		route.fulfill({
			status: 401,
			contentType: 'application/json',
			body: JSON.stringify({ error: { message: 'Incorrect API key provided.' } })
		})
	);
	await page.goto('/settings');

	await page.getByTestId('key-input').fill('sk-wrong');
	await page.getByTestId('insert-battery').click();

	await expect(page.getByTestId('charge-state')).toHaveAttribute('data-charge', 'flat');
	await expect(page.getByTestId('battery-message')).toContainText('Incorrect API key');
});

test('the compartment never shows the key back', async ({ page }) => {
	await stubOpenAi(page);
	await page.goto('/settings');
	await page.getByTestId('key-input').fill(FAKE_KEY);
	await page.getByTestId('insert-battery').click();
	await expect(page.getByTestId('battery-fitted')).toBeVisible();

	// Reload: the battery is still fitted, but the value is never rendered.
	await page.goto('/settings');
	await expect(page.getByTestId('battery-fitted')).toBeVisible();
	expect(await page.content()).not.toContain(FAKE_KEY);
});

test('an OpenAI cartridge with no battery blocks GO and points at the compartment', async ({
	page
}) => {
	await buildBot(page, 'Quick Thinker');

	await expect(page.getByTestId('battery-notice')).toContainText('Batteries not included');
	await expect(page.getByRole('button', { name: /GO/ })).toBeDisabled();

	await page.getByTestId('battery-notice').getByRole('link').click();
	await expect(page).toHaveURL(/\/settings/);
});

test('with a battery fitted, an OpenAI bot reaches the Playroom and runs', async ({ page }) => {
	await stubOpenAi(page);

	await page.goto('/settings');
	await page.getByTestId('key-input').fill(FAKE_KEY);
	await page.getByTestId('insert-battery').click();
	await expect(page.getByTestId('charge-state')).toHaveAttribute('data-charge', 'charged');

	await buildBot(page, 'Quick Thinker');
	await expect(page.getByTestId('battery-notice')).toHaveCount(0);
	await expect(page.getByRole('button', { name: /GO/ })).toBeEnabled();

	await page.getByRole('button', { name: /GO/ }).click();
	await expect(page).toHaveURL(/\/play\//);

	await page.getByTestId('step').click();
	await expect(page.getByTestId('world-view')).toBeVisible();
	// The stubbed model's thought really did come back over SSE.
	await expect(page.getByTestId('thought-text')).toContainText('Thinking.');
});

test('the key never reaches a trace or a kit file — the leak gate, through the UI', async ({
	page
}) => {
	await stubOpenAi(page);

	await page.goto('/settings');
	await page.getByTestId('key-input').fill(FAKE_KEY);
	await page.getByTestId('insert-battery').click();
	await expect(page.getByTestId('charge-state')).toHaveAttribute('data-charge', 'charged');

	await buildBot(page, 'Quick Thinker');
	await page.getByRole('button', { name: /GO/ }).click();
	await expect(page).toHaveURL(/\/play\//);
	await page.getByTestId('step').click();
	await expect(page.getByTestId('world-view')).toBeVisible();

	// The whole rendered page, including the Flight Recorder's payloads.
	expect(await page.content()).not.toContain(FAKE_KEY);

	// And what a user would actually download.
	const traceDownload = page.waitForEvent('download');
	await page.getByTestId('export-trace').click();
	const trace = await (await traceDownload).createReadStream();
	expect(await streamToString(trace)).not.toContain(FAKE_KEY);
});

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of stream) chunks.push(Buffer.from(chunk));
	return Buffer.concat(chunks).toString('utf8');
}
