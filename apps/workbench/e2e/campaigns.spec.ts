import { expect, test } from '@playwright/test';
import { injectionBaseline } from '@craftabot/evals';
import { skipTutorial } from './support.js';

/**
 * **WP38 stage D's definition of done, as a test** (`28-CAMPAIGNS.md` §10):
 * load the baseline, run it, see every gate green, drill a cell into the Run
 * Lab, reload and find the report listed — and, separately, make the red
 * edit and see the red gate.
 *
 * One seed rather than the shipped twenty: the gates are the same, and the
 * DoD is about the journey, not the cell count.
 */

test.beforeEach(async ({ page }) => skipTutorial(page));

test('the baseline runs green, a cell opens in the Run Lab, and the report survives a reload', async ({
	page
}) => {
	await page.goto('/workshop/campaigns');
	await expect(page.getByTestId('campaign-reports-empty')).toBeVisible();

	await page.getByTestId('campaign-source').fill(JSON.stringify(injectionBaseline([1])));
	await expect(page.getByTestId('campaign-size')).toHaveText('32 cells');
	await page.getByTestId('run-campaign').click();

	await expect(page.getByTestId('campaign-verdict')).toBeVisible({ timeout: 30_000 });
	await expect(page.getByTestId('campaign-verdict')).toContainText('✅ PASSED');
	await expect(page.getByTestId('campaign-verdict')).toContainText('13 of 13 gates');
	await expect(page.getByTestId('gate-guard-holds:false-alarm')).toContainText('✅ pass');

	// The attack really lands unguarded — the slice says so before anyone drills in.
	await page.getByTestId('slice-warning-sign-none-scripted-adversary').click();
	await expect(page.getByTestId('slice-runs')).toBeVisible();
	await page.getByTestId('open-campaign-cell-1').click();
	await expect(page.getByTestId('run-header')).toBeVisible();
	await expect(page.getByTestId('run-header')).toContainText('campaign · warning-sign · none');

	// The report is the record of the experiment, and it is kept.
	await page.goto('/workshop/campaigns');
	await expect(page.getByTestId('campaign-reports')).toBeVisible();
	await expect(page.locator('[data-testid^="campaign-report-"]')).toHaveCount(1);
	await page.locator('[data-testid^="open-report-"]').first().click();
	await expect(page.getByTestId('campaign-verdict')).toContainText('✅ PASSED');
});

test('removing a guard from a scenario that expects one turns its gate red', async ({ page }) => {
	const campaign = injectionBaseline([1]);
	campaign.guards.find((guard) => guard.id === 'policy-card')!.fit = [];

	await page.goto('/workshop/campaigns');
	await page.getByTestId('campaign-source').fill(JSON.stringify(campaign));
	await page.getByTestId('run-campaign').click();

	await expect(page.getByTestId('campaign-verdict')).toBeVisible({ timeout: 30_000 });
	await expect(page.getByTestId('campaign-verdict')).toContainText('❌ FAILED');
	await expect(page.getByTestId('campaign-verdict')).toContainText('11 of 13 gates');
	await expect(page.getByTestId('gate-guard-holds:keep-the-secret')).toContainText('❌ fail');
	await expect(page.getByTestId('gate-guard-holds:party-line')).toContainText('❌ fail');
	await expect(page.getByTestId('gate-guard-holds:warning-sign')).toContainText('✅ pass');
});

test('a campaign with a live brain is not run here, and says where to run it', async ({ page }) => {
	const campaign = injectionBaseline([1]);
	campaign.brains.push({ id: 'live', tier: 'live', cartridgeId: 'openai/quick-thinker' });
	campaign.budget = { maxLiveCells: 100 };

	await page.goto('/workshop/campaigns');
	await page.getByTestId('campaign-source').fill(JSON.stringify(campaign));
	await expect(page.getByTestId('campaign-live')).toContainText('run it from the harness');
	await expect(page.getByTestId('run-campaign')).toBeDisabled();
});

test('a file that is not a campaign is refused with the reason', async ({ page }) => {
	await page.goto('/workshop/campaigns');
	await page.getByTestId('campaign-source').fill('{ "schemaVersion": 1 }');
	await expect(page.getByTestId('campaign-problem')).toBeVisible();
	await expect(page.getByTestId('run-campaign')).toBeDisabled();
});
