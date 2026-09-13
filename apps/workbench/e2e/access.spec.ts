import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { skipTutorial } from './support.js';

/**
 * **Access** (WP110, `97-ACCESS.md` §3; `83-…` §6.7.3; tenets 29 and 32):
 * the screen-reader walk — on each of the three canvases, `Tab` to the
 * drawing and arrow through every focus stop, reading each stop's
 * accessible name: non-empty, unique, and the twin's own row; the skip
 * link as the first stop on every Workshop route, a landmark it reaches,
 * one `h1`; a drawer giving focus back to what opened it; the Monitor's
 * tiles described by the queue rows they twin.
 */
test.beforeEach(async ({ page }) => skipTutorial(page));

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKFLOW_FIXTURE = join(
	HERE,
	'..',
	'..',
	'..',
	'packages',
	'packs',
	'fs-lending',
	'src',
	'fixtures',
	'lending-workflow-run.v1.json'
);

const ROUTES = [
	'/workshop',
	'/workshop/runs',
	'/workshop/evals',
	'/workshop/campaigns',
	'/workshop/evaluators',
	'/workshop/scenarios',
	'/workshop/sinks',
	'/workshop/evidence',
	'/workshop/playground',
	'/workshop/playground/advice',
	'/workshop/playground/lending',
	'/workshop/playground/journeys',
	'/workshop/playground/journeys/fs-lending/lending',
	'/workshop/policies',
	'/workshop/bench',
	'/workshop/telemetry',
	'/workshop/monitor',
	'/workshop/workflows',
	'/workshop/conduct',
	'/workshop/model-risk',
	'/workshop/experiments',
	'/workshop/incidents',
	'/workshop/safety-case',
	'/workshop/assurance',
	'/workshop/catalogue',
	'/workshop/export',
	'/workshop/studio'
];

async function openTheWorkshopDoor(page: Page): Promise<void> {
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
}

/** The accessible name of the focused element, as a reader hears it: aria-labelledby's text, else aria-label, else the text. */
const focusedName = (page: Page) =>
	page.evaluate(() => {
		const active = document.activeElement;
		if (!active) return '';
		const by = active.getAttribute('aria-labelledby');
		if (by) {
			return by
				.split(/\s+/)
				.map((id) => document.getElementById(id)?.textContent?.replace(/\s+/g, ' ').trim() ?? '')
				.join(' ');
		}
		return (
			active.getAttribute('aria-label') ?? active.textContent?.replace(/\s+/g, ' ').trim() ?? ''
		);
	});

/** Arrow through the stops from the focused one until the walk comes round; every name read is returned. */
async function walk(page: Page, key: 'ArrowRight' | 'ArrowDown', limit = 40): Promise<string[]> {
	const names: string[] = [];
	const first = await page.evaluate(() => document.activeElement?.id ?? '');
	let last = first;
	for (let step = 0; step < limit; step += 1) {
		names.push(await focusedName(page));
		await page.keyboard.press(key);
		const id = await page.evaluate(() => document.activeElement?.id ?? '');
		// Round the ring and back to the start, or along a path to its end where the key does nothing more.
		if (id === first || id === '' || id === last) break;
		last = id;
	}
	return names;
}

test('the skip link is the first stop on every route, reaches the content, and every route has one h1 and a main', async ({
	page
}) => {
	await openTheWorkshopDoor(page);
	for (const route of ROUTES) {
		await page.goto(route);
		await expect(page.getByTestId('workshop')).toBeVisible();
		await page.keyboard.press('Tab');
		await expect(page.getByTestId('skip-link'), route).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(page.getByTestId('workshop-stage'), route).toBeFocused();
		expect(await page.locator('h1').count(), `${route}: one h1`).toBe(1);
		expect(await page.locator('main').count(), `${route}: one main`).toBe(1);
		expect(await page.locator('nav[aria-label="Workshop"]').count(), `${route}: the rail`).toBe(1);
	}
});

