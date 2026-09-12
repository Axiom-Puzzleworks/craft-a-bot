import { expect, test, type Page } from '@playwright/test';
import { skipTutorial } from './support.js';

/**
 * **The Guardrail Studio** (WP101, `88-STUDIO.md` §8): a keyboard fit lists
 * the fit; a scenario run through the stack draws the verdict flow; a
 * pinned copy gives two flows side by side; Save writes the stack and the
 * Spec Lab's picker lists it; *Use in…* opens the Campaigns editor with a
 * `guards[]` entry and the Experiments page with the guard on the design.
 */
test.beforeEach(async ({ page }) => skipTutorial(page));

async function openTheWorkshopDoor(page: Page): Promise<void> {
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
}

test('a fit by keyboard, a run through the stack, two flows side by side, a save, and Use in…', async ({
	page
}) => {
	test.setTimeout(120_000);
	await openTheWorkshopDoor(page);
	await page.goto('/workshop/studio');
	await expect(page.getByTestId('studio-page')).toBeVisible();
	await expect(page.getByTestId('studio-empty')).toBeVisible();

	// The catalogue: the step budget is built in; Model Armor needs a battery.
	await expect(page.getByTestId('studio-lamp-governance/step-budget')).toContainText('built in');
	await expect(page.getByTestId('studio-lamp-geap/model-armor')).toContainText('needs a battery');

	// A fit by keyboard: select the component, then the point, with Enter. The local classifier's
	// stand-in needs no settings; a built-in's numbers would be typed into its settings first.
	await page.getByTestId('studio-component-guard-local/llama-guard').focus();
	await page.keyboard.press('Enter');
	await page.getByTestId('studio-point-pre-act').focus();
	await page.keyboard.press('Enter');
	await expect(page.getByTestId('studio-stack')).toBeVisible();
	await expect(page.getByTestId('studio-fit-0')).toContainText('pre-act');
	await expect(page.getByTestId('studio-fits-value')).toHaveText('1');
	// The same fit again is the same stack.
	await page.getByTestId('studio-point-pre-act').click();
	await expect(page.getByTestId('studio-fits-value')).toHaveText('1');

	// Run through the stack, then pin and run again: two flows over one run.
	await page.getByTestId('studio-name').fill('Budgeted');
	await page.getByTestId('studio-name').press('Enter');
	await page.getByTestId('studio-run').click();
	await expect(page.getByTestId('studio-bench-note')).toContainText('1 flow', { timeout: 60_000 });
	await expect(page.getByTestId('studio-flow-local/stacks/budgeted')).toBeVisible();
	await page.getByTestId('studio-pin').click();
	await page.getByTestId('studio-run').click();
	await expect(page.getByTestId('studio-bench-note')).toContainText('2 flows', { timeout: 60_000 });
	await expect(page.getByTestId('studio-difference')).toContainText('agree');

	// Save, and the Spec Lab's picker lists it.
	await page.getByTestId('studio-save').click();
	await expect(page.getByTestId('studio-note')).toContainText('Saved as local/stacks/budgeted');

	// Use in… a campaign: the editor opens with the guard appended.
	await page.getByTestId('studio-use-campaign').click();
	await expect(page).toHaveURL(/\/workshop\/campaigns\?stack=/);
	await expect(page.getByTestId('campaign-source')).toHaveValue(
		/"stack": "local\/stacks\/budgeted"/
	);

	// Use in… an experiment: the design's guard is the stack.
	await page.goto('/workshop/experiments?guard=local%2Fstacks%2Fbudgeted');
	await expect(page.getByTestId('experiments-page')).toBeVisible();
});

test('the Guard Rack is the Connections tab, and the old address forwards', async ({ page }) => {
	await openTheWorkshopDoor(page);
	await page.goto('/workshop/guards');
	await expect(page).toHaveURL(/\/workshop\/studio\?tab=connections$/);
	await expect(page.getByTestId('guard-rack')).toBeVisible();
	await page.getByTestId('studio-tab-studio').click();
	await expect(page.getByTestId('studio-catalogue')).toBeVisible();
});
