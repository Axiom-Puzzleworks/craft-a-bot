import { expect, test, type Page } from '@playwright/test';
import { skipTutorial } from './support.js';

/**
 * **The Conduct and Model-risk lenses** (WP88, `79-CONDUCT-AND-MODEL-RISK.md`
 * §5; `64-…` §6.7): both pages say so when the store holds no report; a
 * small lending book run on Campaigns lands as one; Conduct reads it as the
 * compliance reviewer does — the four outcomes, the customers held to the
 * understanding outcome, a customer's row opening the Pipeline at the
 * governing stage (`explanation`) — and Model risk as the data scientist
 * does — the fairness rows across the book's cohort, the flip rate waiting
 * on a fork, the drift workbench against a reference, and the validation
 * suite run on demand.
 */
test.beforeEach(async ({ page }) => skipTutorial(page));

async function openTheWorkshopDoor(page: Page): Promise<void> {
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
}

/** The number on a Readout, as the page shows it. */
async function countOf(page: Page, testId: string): Promise<number> {
	const text = (await page.getByTestId(testId).textContent()) ?? '';
	return Number.parseInt(text.replace(/\D/g, ''), 10);
}

async function runASmallBook(page: Page): Promise<void> {
	await page.goto('/workshop/campaigns');
	await expect(page.getByTestId('books')).toBeVisible();
	await page.getByTestId('book-size').fill('40');
	await page.getByTestId('queue-book').click();
	await expect(page.getByTestId('book-note')).toContainText('work items drawn');
	await expect(page.getByTestId('campaign-verdict')).toBeVisible({ timeout: 120_000 });
}

test('both pages say the store is empty until a report lands', async ({ page }) => {
	await openTheWorkshopDoor(page);
	await page.goto('/workshop/conduct');
	await expect(page.getByTestId('conduct-page')).toBeVisible();
	await expect(page.getByTestId('conduct-empty')).toBeVisible();
	await page.goto('/workshop/model-risk');
	await expect(page.getByTestId('model-risk-page')).toBeVisible();
	await expect(page.getByTestId('model-risk-empty')).toBeVisible();
	// The lenses' entries now point here (WP88): the guided strip shows on each.
	await page.getByTestId('lens-switcher').selectOption('conduct');
	await page.goto('/workshop/conduct');
	await expect(page.getByTestId('first-run')).toContainText('Were customers treated');
	await page.getByTestId('lens-switcher').selectOption('model-risk');
	await page.goto('/workshop/model-risk');
	await expect(page.getByTestId('first-run')).toContainText('Is it fair');
});

test('Conduct reads a lending book — the four outcomes, and a customer opens the Pipeline at the governing stage', async ({
	page
}) => {
	test.setTimeout(180_000);
	await openTheWorkshopDoor(page);
	await runASmallBook(page);
	await page.goto('/workshop/conduct');
	await expect(page.getByTestId('conduct-entry')).toBeVisible();
	// The book draws the population's applicants, not every customer: read the count off the page.
	const customers = await countOf(page, 'conduct-customers');
	expect(customers).toBeGreaterThan(0);
	// The four outcomes, in the Consumer Duty's order, whether or not the book was held to each.
	for (const outcome of ['products-services', 'price-value', 'understanding', 'support']) {
		await expect(page.getByTestId(`conduct-outcome-fca-cd-${outcome}`)).toBeVisible();
	}
	// The lending workflow names the understanding outcome, so every customer sits under it.
	const understanding = page.getByTestId('conduct-cases-fca-cd-understanding');
	await expect(understanding.locator('tbody tr')).toHaveCount(customers);
	await expect(understanding.locator('tbody tr').first()).toContainText('explanation');
	// Every other obligation the book carried is listed after the four.
	await expect(page.getByTestId('conduct-outcome-fca-conc-affordability')).toBeVisible();
	await expect(page.getByTestId('conduct-vulnerability')).toBeVisible();
	// A customer's row opens the Pipeline at the governing stage.
	await understanding.locator('tbody tr').first().getByRole('button').click();
	await expect(page).toHaveURL(/\/workshop\/workflows\/[^/?]+\?stage=explanation$/);
	await expect(page.getByTestId('pipeline-page')).toBeVisible();
	await expect(page.getByTestId('pipeline-rail-stage-explanation')).toHaveAttribute(
		'aria-pressed',
		'true'
	);
});

test('Model risk reads the same book — the fairness rows, the flip rate waiting on a fork, drift against a reference, the suite', async ({
	page
}) => {
	test.setTimeout(180_000);
	await openTheWorkshopDoor(page);
	await runASmallBook(page);
	await page.goto('/workshop/model-risk');
	await expect(page.getByTestId('model-risk-entry')).toBeVisible();
	const samples = await countOf(page, 'model-risk-samples');
	expect(samples).toBeGreaterThan(10);
	// The fairness workbench: every metric but the flip as a row, the matched-pair row saying why it has no reading.
	const fairness = page.getByTestId('model-risk-fairness-table');
	expect(await fairness.locator('tbody tr').count()).toBeGreaterThanOrEqual(6);
	await expect(fairness).toContainText('demographic-parity');
	await expect(fairness).toContainText('no matched pairs');
	// A window smaller than the book narrows the sample.
	await page.getByTestId('model-risk-window').fill('10');
	await expect(page.getByTestId('model-risk-fairness')).toContainText('10 decided samples');
	// No fork yet: the flip rate says so.
	await expect(page.getByTestId('model-risk-flips-reason')).toContainText('no forks yet');
	// The drift workbench waits for a reference; with only one report there is none to choose.
	await expect(page.getByTestId('model-risk-drift-table')).toContainText('choose a reference');
	// The hazard's base rate is read off the book's performance labels — or the page says no sample carries one.
	await expect(
		page.getByTestId('model-risk-hazard-rate').or(page.getByTestId('model-risk-hazard-none'))
	).toBeVisible();
	// The validation suite runs here at a small seed count.
	await page.getByTestId('model-risk-validate').click();
	await expect(page.getByTestId('model-risk-validation-note')).toContainText('20 seeds');
	await expect(
		page.getByTestId('model-risk-validation-table').locator('tbody tr').first()
	).toBeVisible();
});
