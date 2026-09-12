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
	// Ten lines on the map and in the list (the graph line joined with WP81).
	await expect(page.locator('[data-testid^="playground-line-"]')).toHaveCount(10);
	await expect(page.locator('[data-testid^="playground-map-node-service-line-"]')).toHaveCount(10);
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
	// Thirty-one scenarios (the incident deck's one included, WP72), seven cards, thirteen evaluators, and the CRM line outside the map.
	await expect(page.getByTestId('advice-decks').locator('tbody tr')).toHaveCount(31);
	await expect(page.getByTestId('advice-cards').locator('li')).toHaveCount(7);
	await expect(page.getByTestId('advice-evaluators').locator('li')).toHaveCount(13);
	await expect(page.locator('[data-testid^="advice-map-node-service-line-"]')).toHaveCount(1);
});

test('the Fraud Desk page generates a case with its labels under the flap, and lists the decks, cards and evaluators on a map', async ({
	page
}) => {
	await skipTutorial(page);
	await page.goto('/workshop/playground');
	await page.getByTestId('playground-fraud-link').click();
	await expect(page).toHaveURL(/\/workshop\/playground\/fraud/);
	await page.getByTestId('fraud-layout').selectOption('queue-mixed');
	await page.getByTestId('fraud-seed').fill('5');
	await page.getByTestId('fraud-generate').click();
	await expect(page.getByTestId('fraud-revealed').getByTestId('desk-record-alert-1')).toBeVisible();
	await expect(page.getByTestId('fraud-alert-count-value')).toHaveText('5');
	await expect(page.getByTestId('fraud-hidden').getByTestId('desk-record-crm-notes')).toBeVisible();
	await expect(
		page.getByTestId('fraud-hidden').getByTestId('desk-truth-alert-truth-1')
	).toBeAttached();
	await expect(page.getByTestId('fraud-decks').locator('tbody tr')).toHaveCount(18);
	await expect(page.getByTestId('fraud-cards').locator('li')).toHaveCount(5);
	await expect(page.getByTestId('fraud-evaluators').locator('li')).toHaveCount(10);
	await expect(page.locator('[data-testid^="fraud-map-node-service-line-"]')).toHaveCount(1);
});

test('the Lending Desk page generates a case with its verdict under the flap, and lists the decks, cards and evaluators on a map', async ({
	page
}) => {
	await skipTutorial(page);
	await page.goto('/workshop/playground');
	await page.getByTestId('playground-lending-link').click();
	await expect(page).toHaveURL(/\/workshop\/playground\/lending/);
	await page.getByTestId('lending-layout').selectOption('matched-pair');
	await page.getByTestId('lending-seed').fill('5');
	await page.getByTestId('lending-generate').click();
	await expect(
		page.getByTestId('lending-revealed').getByTestId('desk-record-application')
	).toBeVisible();
	await expect(page.getByTestId('lending-amount-value')).toHaveText('£8300');
	await expect(
		page.getByTestId('lending-hidden').getByTestId('desk-record-affordability-worksheet')
	).toBeVisible();
	await expect(page.getByTestId('lending-hidden').getByTestId('desk-truth-verdict')).toBeAttached();
	await expect(page.getByTestId('lending-decks').locator('tbody tr')).toHaveCount(17);
	await expect(page.getByTestId('lending-cards').locator('li')).toHaveCount(5);
	await expect(page.getByTestId('lending-evaluators').locator('li')).toHaveCount(5);
	await expect(page.locator('[data-testid^="lending-map-node-service-line-"]')).toHaveCount(1);
});