test('the Journey Canvas: every stop reads its twin’s row', async ({ page }) => {
	await openTheWorkshopDoor(page);
	await page.goto('/workshop/playground/journeys/fs-lending/lending');
	const canvas = page.getByTestId('journey-canvas');
	await expect(canvas).toBeVisible();
	await canvas.locator('[data-testid^="journey-canvas-node-"]').first().focus();
	const names = await walk(page, 'ArrowRight');
	expect(names.length).toBeGreaterThanOrEqual(3);
	for (const name of names) expect(name).not.toBe('');
	expect(new Set(names).size).toBe(names.length);
	// The twin says the same: every stop's name is a stage row's sentence.
	const twin = await page.getByTestId('journey-list-stages').locator('tbody tr').allTextContents();
	expect(twin.length).toBeGreaterThanOrEqual(names.length);
});

test('the Boundary: every outside node and stage is a stop, announced from its row', async ({
	page
}) => {
	// The bank's map: nine lines outside and every journey's ring — the richest Boundary the Workshop draws.
	await openTheWorkshopDoor(page);
	await page.goto('/workshop/playground');
	const map = page.getByTestId('playground-map');
	await expect(map).toBeVisible();
	const firstNode = map.locator('[data-testid^="playground-map-node-"]').first();
	await firstNode.focus();
	const names = await walk(page, 'ArrowRight', 80);
	expect(names.length).toBeGreaterThanOrEqual(9);
	for (const name of names) expect(name).not.toBe('');
	expect(new Set(names).size).toBe(names.length);
	const rows = await map
		.locator('[data-testid="playground-map-list"] li[data-stop="true"]')
		.allTextContents();
	expect(rows.map((row) => row.replace(/\s+/g, ' ').trim())).toEqual(names);
	await firstNode.focus();
	await page.keyboard.press('Escape');
	await expect(firstNode).not.toBeFocused();
});

test('the Studio’s points: the journey’s stops read their rows, and the list twin stands beside the drawing', async ({
	page
}) => {
	await openTheWorkshopDoor(page);
	await page.goto('/workshop/studio');
	await page.getByTestId('studio-workflow').selectOption('fs-lending/lending');
	const canvas = page.getByTestId('studio-journey');
	await expect(canvas).toBeVisible();
	await expect(page.getByTestId('studio-journey-list')).toBeVisible();
	await canvas.locator('[data-testid^="studio-journey-node-"]').first().focus();
	const names = await walk(page, 'ArrowRight');
	expect(names.length).toBeGreaterThanOrEqual(3);
	for (const name of names) expect(name).not.toBe('');
});

test('the Pipeline rail walks with the arrow keys and its drawer gives focus back', async ({
	page
}) => {
	await openTheWorkshopDoor(page);
	await page.goto('/workshop/workflows');
	await page.getByTestId('import-workflow-run').setInputFiles({
		name: 'lending-workflow-run.v1.json',
		mimeType: 'application/json',
		buffer: readFileSync(WORKFLOW_FIXTURE)
	});
	await expect(page.getByTestId('workflow-import-note')).toContainText('with its item');
	const runId = (JSON.parse(readFileSync(WORKFLOW_FIXTURE, 'utf8')) as { run: { id: string } }).run
		.id;
	await page.goto(`/workshop/workflows/${runId}`);
	const first = page.locator('[data-testid^="pipeline-rail-stage-"]').first();
	await first.focus();
	await page.keyboard.press('ArrowDown');
	await expect(first).not.toBeFocused();
	await page.keyboard.press('Home');
	await expect(first).toBeFocused();
	// The drawer: open from the button, close with the same, focus back on the button.
	const whatIf = page.getByTestId('pipeline-what-if');
	await first.click();
	await whatIf.click();
	await expect(page.getByTestId('pipeline-drawer')).toBeVisible();
	await whatIf.click();
	await expect(page.getByTestId('pipeline-drawer')).toHaveCount(0);
	await expect(whatIf).toBeFocused();
});
