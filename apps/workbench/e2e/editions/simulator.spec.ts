import { expect, test, type Page } from '@playwright/test';
import { clientGoto, openShelf, playToTheEnd, skipTutorial } from './support.js';

/**
 * **The Simulator** (`59-EDITIONS.md` §4.5, §11 items 3–5, WP69): under
 * `/simulator/`, the Kit's first run to its end card with the key-leak gate
 * — a battery fitted, the page and the exported kit file carrying no key —
 * the Workshop door a link to `/workshop/` rather than a toggle, the
 * Playground's box on the shelf linking to its section, and a Workshop route
 * rendering the not-in-this-box page.
 */
const FAKE_KEY = 'sk-e2e-edition-DO-NOT-LEAK-9f8e7d6c';

async function stubOpenAi(page: Page): Promise<void> {
	await page.route('https://api.openai.com/**', async (route) => {
		await route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' });
	});
}

test.beforeEach(async ({ page }) => skipTutorial(page));

test('the Kit runs to its end card under /simulator/, and a fitted key leaks nowhere', async ({
	page
}) => {
	await stubOpenAi(page);
	await openShelf(page, 'simulator');

	// The battery, fitted through Settings as a visitor would.
	await page.goto('settings');
	await page.getByTestId('key-input-openai').fill(FAKE_KEY);
	await page.getByTestId('insert-battery-openai').click();
	await expect(page.getByTestId('charge-state-openai')).toHaveAttribute('data-charge', 'charged');

	// The door is a link to the section that has it, not a toggle (§11 item 5).
	await expect(page.getByTestId('workshop-door-link')).toBeVisible();
	await expect(page.getByTestId('workshop-door-link').getByRole('link')).toHaveAttribute(
		'href',
		'/workshop/'
	);
	await expect(page.getByText('Show the Workshop')).toHaveCount(0);

	await page.goto('');
	const agentId = await playToTheEnd(page);
	expect(await page.content()).not.toContain(FAKE_KEY);

	// The exported kit file: the download a visitor would take away.
	await page.goto('');
	const download = page.waitForEvent('download');
	await page.getByTestId(`export-card-${agentId}`).click();
	const file = await (await download).path();
	const { readFileSync } = await import('node:fs');
	expect(readFileSync(file as string, 'utf8')).not.toContain(FAKE_KEY);
});

test('the shelf sends the Playground box to its section, and a Workshop route is not in this box', async ({
	page
}) => {
	await openShelf(page, 'simulator');
	await expect(page.getByTestId('pack-link-retail-bank-playground')).toHaveAttribute(
		'href',
		'/playground/'
	);
	await expect(page.getByTestId('pack-explorers-world')).toContainText('Unlocked!');
	await expect(page.getByTestId('nav-workshop')).toHaveCount(0);

	await clientGoto(page, 'simulator', '/workshop/runs');
	await expect(page.getByTestId('not-in-this-box')).toBeVisible();
	await expect(page.getByTestId('not-in-this-box')).toContainText('The Workshop');
	await expect(page.getByTestId('not-in-this-box-section')).toHaveAttribute('href', '/workshop/');
	await page.getByTestId('not-in-this-box-home').click();
	await expect(page.getByTestId('new-bot')).toBeVisible();
});
