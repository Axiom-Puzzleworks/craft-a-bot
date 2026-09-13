import { expect, test } from '@playwright/test';

/**
 * **The Guardrail Catalogue** (WP98, `86-CATALOGUE.md` §7): the page lists
 * every entry with its coverage, the filters narrow by threat, maturity and
 * status, a row opens the entry with its sources, and what the product does
 * not claim is said in so many words. The Assurance lens's entry carries the
 * same counts beneath the register.
 */
test('the catalogue lists every entry, filters, and opens an entry with its sources', async ({
	page
}) => {
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
	await page.goto('/workshop/catalogue');
	await expect(page.getByTestId('catalogue-lede')).toContainText('pending review');
	const count = page.getByTestId('catalogue-count');
	const total = Number((await count.textContent())?.split(' of ')[1]);
	expect(total).toBeGreaterThanOrEqual(40);
	await expect(count).toHaveText(`${total} of ${total}`);

	await page.getByTestId('catalogue-filter-status').selectOption('not-applicable');
	await expect(count).not.toHaveText(`${total} of ${total}`);
	const narrowed = Number((await count.textContent())?.split(' of ')[0]);
	expect(narrowed).toBeGreaterThan(0);
	expect(narrowed).toBeLessThan(total);
	await page.getByTestId('catalogue-filter-status').selectOption('');
	await page.getByTestId('catalogue-filter-threat').selectOption('ASI01');
	expect(Number((await count.textContent())?.split(' of ')[0])).toBeLessThan(total);
	await page.getByTestId('catalogue-filter-threat').selectOption('');

	await page.getByTestId('catalogue-table').getByText('Step and token budgets').first().click();
	const entry = page.getByTestId('catalogue-entry');
	await expect(entry).toContainText('budget-cap');
	await expect(entry).toContainText('shipped');
	await expect(entry).toContainText('governance/step-budget');
	await expect(entry).toContainText('Sources');
	await expect(page.getByTestId('catalogue-open-guards')).toBeVisible();
	await expect(page.getByTestId('catalogue-not-claimed')).toContainText(
		'Not applicable to a simulator'
	);
});

test('the Assurance entry carries the coverage beneath the register', async ({ page }) => {
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
	await page.goto('/workshop/assurance');
	await expect(page.getByTestId('assurance-coverage-note')).toContainText('pending review');
	await expect(page.getByTestId('assurance-not-claimed')).toContainText('Blueprint only');
	await page.getByTestId('assurance-open-catalogue').click();
	await expect(page).toHaveURL(/\/workshop\/catalogue/);
	await expect(page.getByTestId('catalogue-table')).toBeVisible();
});
