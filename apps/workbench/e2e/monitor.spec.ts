import { expect, test } from '@playwright/test';
import { skipTutorial } from './support.js';

/**
 * **The Monitor** (WP84, `75-THE-MONITOR.md` §7; `64-…` §6.5.3): a month at
 * the lending desk at `Infinity` on a small population runs in the Worker;
 * Pause freezes the fold while the day goes on and the rail answers a click
 * mid-run; a Readout reads the fold's count; Replay draws the same picture.
 */
test.beforeEach(async ({ page }) => skipTutorial(page));

test('a month at the lending desk streams into the Monitor, pauses, answers the rail, and replays the same picture', async ({
	page
}) => {
	test.setTimeout(180_000);
	await page.goto('/workshop/monitor');
	await expect(page.getByTestId('monitor-page')).toBeVisible();
	await expect(page.getByTestId('monitor-empty')).toBeVisible();
	await page.getByTestId('monitor-from').fill('2026-06-01');
	await page.getByTestId('monitor-to').fill('2026-06-30');
	await page.getByTestId('monitor-size').fill('2000');
	await page.getByTestId('monitor-desk-configuration-lending').selectOption('bot-everywhere');
	await page.getByTestId('monitor-run').click();
	await expect(page.getByTestId('monitor-status')).toContainText('running');

	// Mid-run, the rail works — and the day keeps running in the Worker.
	await page.getByTestId('rail-runs').click();
	await expect(page).toHaveURL(/\/workshop\/runs$/);
	await page.getByTestId('rail-monitor').click();
	await expect(page.getByTestId('monitor-status')).toContainText(/running|done/);
	await expect(page.getByTestId('monitor-status')).toContainText('done', { timeout: 120_000 });

	// The readout is the fold's count: the runs in the window equal what was folded.
	const folded = await page.getByTestId('monitor-folded-value').textContent();
	const [foldedCount, keptCount] = (folded ?? '')
		.split('/')
		.map((part) => Number.parseInt(part, 10));
	expect(foldedCount).toBeGreaterThan(0);
	expect(foldedCount).toBe(keptCount);
	await expect(page.getByTestId('readout-runs-value')).toHaveText(String(foldedCount));
	await expect(page.getByTestId('queue-lending')).toContainText(String(foldedCount));
	const approval = await page.getByTestId('readout-approval-value').textContent();
	const decided = await page.getByTestId('readout-decided-value').textContent();

	// Pause freezes the numbers; Replay redraws the same picture.
	await page.getByTestId('monitor-pause').click();
	await expect(page.getByTestId('monitor-status')).toContainText('paused');
	await page.getByTestId('monitor-replay').click();
	await expect(page.getByTestId('monitor-folded-value')).toContainText(
		`${foldedCount} / ${keptCount}`,
		{ timeout: 30_000 }
	);
	await expect(page.getByTestId('readout-runs-value')).toHaveText(String(foldedCount));
	await expect(page.getByTestId('readout-approval-value')).toHaveText(approval ?? '');
	await expect(page.getByTestId('readout-decided-value')).toHaveText(decided ?? '');
	await expect(page.getByTestId('tape-rates')).toBeVisible();
	await expect(page.getByTestId('monitor-drift')).toContainText('outcome-mix');
	await expect(page.getByTestId('monitor-fairness')).toBeVisible();
});
