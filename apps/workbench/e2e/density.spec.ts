import { expect, test } from '@playwright/test';
import { skipTutorial } from './support.js';

/**
 * **Density** (WP109, `96-CONTROL-ROOM-V3.md` §2.3): *comfortable* /
 * *dense* on every table and rail, remembered per lens — and a fold is not
 * a layout: every route's text is the same under both. A test per screen.
 */
test.beforeEach(async ({ page }) => skipTutorial(page));

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
	'/workshop/playground/lending',
	'/workshop/playground/journeys',
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

/** The stage's text — everything but the rail, whose density switch is the one thing that changes. */
const stageText = (page: import('@playwright/test').Page) =>
	page.locator('[data-testid="workshop"] > :not(nav)').first().innerText();

for (const route of ROUTES) {
	test(`${route}: the same text under both densities`, async ({ page }) => {
		await page.goto(route);
		await page.getByTestId('density-comfortable').check();
		await expect(page.getByTestId('workshop')).toHaveAttribute('data-density', 'comfortable');
		const comfortable = await stageText(page);
		await page.getByTestId('density-dense').check();
		await expect(page.getByTestId('workshop')).toHaveAttribute('data-density', 'dense');
		const dense = await stageText(page);
		expect(dense).toBe(comfortable);
	});
}

test('is remembered per lens, with the lens’s own default', async ({ page }) => {
	await page.goto('/workshop');
	// The engineer's default is dense; the board's is comfortable.
	await expect(page.getByTestId('workshop')).toHaveAttribute('data-density', 'dense');
	await page.getByTestId('lens-switcher').selectOption('assurance');
	await expect(page.getByTestId('workshop')).toHaveAttribute('data-density', 'comfortable');
	await page.getByTestId('density-dense').check();
	await page.getByTestId('lens-switcher').selectOption('engineer');
	await page.getByTestId('density-comfortable').check();
	await page.reload();
	await expect(page.getByTestId('workshop')).toHaveAttribute('data-density', 'comfortable');
	await page.getByTestId('lens-switcher').selectOption('assurance');
	await expect(page.getByTestId('workshop')).toHaveAttribute('data-density', 'dense');
});
