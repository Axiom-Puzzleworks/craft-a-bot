import { expect, test, type Page } from '@playwright/test';
import { buildAndGo, skipTutorial } from './support.js';

/**
 * **A run that survives the tab being shut** (`16-…` §1.4, `12-…` D15/D14).
 *
 * A run used to be written in one go when it ended, so closing the tab halfway
 * through lost it completely — no record, no partial trace, nothing to find
 * afterwards. `RunRecord.outcome` has carried `IN_PROGRESS` since WP13 for
 * exactly this case, and the schema says so in as many words; nothing ever
 * wrote one.
 *
 * Only a browser can settle this, because the thing being tested is what
 * survives the page going away.
 */

test.beforeEach(async ({ page }) => skipTutorial(page));

/** Read the stored runs straight out of IndexedDB, as a returning visitor would. */
async function storedRuns(page: Page): Promise<{ outcome: string; ticks: number; id: string }[]> {
	return page.evaluate(async () => {
		const open = indexedDB.open('craftabot');
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			open.onsuccess = () => resolve(open.result);
			open.onerror = () => reject(open.error);
		});
		const rows = await new Promise<{ outcome: string; ticks: number; id: string }[]>(
			(resolve, reject) => {
				const request = db.transaction('runs').objectStore('runs').getAll();
				request.onsuccess = () => resolve(request.result as never);
				request.onerror = () => reject(request.error);
			}
		);
		db.close();
		return rows;
	});
}

async function storedEventCount(page: Page, runId: string): Promise<number> {
	return page.evaluate(async (id) => {
		const open = indexedDB.open('craftabot');
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			open.onsuccess = () => resolve(open.result);
			open.onerror = () => reject(open.error);
		});
		const count = await new Promise<number>((resolve, reject) => {
			const request = db.transaction('events').objectStore('events').index('runId').count(id);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		db.close();
		return count;
	}, runId);
}

test('a run is on record from the moment it starts, not the moment it ends', async ({ page }) => {
	await buildAndGo(page);

	// Nothing has run yet, so there is nothing to find.
	expect(await storedRuns(page)).toHaveLength(0);

	await page.getByTestId('step').click();
	await expect(page.getByTestId('bot')).toBeVisible();

	const runs = await storedRuns(page);
	expect(runs).toHaveLength(1);
	expect(runs[0]?.outcome).toBe('IN_PROGRESS');
});

test('shutting the tab mid-run keeps the run and the part of the story so far', async ({
	page
}) => {
	await buildAndGo(page);

	// Two turns in, and deliberately not finished.
	await page.getByTestId('step').click();
	await expect(page.getByTestId('bot')).toBeVisible();
	await page.getByTestId('step').click();
	await expect(page.getByTestId('story-turn-1')).toBeVisible();

	const before = await storedRuns(page);
	expect(before).toHaveLength(1);
	const runId = before[0]?.id ?? '';
	const eventsBefore = await storedEventCount(page, runId);
	expect(eventsBefore).toBeGreaterThan(0);

	// The tab goes away mid-run — the case that used to lose everything.
	await page.reload();

	const after = await storedRuns(page);
	expect(after).toHaveLength(1);
	expect(after[0]?.id).toBe(runId);
	expect(after[0]?.outcome).toBe('IN_PROGRESS');
	expect(after[0]?.ticks).toBeGreaterThan(0);
	expect(await storedEventCount(page, runId)).toBe(eventsBefore);
});

test('a run that finishes is filed with its ending, not left in progress', async ({ page }) => {
	await buildAndGo(page);

	await page.getByTestId('play').click();
	await expect(page.getByTestId('end-card')).toBeVisible({ timeout: 30_000 });

	const runs = await storedRuns(page);
	expect(runs).toHaveLength(1);
	expect(runs[0]?.outcome).toBe('SUCCESS');
});