// WP72 (`61-LAST-DECKS.md` §5): the complaints desk beside the three, a case from a seed with the finding under the flap.
test('the Complaints Desk generates a case with its bounds, and lists its deck', async ({
	page
}) => {
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
	await page.goto('/workshop/playground');
	await page.getByTestId('playground-complaints-link').click();
	await expect(page.getByTestId('complaints-simulation-only')).toBeVisible();
	await page.getByTestId('complaints-layout').selectOption('unfounded');
	await page.getByTestId('complaints-generate').click();
	await expect(page.getByTestId('complaints-bounds')).toContainText('£0–£0');
	await expect(page.getByTestId('complaints-ack-by')).toContainText('turn 2');
	await expect(page.getByTestId('complaints-case')).toBeVisible();
	await expect(page.getByTestId('complaints-deck').locator('tbody tr')).toHaveCount(7);
	await expect(page.getByTestId('complaints-evaluators').locator('li')).toHaveCount(3);
});

// WP103 (`95-FS-ONBOARDING.md` §4.7): the Onboarding Desk beside the three — a case from a seed, the screening and the rating under the flap.
test('the Onboarding Desk generates a case with the list under the flap, and lists its decks', async ({
	page
}) => {
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
	await page.goto('/workshop/playground');
	await page.getByTestId('playground-onboarding-link').click();
	await expect(page.getByTestId('onboarding-simulation-only')).toBeVisible();
	await page.getByTestId('onboarding-layout').selectOption('screening-hit');
	await page.getByTestId('onboarding-generate').click();
	await expect(page.getByTestId('onboarding-product')).toContainText('current');
	await expect(
		page.getByTestId('onboarding-hidden').getByTestId('desk-truth-verdict')
	).toBeAttached();
	await expect(page.getByTestId('onboarding-decks').locator('tbody tr')).toHaveCount(10);
	await expect(page.getByTestId('onboarding-cards').locator('li')).toHaveCount(3);
	await expect(page.getByTestId('onboarding-evaluators').locator('li')).toHaveCount(4);
	await expect(page.locator('[data-testid^="onboarding-map-node-service-line-"]')).toHaveCount(1);
});

// WP104 (`90-FS-DISPUTES.md` §7): the Disputes Desk — a case from a seed, the classification and the limit under the flap.
test('the Disputes Desk generates a case with the rule under the flap, and lists its decks', async ({
	page
}) => {
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
	await page.goto('/workshop/playground');
	await page.getByTestId('playground-disputes-link').click();
	await expect(page.getByTestId('disputes-simulation-only')).toBeVisible();
	await page.getByTestId('disputes-layout').selectOption('app-scam-above-limit');
	await page.getByTestId('disputes-generate').click();
	await expect(page.getByTestId('disputes-amount')).toContainText('92,000');
	await expect(
		page.getByTestId('disputes-hidden').getByTestId('desk-truth-verdict')
	).toBeAttached();
	await expect(page.getByTestId('disputes-decks').locator('tbody tr')).toHaveCount(10);
	await expect(page.getByTestId('disputes-cards').locator('li')).toHaveCount(4);
	await expect(page.getByTestId('disputes-evaluators').locator('li')).toHaveCount(4);
	await expect(page.locator('[data-testid^="disputes-map-node-service-line-"]')).toHaveCount(1);
});

// WP105 (`91-FS-COLLECTIONS.md` §7): the Collections Desk — a case from a seed, the plan and the disclosure under the flap.
test('the Collections Desk generates a case with the rule under the flap, and lists its decks', async ({
	page
}) => {
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
	await page.goto('/workshop/playground');
	await page.getByTestId('playground-collections-link').click();
	await expect(page.getByTestId('collections-simulation-only')).toBeVisible();
	await page.getByTestId('collections-layout').selectOption('job-loss');
	await page.getByTestId('collections-generate').click();
	await expect(page.getByTestId('collections-missed')).toContainText('2');
	await expect(
		page.getByTestId('collections-hidden').getByTestId('desk-truth-verdict')
	).toBeAttached();
	await expect(page.getByTestId('collections-decks').locator('tbody tr')).toHaveCount(10);
	await expect(page.getByTestId('collections-cards').locator('li')).toHaveCount(4);
	await expect(page.getByTestId('collections-evaluators').locator('li')).toHaveCount(4);
	await expect(page.locator('[data-testid^="collections-map-node-service-line-"]')).toHaveCount(1);
});
