import { expect, test } from '@playwright/test';
import { skipTutorial } from './support.js';

/**
 * The Playground (WP59 stage C, `48-FS-BANK.md` §4.8): a seed makes a case
 * on the case file — what is on the desk, what a look-up earns, the truth
 * under the flap — and the nine lines sit on a boundary map.
 */
test('the Playground generates a case from a seed and shows the nine lines', async ({ page }) => {
	await skipTutorial(page);
	await page.goto('/workshop/playground');
	await expect(page.getByTestId('playground-simulation-only')).toBeVisible();
	await page.getByTestId('playground-seed').fill('42');
	await page.getByTestId('playground-generate').click();
	await expect(page.getByTestId('playground-customer-value')).not.toBeEmpty();
	// The bank's notice on the desk; the customer on file; the truth under the flap.
	await expect(
		page.getByTestId('playground-revealed').getByTestId('desk-record-notice')
	).toBeVisible();
	await expect(
		page.getByTestId('playground-hidden').getByTestId('desk-record-customer')
	).toBeVisible();
	await expect(page.getByTestId('playground-hidden').getByTestId('desk-truth')).toBeVisible();
	await expect(
		page.getByTestId('playground-hidden').getByTestId('desk-truth-cohort')
	).toBeAttached();
	// The same seed is the same customer.
	const first = await page.getByTestId('playground-customer-value').textContent();
	await page.getByTestId('playground-generate').click();
	await expect(page.getByTestId('playground-customer-value')).toHaveText(first ?? '');
	// Nine lines on the map and in the list.
	await expect(page.locator('[data-testid^="playground-line-"]')).toHaveCount(9);
	await expect(page.locator('[data-testid^="playground-map-node-service-line-"]')).toHaveCount(9);
});

test('the Advice Desk page generates a case with its suitable set under the flap, and lists the decks, cards and evaluators on a map', async ({
	page
}) => {
	await skipTutorial(page);
	await page.goto('/workshop/playground');
	await page.getByTestId('playground-advice-link').click();
	await expect(page).toHaveURL(/\/workshop\/playground\/advice/);
	await expect(page.getByTestId('advice-simulation-only')).toBeVisible();
	await page.getByTestId('advice-layout').selectOption('bereavement');
	await page.getByTestId('advice-seed').fill('11');
	await page.getByTestId('advice-generate').click();
	await expect(
		page.getByTestId('advice-revealed').getByTestId('desk-record-desk-brief')
	).toBeVisible();
	await expect(
		page.getByTestId('advice-hidden').getByTestId('desk-record-answer-goal')
	).toBeVisible();
	await expect(
		page.getByTestId('advice-hidden').getByTestId('desk-truth-suitable-set')
	).toBeAttached();
	await expect(
		page.getByTestId('advice-hidden').getByTestId('desk-truth-fact-discloses')
	).toHaveText('true');
	// Thirty scenarios, seven cards, thirteen evaluators, and the CRM line outside the map.
	await expect(page.getByTestId('advice-decks').locator('tbody tr')).toHaveCount(30);
	await expect(page.getByTestId('advice-cards').locator('li')).toHaveCount(7);
	await expect(page.getByTestId('advice-evaluators').locator('li')).toHaveCount(13);
	await expect(page.locator('[data-testid^="advice-map-node-service-line-"]')).toHaveCount(1);
});
