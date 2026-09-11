import { expect, test, type Page } from '@playwright/test';
import { injectionBaseline } from '@craftabot/evals';
import { buildReadyBot, skipTutorial } from './support.js';

/**
 * **The lenses** (WP87, `78-LENSES.md` §5; `64-…` §6.7): every rail
 * destination renders under every lens with the lens's groups on the rail
 * (the matrix); the guided strip shows on a lens's entry, dismisses, and
 * stays dismissed across a reload; the Assurance entry renders for a bot
 * with no experiment and says *untested*; two reports open side by side in
 * Compare with their gates aligned by id.
 */
test.beforeEach(async ({ page }) => skipTutorial(page));

const LENSES = ['engineer', 'assurance', 'conduct', 'model-risk'] as const;
const RAIL = [
	'dashboard',
	'runs',
	'evals',
	'campaigns',
	'workflows',
	'evaluators',
	'scenarios',
	'sinks',
	'evidence',
	'playground',
	'policies',
	'bench',
	'telemetry',
	'monitor',
	'incidents',
	'safety-case',
	'assurance',
	'export',
	'guards'
] as const;

async function openTheWorkshopDoor(page: Page): Promise<void> {
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
}

test('every rail destination renders under every lens, grouped for the reader', async ({
	page
}) => {
	test.setTimeout(240_000);
	await openTheWorkshopDoor(page);
	await page.goto('/workshop');
	for (const lens of LENSES) {
		await page.getByTestId('lens-switcher').selectOption(lens);
		await expect(page.getByTestId('lens-switcher')).toHaveValue(lens);
		if (lens !== 'engineer')
			await expect(page.locator('[data-testid^="rail-group-"]').first()).toBeVisible();
		else await expect(page.locator('[data-testid^="rail-group-"]')).toHaveCount(0);
		for (const id of RAIL) {
			await page.getByTestId(`rail-${id}`).click();
			await expect(page.getByTestId('workshop')).toBeVisible();
			await expect(page.getByTestId(`rail-${id}`)).toHaveAttribute('aria-current', 'page');
		}
	}
	// The lens's words on the rail: the board reads Experiments, the compliance reviewer Treatment failures.
	await page.getByTestId('lens-switcher').selectOption('assurance');
	await expect(page.getByTestId('rail-campaigns')).toHaveText('Experiments');
	await page.getByTestId('lens-switcher').selectOption('conduct');
	await expect(page.getByTestId('rail-incidents')).toHaveText('Treatment failures');
	await page.getByTestId('lens-switcher').selectOption('engineer');
	await expect(page.getByTestId('rail-campaigns')).toHaveText('Campaigns');
});

test('the guided strip shows on the lens’s entry, dismisses, and stays dismissed; Settings remembers the lens', async ({
	page
}) => {
	await openTheWorkshopDoor(page);
	await page.getByTestId('settings-lens').selectOption('assurance');
	await page.goto('/workshop/assurance');
	await expect(page.getByTestId('first-run')).toBeVisible();
	await expect(page.getByTestId('first-run')).toContainText('Is it under control?');
	await expect(page.getByTestId('first-run-step-1')).toBeVisible();
	await page.getByTestId('first-run-dismiss').click();
	await expect(page.getByTestId('first-run')).toHaveCount(0);
	await page.reload();
	await expect(page.getByTestId('assurance-page')).toBeVisible();
	await expect(page.getByTestId('first-run')).toHaveCount(0);
	// Another lens's entry still offers its own path.
	await page.getByTestId('lens-switcher').selectOption('engineer');
	await page.goto('/workshop');
	await expect(page.getByTestId('first-run')).toContainText('What did it do?');
});

test('the Assurance entry renders for a bot with no experiment and says the register is untested', async ({
	page
}) => {
	await openTheWorkshopDoor(page);
	const agentId = await buildReadyBot(page, 'card-snack');
	await page.goto(`/workshop/assurance?agent=${agentId}`);
	await expect(page.getByTestId('assurance-entry')).toBeVisible();
	await expect(page.getByTestId('assurance-claim-inability')).toBeVisible();
	await expect(page.getByTestId('assurance-entry-incidents-value')).toHaveText('0');
	await expect(page.getByTestId('assurance-register-untested')).toContainText('Untested');
	await expect(page.getByTestId('assurance-register-table')).toBeVisible();
});

test('two reports open side by side in Compare with their gates aligned by id', async ({
	page
}) => {
	test.setTimeout(180_000);
	await openTheWorkshopDoor(page);
	await page.goto('/workshop/campaigns');
	for (const seed of [1, 2]) {
		await page.getByTestId('campaign-source').fill(JSON.stringify(injectionBaseline([seed])));
		await page.getByTestId('run-campaign').click();
		await expect(page.getByTestId('campaign-verdict')).toBeVisible({ timeout: 60_000 });
		await expect(page.locator('[data-testid^="campaign-report-"]')).toHaveCount(seed, {
			timeout: 10_000
		});
	}
	await page.goto('/workshop/assurance');
	await expect(page.getByTestId('assurance-compare')).toBeVisible();
	const options = await page
		.getByTestId('assurance-compare-a')
		.locator('option')
		.evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value).filter(Boolean));
	expect(options.length).toBeGreaterThanOrEqual(2);
	await page.getByTestId('assurance-compare-a').selectOption(options[0]!);
	await page.getByTestId('assurance-compare-b').selectOption(options[1]!);
	await page.getByTestId('assurance-compare-open').click();
	await expect(page).toHaveURL(/\/workshop\/compare\?reportA=.+&reportB=.+/);
	await expect(page.getByTestId('compare-reports')).toBeVisible();
	await expect(page.getByTestId(`compare-report-${options[0]}`)).toBeVisible();
	await expect(page.getByTestId(`compare-report-${options[1]}`)).toBeVisible();
	const rows = page.getByTestId('compare-gates').locator('tbody tr');
	await expect(rows.first()).toBeVisible();
	// Every gate row carries both reports' lamps: the same gates, aligned.
	const count = await rows.count();
	for (let index = 0; index < count; index += 1) {
		await expect(rows.nth(index).locator('td').nth(1)).not.toContainText('absent');
		await expect(rows.nth(index).locator('td').nth(3)).not.toContainText('absent');
	}
});
