import { expect, test } from '@playwright/test';
import { injectionBaseline } from '@craftabot/evals';
import { buildReadyBot, skipTutorial } from './support.js';

/**
 * **The safety case quotes a campaign** (`37-DRIFT-SAFETY-CASE-RUN-LAB.md`
 * §4.2, WP49): a shelf bot added to the baseline as a build, run on the
 * campaigns page, is quoted on its own safety case with the gates that
 * applied to it — and a bot that never ran in one says so.
 */

test.beforeEach(async ({ page }) => skipTutorial(page));

test('a bot that ran in a campaign quotes its gate results; one that did not says so', async ({
	page
}) => {
	const agentId = await buildReadyBot(page, 'card-snack');

	await page.goto(`/workshop/safety-case?agent=${agentId}`);
	await expect(page.getByTestId('safety-case-head')).toBeVisible();
	await expect(page.getByTestId('campaign-evidence-empty')).toBeVisible();
	await expect(page.getByTestId('evaluation-evidence-empty')).toBeVisible();

	// One scenario, one guard, one brain, one seed: enough to see the build, quick enough to run here.
	const base = injectionBaseline([1]);
	const campaign = {
		...base,
		scenarios: base.scenarios.slice(0, 1),
		guards: base.guards.slice(0, 1),
		brains: base.brains.slice(0, 1),
		gates: [base.gates[0]]
	};
	await page.goto('/workshop/campaigns');
	await page.getByTestId('campaign-source').fill(JSON.stringify(campaign));
	await page.getByTestId('shelf-bot-picker').selectOption({ index: 1 });
	await page.getByTestId('add-shelf-bot').click();
	await expect(page.getByTestId('campaign-note')).toContainText('Added');
	await expect(page.getByTestId('campaign-size')).toHaveText('2 cells');
	await page.getByTestId('run-campaign').click();
	await expect(page.getByTestId('campaign-verdict')).toBeVisible({ timeout: 30_000 });

	await page.goto(`/workshop/safety-case?agent=${agentId}`);
	await expect(page.getByTestId('campaign-evidence')).toBeVisible();
	await expect(page.getByTestId('campaign-evidence')).toContainText(base.title);
	await expect(page.getByTestId('campaign-evidence')).toContainText('1 cells');
	await expect(page.getByTestId(`campaign-gate-${base.gates[0]!.id}`)).toBeVisible();
});
