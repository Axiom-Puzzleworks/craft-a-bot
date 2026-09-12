import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { injectionBaseline } from '@craftabot/evals';
import { buildReadyBot, pinScrollbars, settle, skipTutorial } from './support.js';

/**
 * **Every Workshop route, shot** (`60-CONTROL-ROOM-V2.md` §4.2, WP71): the
 * visual-regression pass `44-…` §8 deferred, on a fixture corpus with fixed
 * timestamps — the say-hello golden trace imported as a stored run, one bot
 * on the shelf with a name on the trace, a campaign of one seed run in the
 * browser — with the clock, the locale, the viewport and reduced motion
 * pinned by the `visual` project. Baselines are committed per platform
 * under `__screenshots__/`; CI's `visual` job diffs on Linux. A screen that
 * changes shape re-baselines with a dated note in `60-…`.
 */
test.use({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });
test.beforeEach(async ({ page }) => {
	await skipTutorial(page);
	await pinScrollbars(page);
});

const HERE = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(
	readFileSync(
		join(
			HERE,
			'..',
			'..',
			'..',
			'packages',
			'packs',
			'starter',
			'src',
			'fixtures',
			'trace.say-hello.v1.json'
		),
		'utf8'
	)
) as Array<{ runId: string }>;
const goldenRunId = golden[0]?.runId ?? '';

async function seed(page: Page): Promise<string> {
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
	await page.getByTestId('display-name').fill('Sam');
	await page.getByTestId('display-name').press('Enter');
	const agentId = await buildReadyBot(page, 'card-snack');
	await page.goto('/workshop/runs');
	await page.getByTestId('import-trace').setInputFiles({
		name: 'say-hello.jsonl',
		mimeType: 'application/x-ndjson',
		buffer: Buffer.from(golden.map((event) => JSON.stringify(event)).join('\n') + '\n', 'utf8')
	});
	await expect(page.getByTestId('import-note')).toContainText('caught up');
	return agentId;
}

async function shot(page: Page, route: string, name: string, ready?: string): Promise<void> {
	await page.goto(route);
	await expect(page.getByTestId(ready ?? 'workshop')).toBeVisible();
	await settle(page);
	// The viewport is the page after `settle`; a plain capture resizes nothing, where a full-page one
	// re-laid the Playground ten pixels taller and shorter on alternate captures.
	await expect(page).toHaveScreenshot(`${name}.png`);
}

test('the Workshop, screen by screen, over the fixture corpus', async ({ page }) => {
	test.setTimeout(240_000);
	const agentId = await seed(page);

	await shot(page, '/workshop', 'ws-dashboard', 'fleet');
	await shot(page, '/workshop/runs', 'ws-runs', 'run-table');
	await shot(page, `/workshop/runs/${goldenRunId}`, 'ws-run-lab-golden', 'run-boundary');
	await shot(page, '/workshop/evaluators', 'ws-evaluators', 'evaluators-page');
	await shot(page, '/workshop/scenarios', 'ws-scenarios', 'scenarios-page');
	await shot(page, '/workshop/sinks', 'ws-sinks', 'sinks-page');
	await shot(page, '/workshop/evidence', 'ws-evidence', 'evidence-page');
	await shot(page, '/workshop/policies', 'ws-policies');
	await shot(page, '/workshop/bench', 'ws-test-bench', 'bench-page');
	await shot(page, '/workshop/telemetry', 'ws-telemetry', 'telemetry-page');
	await shot(page, '/workshop/monitor', 'ws-monitor', 'monitor-page');
	await shot(page, '/workshop/conduct', 'ws-conduct', 'conduct-page');
	await shot(page, '/workshop/model-risk', 'ws-model-risk', 'model-risk-page');
	await shot(page, '/workshop/experiments', 'ws-experiments', 'experiments-page');
	await shot(page, '/workshop/workflows', 'ws-workflows', 'workflows-page');
	await shot(page, '/workshop/incidents', 'ws-incidents', 'incidents-page');
	await shot(page, `/workshop/safety-case?agent=${agentId}`, 'ws-safety-case', 'safety-case-page');
	await shot(page, `/workshop/export?run=${goldenRunId}`, 'ws-audit-centre', 'export-page');
	await shot(page, '/workshop/guards', 'ws-guards', 'guard-rack');
	await shot(page, '/workshop/catalogue', 'ws-catalogue', 'catalogue-table');
	await shot(page, '/workshop/evals', 'ws-eval-matrix', 'matrix-size');
});

test('the Playground and its three desks', async ({ page }) => {
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
	await page.goto('/workshop/playground');
	await page.getByTestId('playground-generate').click();
	await expect(page.getByTestId('playground-simulation-only')).toBeVisible();
	await settle(page);
	await expect(page).toHaveScreenshot('ws-playground.png');
	for (const desk of ['advice', 'fraud', 'lending'] as const) {
		await page.goto(`/workshop/playground/${desk}`);
		await page.getByTestId(`${desk}-generate`).click();
		await settle(page);
		await expect(page).toHaveScreenshot(`ws-playground-${desk}.png`);
	}
});

test('Campaigns with a stored report of one seed', async ({ page }) => {
	test.setTimeout(120_000);
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
	await page.goto('/workshop/campaigns');
	await page.getByTestId('campaign-source').fill(JSON.stringify(injectionBaseline([1])));
	await page.getByTestId('run-campaign').click();
	await expect(page.getByTestId('campaign-verdict')).toBeVisible({ timeout: 60_000 });
	await expect(page.getByTestId('gates')).toBeVisible();
	// The report's own timestamp is the run's; the verdict strip is masked so the shot is the layout, not the clock.
	await settle(page);
	await expect(page).toHaveScreenshot('ws-campaigns.png', {
		mask: [page.getByTestId('campaign-verdict')]
	});
});
