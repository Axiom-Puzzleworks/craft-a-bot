import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { buildReadyBot, skipTutorial } from './support.js';

/**
 * **WP31 stage B** (`24-ROBOT-FRIENDS-DESIGN.md` §10): the duo Play route,
 * reached by hand — no Robot Friends picker exists yet (stage E's job). Two
 * GO-ready shelf bots, launched into `/play/duo` with `starter/tidy-together`
 * overriding whatever card each was solo-built for (`24-…` §4.1 — a launch
 * snapshot, never the shelf's own spec).
 */

test.beforeEach(async ({ page }) => skipTutorial(page));

async function launchDuo(page: import('@playwright/test').Page) {
	const idA = await buildReadyBot(page);
	const idB = await buildReadyBot(page);
	await page.goto(`/play/duo?a=${idA}&b=${idB}&card=starter/tidy-together`);
	return { idA, idB };
}

test('both robots render in one Playroom, and STEP advances both', async ({ page }) => {
	const { idA, idB } = await launchDuo(page);

	await expect(page.getByTestId('duo-play')).toBeVisible();
	// No round has happened yet, so `WorldView` shows its own "press STEP"
	// waiting state — the same convention the solo Play route relies on.
	await expect(page.getByTestId('world-waiting')).toBeVisible();
	await expect(page.getByTestId(`member-${idA}`)).toBeVisible();
	await expect(page.getByTestId(`member-${idB}`)).toBeVisible();
	await expect(page.getByTestId(`member-tick-${idA}`)).toHaveText('Turn 0');
	await expect(page.getByTestId(`member-tick-${idB}`)).toHaveText('Turn 0');

	await page.getByTestId('step').click();

	await expect(page.getByTestId(`member-tick-${idA}`)).toHaveText('Turn 1');
	await expect(page.getByTestId(`member-tick-${idB}`)).toHaveText('Turn 1');
	await expect(page.getByTestId('world-view')).toBeVisible();
	// Both agents drawn in the shared room — the foregrounded seat (`bot`,
	// WorldView's own existing rendering) plus the other robot plainly, as a
	// fellow agent (`23-…` §4.3, `24-…` §4.3).
	await expect(page.getByTestId('bot')).toBeVisible();
	await expect(page.locator('[data-testid^="fellow-"]')).toBeVisible();
});

test('PLAY drives rounds automatically, PAUSE and STOP both work', async ({ page }) => {
	await launchDuo(page);

	await expect(page.getByTestId('play')).toBeVisible();
	await page.getByTestId('play').click();
	await expect(page.getByTestId('pause')).toBeVisible();

	// Several rounds should have advanced on their own within a few seconds —
	// the two-robot round-robin pacing this route relies on entirely from core.
	await expect
		.poll(async () =>
			Number(
				(
					await page
						.getByTestId(/member-tick-/)
						.first()
						.textContent()
				)?.replace(/\D+/g, '') ?? 0
			)
		)
		.toBeGreaterThan(0);

	await page.getByTestId('pause').click();
	await expect(page.getByTestId('play')).toBeVisible();

	await page.getByTestId('stop').click();
	await expect(page.getByTestId('stop')).toBeDisabled();
});

test('a link with a missing or duplicate robot says so, plainly', async ({ page }) => {
	const idA = await buildReadyBot(page);

	await page.goto(`/play/duo?a=${idA}&b=${idA}&card=starter/tidy-together`);
	await expect(page.getByTestId('duo-load-error')).toContainText('two different robots');

	await page.goto(`/play/duo?a=${idA}&card=starter/tidy-together`);
	await expect(page.getByTestId('duo-load-error')).toContainText('missing a robot or a card');
});

test('the duo Playroom has no accessibility violations', async ({ page }) => {
	await launchDuo(page);
	await expect(page.getByTestId('duo-play')).toBeVisible();
	await page.getByTestId('step').click();

	const { violations } = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(
		violations
			.map(
				(v) =>
					`${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.map((n) => n.target).join('\n    ')}`
			)
			.join('\n')
	).toBe('');
});
