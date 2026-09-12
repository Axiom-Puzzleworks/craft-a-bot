import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { skipTutorial } from './support.js';

/**
 * **The Journey Canvas** (WP100, `87-JOURNEY-CANVAS.md` §8 items 4–6): the
 * journeys page lists the three, a journey opens drawn with its twin, the
 * configuration selector moves the decision between lanes, the keyboard
 * walk reaches every node and reads its name, and the Pipeline draws the
 * golden run lit — the final state at once under reduced motion.
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

test('the journeys page lists the eight, and the lending journey draws with its twin and its configurations', async ({
	page
}) => {
	await openTheWorkshopDoor(page);
	await page.goto('/workshop/playground/journeys');
	// The seven desks' journeys and the complaints journey (WP102–WP106).
	await expect(page.getByTestId('journeys-count-value')).toHaveText('8');
	// WP106: the coverage matrix from the bank's domain spec — four journeys out, each with a reason.
	await expect(page.getByTestId('journeys-coverage').locator('tbody tr')).toHaveCount(13);
	await expect(page.getByTestId('journeys-coverage-out-value')).toHaveText('4');
	await page.getByTestId('journeys-open-fs-lending-lending').click();
	await expect(page).toHaveURL(/\/workshop\/playground\/journeys\/fs-lending\/lending$/);
	await expect(page.getByTestId('journey-stages-value')).toHaveText('10');

	// The canvas and its twin carry the same stages; the decision fans out to three outcomes.
	const canvas = page.getByTestId('journey-canvas');
	await expect(canvas.locator('[data-testid^="journey-canvas-node-"]')).toHaveCount(10);
	await expect(page.getByTestId('journey-list-stages').locator('tbody tr')).toHaveCount(10);
	await expect(page.getByTestId('journey-list-edge-decision->record')).toContainText(
		'approve / decline / refer'
	);
	await expect(page.getByTestId('journey-list-edge-explanation->four-eyes')).toContainText(
		'depends on the case'
	);

	// The decision is the assistant's as written, a colleague's under bot-recommends.
	await expect(page.getByTestId('journey-canvas-node-decision')).toHaveAttribute(
		'data-lane',
		'assistant'
	);
	await page.getByTestId('journey-configuration').selectOption('bot-recommends');
	await expect(page.getByTestId('journey-canvas-node-decision')).toHaveAttribute(
		'data-lane',
		'colleague'
	);
	await page.getByTestId('journey-configuration').selectOption('rules-only');
	await expect(canvas.locator('[data-testid^="journey-canvas-lane-"]')).toHaveCount(3);

	// A click selects the stage: its facts and its points beneath the drawing.
	await page.getByTestId('journey-canvas-node-decision').click();
	await expect(page.getByTestId('journey-selected')).toContainText('fairness');
});

test('the keyboard walk reaches every node and reads its name', async ({ page }) => {
	await openTheWorkshopDoor(page);
	await page.goto('/workshop/playground/journeys/fs-lending/lending');
	const first = page.getByTestId('journey-canvas-node-intake');
	await first.focus();
	await expect(first).toBeFocused();
	await expect(first).toHaveAttribute('aria-label', /Intake/);
	const visited: string[] = [];
	for (let step = 0; step < 12; step += 1) {
		const focused = await page.evaluate(
			() => document.activeElement?.getAttribute('data-testid') ?? ''
		);
		if (!focused.startsWith('journey-canvas-node-')) break;
		const stageId = focused.replace('journey-canvas-node-', '');
		if (visited.includes(stageId)) break;
		visited.push(stageId);
		// Every node reads its row: name, lane, executor.
		await expect(page.locator(`[data-testid="${focused}"]`)).toHaveAttribute(
			'aria-label',
			/— the (assistant|rules|systems)|— a colleague/
		);
		await page.keyboard.press('ArrowRight');
	}
	expect(visited).toEqual([
		'intake',
		'identity',
		'bureau',
		'affordability',
		'decision',
		'record',
		'explanation',
		'four-eyes',
		'disbursement',
		'appeal'
	]);
	// Home, End, and g to a point and back.
	await page.keyboard.press('Home');
	await expect(first).toBeFocused();
	await page.keyboard.press('End');
	await expect(page.getByTestId('journey-canvas-node-appeal')).toBeFocused();
	await page.keyboard.press('g');
	await expect(page.getByTestId('journey-canvas-point-loop:appeal:pre-think')).toBeFocused();
	await page.keyboard.press('ArrowRight');
	await expect(page.getByTestId('journey-canvas-point-loop:appeal:pre-act')).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('journey-canvas-node-appeal')).toBeFocused();
	// Enter selects.
	await page.keyboard.press('Enter');
	await expect(page.getByTestId('journey-selected')).toContainText('Appeal');
});

test('the Pipeline draws the golden run lit — the path, the edge it took, the final state under reduced motion', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await openTheWorkshopDoor(page);
	await page.goto('/workshop/workflows');
	await page.getByTestId('import-workflow-run').setInputFiles({
		name: 'lending-workflow-run.v1.json',
		mimeType: 'application/json',
		buffer: readFileSync(FIXTURE)
	});
	await expect(page.getByTestId('workflow-import-note')).toContainText('with its item');
	const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { run: { id: string } };
	await page.goto(`/workshop/workflows/${fixture.run.id}`);
	const canvas = page.getByTestId('pipeline-journey');
	await expect(canvas).toHaveAttribute('data-lit', 'true');
	await expect(canvas.locator('.node--lit')).toHaveCount(8);
	await expect(canvas.locator('[data-taken="true"]')).toHaveCount(8);
	await expect(page.getByTestId('pipeline-journey-edge-four-eyes->end')).toHaveAttribute(
		'data-taken',
		'true'
	);
	// The twin says what was taken, and the rail follows the canvas's selection.
	await expect(page.getByTestId('pipeline-journey-list-stage-decision')).toContainText('decline');
	await page.getByTestId('pipeline-journey-node-four-eyes').click();
	await expect(page.getByTestId('pipeline-rail-stage-four-eyes')).toHaveAttribute(
		'aria-pressed',
		'true'
	);
});
