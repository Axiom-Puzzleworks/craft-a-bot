import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { pinScrollbars, settle, skipTutorial } from './support.js';

/**
 * **Zoom and motion** (WP110, `97-ACCESS.md` §3, decision 3): the four
 * canvases' routes at 640 px — 200 % browser zoom on a 1280 px screen is a
 * 640 px layout — and at 320 px, where the list twin takes over; and the lit
 * Pipeline under `prefers-reduced-motion: reduce` and under
 * `no-preference`, settled, the same picture. Baselines per platform, like
 * every visual shot.
 */
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
const workflowRunId = (
	JSON.parse(readFileSync(WORKFLOW_FIXTURE, 'utf8')) as { run: { id: string } }
).run.id;

test.beforeEach(async ({ page }) => {
	await skipTutorial(page);
	await pinScrollbars(page);
});

async function seed(page: Page): Promise<void> {
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
	await page.goto('/workshop/workflows');
	await page.getByTestId('import-workflow-run').setInputFiles({
		name: 'lending-workflow-run.v1.json',
		mimeType: 'application/json',
		buffer: readFileSync(WORKFLOW_FIXTURE)
	});
	await expect(page.getByTestId('workflow-import-note')).toContainText('with its item');
}

const ROUTES: Array<[string, string, string]> = [
	['journey', '/workshop/playground/journeys/fs-lending/lending', 'journey-canvas'],
	['pipeline', `/workshop/workflows/${workflowRunId}`, 'pipeline-page'],
	['studio', '/workshop/studio', 'studio-centre'],
	['monitor', '/workshop/monitor', 'monitor-page']
];

for (const width of [640, 320]) {
	test.describe(`at ${width} px`, () => {
		test.use({ reducedMotion: 'reduce', viewport: { width, height: 800 } });
		for (const [name, route, ready] of ROUTES) {
			test(`${name}`, async ({ page }) => {
				await seed(page);
				await page.goto(route);
				await expect(page.getByTestId(ready)).toBeVisible();
				await settle(page);
				await expect(page).toHaveScreenshot(`access-${width}-${name}.png`);
			});
		}
	});
}

test.describe('the lit Pipeline, moving and still', () => {
	test.use({ viewport: { width: 1280, height: 800 } });
	for (const motion of ['reduce', 'no-preference'] as const) {
		test(`under ${motion}`, async ({ page }) => {
			await page.emulateMedia({ reducedMotion: motion });
			await seed(page);
			await page.goto(`/workshop/workflows/${workflowRunId}`);
			await expect(page.getByTestId('pipeline-page')).toBeVisible();
			// Settled: under no-preference the verdicts' entrance has long finished; the shot is the same figure.
			await page.waitForTimeout(1500);
			await settle(page);
			await expect(page).toHaveScreenshot('access-pipeline-lit.png');
		});
	}
});
