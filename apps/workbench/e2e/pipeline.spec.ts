import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { skipTutorial } from './support.js';

/**
 * **The Pipeline** (WP86, `77-PIPELINE-AND-BOUNDARY.md` §6; `64-…` §6.2.4):
 * the committed lending workflow run imported on Workflows, opened as a
 * rail of stages with the *In* and *Out* panes; the bot's stage links to the
 * Run Lab only when the run is stored; the **What if** drawer changes the
 * decision's executor to the rule and re-runs from there, and the result
 * opens beside the original with two rails synchronised on the selected
 * stage. And the Boundary's labels never overlap — on the bank's page, on
 * each desk's, and on the Pipeline's.
 */
test.beforeEach(async ({ page }) => skipTutorial(page));

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(
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

async function openTheWorkshopDoor(page: Page): Promise<void> {
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
}

async function importTheFixture(page: Page): Promise<string> {
	await page.goto('/workshop/workflows');
	await expect(page.getByTestId('workflows-empty')).toBeVisible();
	await page.getByTestId('import-workflow-run').setInputFiles({
		name: 'lending-workflow-run.v1.json',
		mimeType: 'application/json',
		buffer: readFileSync(FIXTURE)
	});
	await expect(page.getByTestId('workflow-import-note')).toContainText('with its item');
	const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { run: { id: string } };
	return fixture.run.id;
}

test('a stored run opens as the Pipeline, and a what-if from the decision draws two rails', async ({
	page
}) => {
	test.setTimeout(120_000);
	await openTheWorkshopDoor(page);
	const runId = await importTheFixture(page);
	await expect(page.getByTestId('workflows-count-value')).toHaveText('1');
	await page.getByTestId('workflows-table').locator('tbody tr').first().getByRole('button').click();
	await expect(page).toHaveURL(new RegExp(`/workshop/workflows/${runId}$`));
	await expect(page.getByTestId('pipeline-page')).toBeVisible();
	await expect(page.getByTestId('pipeline-outcome')).toContainText('completed');

	// Every stage on the rail, the first selected, its panes rendered.
	const rail = page.getByTestId('pipeline-rail');
	await expect(rail.locator('[data-testid^="pipeline-rail-stage-"]')).toHaveCount(8);
	await expect(page.getByTestId('pipeline-in-file')).toBeVisible();
	await expect(page.getByTestId('pipeline-out-file')).toBeVisible();
	await expect(page.getByTestId('pipeline-in-file')).toContainText('amount');

	// The decision: a bot stage on this run; its run is not in the store, and the page says so.
	await page.getByTestId('pipeline-rail-stage-decision').click();
	await expect(page.getByTestId('pipeline-out-file')).toContainText('outcome');
	await expect(page.getByTestId('pipeline-run-lab-missing')).toBeVisible();

	// What if the rule decided instead? Re-run from the decision.
	await page.getByTestId('pipeline-what-if').click();
	await expect(page.getByTestId('pipeline-drawer')).toBeVisible();
	await page.getByTestId('what-if-executor').selectOption({ label: 'a rule: decision-v1' });
	await page.getByTestId('what-if-run').click();
	await expect(page).toHaveURL(/\/workshop\/workflows\/[^/?]+\?against=/, { timeout: 90_000 });
	await expect(page.getByTestId('pipeline-rail')).toBeVisible();
	await expect(page.getByTestId('pipeline-rail-against')).toBeVisible();
	await expect(page.getByTestId('pipeline-forked-from')).toContainText('at Decision');
	// The rails are synchronised on the selected stage: the decision on both, the out panes side by side.
	await page.getByTestId('pipeline-rail-stage-decision').click();
	await expect(page.getByTestId('pipeline-rail-against-stage-decision')).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.getByTestId('pipeline-out-against')).toBeVisible();
	await expect(page.getByTestId('pipeline-rail-stage-decision')).toContainText(
		'a rule: decision-v1'
	);
	// The new run's bot stages are stored: the identity stage opens the Run Lab at its first tick.
	await page.getByTestId('pipeline-rail-stage-identity').click();
	await expect(page.getByTestId('pipeline-run-lab')).toBeVisible();
	await page.getByTestId('pipeline-run-lab').click();
	await expect(page).toHaveURL(/\/workshop\/runs\/[^/?]+\?tick=0&stage=identity$/);
	await expect(page.getByTestId('run-scrubber')).toHaveValue('0');

	// Back on Workflows: two runs, the what-if marked as forked.
	await page.goto('/workshop/workflows');
	await expect(page.getByTestId('workflows-count-value')).toHaveText('2');
	await expect(page.getByTestId('workflows-table')).toContainText('what-if');
});

/** No two labels overlap on a map (UX-7): every `<text>` inside the figure's svg, pairwise. */
async function expectNoLabelCollisions(page: Page, testId: string): Promise<void> {
	const figure = page.getByTestId(testId);
	await expect(figure).toBeVisible();
	const boxes = await figure.locator('svg text').evaluateAll((nodes) =>
		nodes.map((node) => {
			const rect = (node as SVGGraphicsElement).getBoundingClientRect();
			return {
				id: node.getAttribute('data-label') ?? node.textContent ?? '',
				x: rect.x,
				y: rect.y,
				w: rect.width,
				h: rect.height
			};
		})
	);
	const collisions: string[] = [];
	for (let i = 0; i < boxes.length; i += 1) {
		for (let j = i + 1; j < boxes.length; j += 1) {
			const a = boxes[i]!;
			const b = boxes[j]!;
			const overlap =
				a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
			if (overlap && a.w > 0 && b.w > 0) collisions.push(`${a.id} × ${b.id}`);
		}
	}
	expect(collisions, `${testId}: overlapping labels`).toEqual([]);
}

test('the Boundary’s labels never overlap — the bank’s page, each desk’s, and the Pipeline’s', async ({
	page
}) => {
	test.setTimeout(120_000);
	await openTheWorkshopDoor(page);
	await page.goto('/workshop/playground');
	await expectNoLabelCollisions(page, 'playground-map');
	await expect(
		page.getByTestId('playground-map').locator('[data-testid^="playground-map-ring-"]')
	).toHaveCount(3);
	for (const desk of ['lending', 'fraud', 'advice'] as const) {
		await page.goto(`/workshop/playground/${desk}`);
		await expectNoLabelCollisions(page, `${desk}-map`);
		await expect(
			page.getByTestId(`${desk}-map`).locator('[data-testid^="' + desk + '-map-ring-"]')
		).toHaveCount(1);
	}
	const runId = await importTheFixture(page);
	await page.goto(`/workshop/workflows/${runId}`);
	await expectNoLabelCollisions(page, 'pipeline-boundary');
	// The run lit its stages: every stage the journey reached carries a status.
	await expect(
		page
			.getByTestId('pipeline-boundary')
			.locator('[data-testid^="pipeline-boundary-stage-"][data-status]')
	).toHaveCount(8);
});
