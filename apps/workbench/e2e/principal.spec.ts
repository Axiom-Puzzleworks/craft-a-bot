import { expect, test } from '@playwright/test';
import { awaitRunSaved, buildReadyBot, skipTutorial } from './support.js';

/**
 * **The principal on the trace, from the browser** (WP65 stage C, `55-…`
 * §4.2, §4.5, §11 item 7): the name typed in Settings rides on every run
 * this browser starts; the Run Lab's header says who started the run, and
 * an action row shows the chain behind it — who, who approved, which rules
 * passed.
 */
test.beforeEach(async ({ page }) => skipTutorial(page));

test('a run carries the person at the keyboard, and the Run Lab shows the chain on an action', async ({
	page
}) => {
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
	const name = page.getByTestId('display-name');
	await expect(name).toBeVisible();
	await name.fill('Sam');
	await name.press('Enter');
	// The name is kept: reload and it is still there.
	await page.reload();
	await expect(page.getByTestId('display-name')).toHaveValue('Sam');

	const agentId = await buildReadyBot(page, 'card-snack');
	await page.goto(`/bench/${agentId}`);
	await page.getByRole('button', { name: /GO/ }).click();
	await page.getByTestId('step').click();
	await expect(page.getByTestId('world-view')).toBeVisible();
	await page.getByTestId('stop').click();
	await awaitRunSaved(page);

	await page.goto('/workshop/runs');
	const row = page.locator('[data-testid^="run-row-"]').first();
	const runId = (await row.getAttribute('data-testid'))?.replace('run-row-', '') ?? '';
	await page.goto(`/workshop/runs/${runId}`);
	await expect(page.getByTestId('run-header')).toBeVisible();
	await expect(page.getByTestId('run-principal')).toContainText('started by Sam');
	await expect(page.getByTestId('run-principal')).toHaveAttribute('data-kind', 'person');

	// The chain on an action row: the person, nobody asked, and no rule in this build looked.
	await page
		.locator('[data-testid^="row-"] .type', { hasText: /^action\.performed$/ })
		.first()
		.click();
	await expect(page.getByTestId('chain')).toBeVisible();
	await expect(page.getByTestId('chain-who')).toContainText('person');
	await expect(page.getByTestId('chain-who')).toContainText('Sam');
	await expect(page.getByTestId('chain-approved-by')).toContainText('nobody was asked');
	await expect(page.getByTestId('chain-rules')).toBeVisible();

	// A row that is not an action has no chain.
	await page
		.locator('[data-testid^="row-"] .type', { hasText: /^run\.started$/ })
		.first()
		.click();
	await expect(page.getByTestId('chain')).toHaveCount(0);
});

test('with no name set the run still names the browser, by id alone', async ({ page }) => {
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
	const agentId = await buildReadyBot(page, 'card-snack');
	await page.goto(`/bench/${agentId}`);
	await page.getByRole('button', { name: /GO/ }).click();
	await page.getByTestId('step').click();
	await expect(page.getByTestId('world-view')).toBeVisible();
	await page.getByTestId('stop').click();
	await awaitRunSaved(page);
	await page.goto('/workshop/runs');
	const row = page.locator('[data-testid^="run-row-"]').first();
	const runId = (await row.getAttribute('data-testid'))?.replace('run-row-', '') ?? '';
	await page.goto(`/workshop/runs/${runId}`);
	const chip = page.getByTestId('run-principal');
	await expect(chip).toContainText('started by');
	// A UUID, not a name — minted once for this browser.
	await expect(chip).toContainText(/[0-9a-f]{8}-[0-9a-f]{4}-/);
});
