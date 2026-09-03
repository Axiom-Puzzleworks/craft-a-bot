import { expect, test } from '@playwright/test';
import { buildAndGo, skipTutorial } from './support.js';

/**
 * **Drift** (`37-DRIFT-SAFETY-CASE-RUN-LAB.md` §4.1, WP49): the telemetry
 * screen renders a two-week corpus as a series and flags the planted drift.
 *
 * The corpus is seeded straight into the app's own IndexedDB — the same
 * `runs` and `runSummaries` rows the Kit writes — cloned from one real run
 * so every record is a record the store accepts. Ten quiet days where the
 * action blocklist does the catching, then four where the mix flips to the
 * step budget and most runs loop; the fold in governance carries the same
 * fixture, and this proves the screen draws what the fold says.
 */

test.beforeEach(async ({ page }) => skipTutorial(page));

test('renders a two-week corpus as a daily series and flags the planted drift', async ({
	page
}) => {
	// One real run, so there is a valid record to clone.
	await buildAndGo(page, 'card-snack');
	await page.getByTestId('step').click();
	await expect(page.getByTestId('world-view')).toBeVisible();

	const seeded = await page.evaluate(async () => {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open('craftabot');
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const read = <T>(store: string) =>
			new Promise<T[]>((resolve, reject) => {
				const request = db.transaction(store).objectStore(store).getAll();
				request.onsuccess = () => resolve(request.result as T[]);
				request.onerror = () => reject(request.error);
			});
		const runs = await read<Record<string, unknown>>('runs');
		const template = runs[0];
		if (!template) return 0;

		const DAY = 24 * 60 * 60 * 1000;
		const start = Date.UTC(2026, 7, 17);
		const tx = db.transaction(['runs', 'runSummaries'], 'readwrite');
		let count = 0;
		for (let day = 0; day < 14; day += 1) {
			const drifted = day >= 10;
			for (let n = 0; n < 4; n += 1) {
				const looped = drifted ? n < 3 : n === 0;
				const id = crypto.randomUUID();
				const startedAt = new Date(start + day * DAY + (9 + n) * 60 * 60 * 1000).toISOString();
				tx.objectStore('runs').put({
					...template,
					id,
					outcome: looped ? 'OUT_OF_STEPS' : 'SUCCESS',
					ticks: looped ? 30 : 6,
					pinned: false,
					startedAt,
					finishedAt: new Date(Date.parse(startedAt) + 60_000).toISOString()
				});
				tx.objectStore('runSummaries').put({
					runId: id,
					checks: 6,
					saves: 2,
					guardrailTrips: drifted
						? { 'safety/step-budget': 2, ...(n === 3 ? { 'safety/action-blocklist': 1 } : {}) }
						: { 'safety/action-blocklist': 2, ...(n === 3 ? { 'safety/step-budget': 1 } : {}) },
					approvalsRequested: 0,
					approvalsGranted: 0,
					findings: [],
					decisions: 6,
					hostedPreActScreens: 0,
					schemaVersion: 1
				});
				count += 1;
			}
		}
		await new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
		db.close();
		return count;
	});
	expect(seeded).toBe(56);

	await page.goto('/workshop/telemetry');
	await expect(page.getByTestId('telemetry-series')).toBeVisible();
	// Fourteen seeded days plus the gap up to the real run's own day — every day a row.
	await expect(page.getByTestId('series-2026-08-17')).toContainText('safety/action-blocklist');
	await expect(page.getByTestId('series-2026-08-27')).toContainText('safety/step-budget');
	await expect(page.getByTestId('series-2026-08-20')).toHaveAttribute('data-runs', '4');

	// The planted day is flagged for both its trip mix and its loop rate.
	await expect(page.getByTestId('telemetry-drift')).toBeVisible();
	await expect(page.getByTestId('drift-2026-08-27-trip-mix')).toContainText('safety/step-budget');
	await expect(page.getByTestId('drift-2026-08-27-loop-rate')).toContainText('looped 25% → 75%');
	await expect(page.getByTestId('drift-2026-08-20-trip-mix')).toHaveCount(0);
});

test('says what it would have taken when nothing has drifted', async ({ page }) => {
	await buildAndGo(page, 'card-snack');
	await page.getByTestId('step').click();
	await expect(page.getByTestId('world-view')).toBeVisible();

	await page.goto('/workshop/telemetry');
	await expect(page.getByTestId('telemetry-series')).toBeVisible();
	await expect(page.getByTestId('telemetry-drift-short')).toContainText('Not enough history');
});
