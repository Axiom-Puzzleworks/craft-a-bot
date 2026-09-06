import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { awaitRunSaved, buildAndGo, buildReadyBot, skipTutorial } from './support.js';

/**
 * **The assurance pack in the Workshop** (WP67 stage C, `53-ASSURANCE-PACK.md`
 * §4.3, §11): the page files a bot's evidence with the posture at head and
 * foot; the HTML report downloads as one file that opens with no app and
 * passes axe; the Audit Centre offers the same download beside the bundle.
 */
test.beforeEach(async ({ page }) => skipTutorial(page));

const STANDARD = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

test('says so when the shelf is empty', async ({ page }) => {
	await page.goto('/workshop/assurance');
	await expect(page.getByTestId('assurance-no-agents')).toBeVisible();
});

test('files a built bot’s evidence, says what is not there yet, and the HTML report opens with no app and passes axe', async ({
	page
}) => {
	const agentId = await buildReadyBot(page, 'card-snack');
	await page.goto(`/workshop/assurance?agent=${agentId}`);
	await expect(page.getByTestId('assurance-page')).toBeVisible();
	await expect(page.getByTestId('assurance-posture')).toContainText('not a claim of compliance');
	await expect(page.getByTestId('assurance-runs-value')).toHaveText('0');
	await expect(page.getByTestId('assurance-no-campaigns')).toContainText('no campaign evidence');
	await expect(page.getByTestId('assurance-no-runs')).toContainText('no stored runs');
	await expect(page.getByTestId('assurance-governance')).toContainText(
		'not recorded in this build (WP65)'
	);
	// Every registered map is filed: the generic one, the bank's, the three desks'. Nothing is pending since WP72.
	await expect(page.getByTestId('assurance-control-table').locator('tbody tr')).not.toHaveCount(0);
	await expect(page.getByTestId('assurance-pending-value')).toHaveText('0');

	const { violations } = await new AxeBuilder({ page }).withTags(STANDARD).analyze();
	expect(violations.map((v) => `${v.id}: ${v.help}`).join('\n')).toBe('');

	const downloadPromise = page.waitForEvent('download');
	await page.getByTestId('assurance-download-html').click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toMatch(/\.assurance-pack\.html$/);
	const html = await readFile(await download.path(), 'utf8');
	expect(html.startsWith('<!doctype html>')).toBe(true);
	expect(html).not.toMatch(/<script/i);

	// The report, opened with no app: a blank page, the file's own markup, axe over it.
	await page.goto('about:blank');
	await page.setContent(html);
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Assurance pack');
	await expect(page.locator('caption', { hasText: 'Generic frameworks' })).toBeVisible();
	const report = await new AxeBuilder({ page }).withTags(STANDARD).analyze();
	expect(report.violations.map((v) => `${v.id}: ${v.help}`).join('\n')).toBe('');
});

test('a run makes the pack cite it, and the Audit Centre downloads the same report', async ({
	page
}) => {
	await buildAndGo(page, 'card-snack');
	await page.getByTestId('step').click();
	await page.getByTestId('stop').click();
	await awaitRunSaved(page);

	await page.goto('/workshop/runs');
	const row = page.locator('[data-testid^="run-row-"]').first();
	const runId = (await row.getAttribute('data-testid'))?.replace('run-row-', '') ?? '';
	await page.goto(`/workshop/export?run=${runId}`);
	await expect(page.getByTestId('export-page')).toBeVisible();
	const downloadPromise = page.waitForEvent('download');
	await page.getByTestId('export-download-assurance').click();
	const download = await downloadPromise;
	const html = await readFile(await download.path(), 'utf8');
	expect(html).toContain(`id="run-${runId}"`);
	expect(html).toContain(`href="#run-${runId}"`);
});
