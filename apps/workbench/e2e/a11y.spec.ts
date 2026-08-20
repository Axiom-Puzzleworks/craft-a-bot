import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { buildAndGo, skipTutorial } from './support.js';

/**
 * **The accessibility audit** (`16-…` §2.7; the WP17 definition of done is
 * "axe pass on all routes").
 *
 * Automated checking finds perhaps a third of what is wrong with a page, which
 * is a reason to have it and not a reason to stop there — the keyboard-only run
 * below, the story strip's live region (§1.3) and the focus traps are the parts
 * that matter most to an actual user and none of them are things axe can see.
 *
 * Scoped to WCAG 2.1 A and AA, which is the standard `01-…` §8 commits to.
 */

const STANDARD = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function audit(page: Page) {
	return new AxeBuilder({ page }).withTags(STANDARD).analyze();
}

/** Names the offending rules and elements, so a failure says what to fix. */
function describe(violations: Awaited<ReturnType<typeof audit>>['violations']): string {
	return violations
		.map(
			(v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.map((n) => n.target).join('\n    ')}`
		)
		.join('\n');
}

test.beforeEach(async ({ page }) => skipTutorial(page));

test('the Shelf has no accessibility violations', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByTestId('agent-list')).toBeVisible();

	const { violations } = await audit(page);
	expect(describe(violations)).toBe('');
});

test('Settings has no accessibility violations', async ({ page }) => {
	await page.goto('/settings');
	/*
	 * Wait for something on the page before auditing. Every other case here
	 * anchors on a test id; this one did not, and axe would occasionally run
	 * against a half-rendered document and report contrast against colours that
	 * were still arriving. It failed twice under full-suite load and never once
	 * on its own, which is the signature.
	 */
	await expect(page.getByTestId('nav-settings')).toHaveAttribute('aria-current', 'page');

	const { violations } = await audit(page);
	expect(describe(violations)).toBe('');
});

test('the Scrapbook has no accessibility violations', async ({ page }) => {
	await page.goto('/scrapbook');
	await expect(page.getByTestId('scrapbook-list')).toBeVisible();

	const { violations } = await audit(page);
	expect(describe(violations)).toBe('');
});

test('the bench has no accessibility violations', async ({ page }) => {
	await page.goto('/');
	await page.getByTestId('new-bot').click();
	await expect(page.getByTestId('baseplate')).toBeVisible();

	const { violations } = await audit(page);
	expect(describe(violations)).toBe('');
});

test('the Passport has no accessibility violations, toy side or flipped', async ({ page }) => {
	await page.goto('/');
	await page.getByTestId('new-bot').click();
	await expect(page.getByTestId('baseplate')).toBeVisible();

	await page.getByTestId('passport').click();
	await expect(page.getByTestId('passport-controls')).toBeVisible();
	expect(describe((await audit(page)).violations)).toBe('');

	await page.getByTestId('flip-passport').click();
	await expect(page.getByTestId('passport-json')).toBeVisible();
	expect(describe((await audit(page)).violations)).toBe('');
});

test('the Playroom has no accessibility violations, mid-run and at the end', async ({ page }) => {
	await buildAndGo(page);
	await page.getByTestId('step').click();
	await expect(page.getByTestId('bot')).toBeVisible();

	expect(describe((await audit(page)).violations)).toBe('');

	// The end card is a different page as far as a reader is concerned.
	await page.getByTestId('play').click();
	await expect(page.getByTestId('end-card')).toBeVisible({ timeout: 30_000 });

	expect(describe((await audit(page)).violations)).toBe('');
});

test('the leaflet has no accessibility violations', async ({ page }) => {
	await page.goto('/settings');
	await page.getByTestId('nav-instructions').click();
	await expect(page.getByTestId('leaflet')).toBeVisible();

	const { violations } = await audit(page);
	expect(describe(violations)).toBe('');
});

/**
 * A whole run without touching the mouse (`16-…` §2.7). The build interactions
 * already have keyboard variants (`build-keyboard.spec.ts`); this is the other
 * half — that once a bot is in the Playroom, the loop itself can be driven and
 * the cards that interrupt it can be answered.
 */
test('a run can be played and finished from the keyboard alone', async ({ page }) => {
	await buildAndGo(page);

	// Space steps, so the loop needs no pointer at all.
	await page.keyboard.press('Space');
	await expect(page.getByTestId('bot')).toBeVisible();

	for (let step = 0; step < 20; step++) {
		if (await page.getByTestId('end-card').isVisible()) break;
		await page.keyboard.press('Space');
	}

	const endCard = page.getByTestId('end-card');
	await expect(endCard).toBeVisible();

	// The end card takes the focus rather than leaving it out in the page.
	await expect(endCard.locator(':focus')).toHaveCount(1);

	// And Tab stays inside it — the trap, from a reader's point of view.
	await page.keyboard.press('Tab');
	await expect(endCard.locator(':focus')).toHaveCount(1);
	await page.keyboard.press('Tab');
	await expect(endCard.locator(':focus')).toHaveCount(1);
});

/**
 * Touch targets on the controls a child actually jabs at (`16-…` §2.7).
 * 44px is the WCAG 2.5.5 figure and roughly a five-year-old's fingertip.
 */
test('the play controls are big enough to hit', async ({ page }) => {
	await buildAndGo(page);

	for (const id of ['step', 'play', 'stop', 'reset']) {
		const box = await page.getByTestId(id).boundingBox();
		expect(box, `${id} should be on screen`).not.toBeNull();
		expect(
			Math.min(box?.width ?? 0, box?.height ?? 0),
			`${id} is too small to hit`
		).toBeGreaterThanOrEqual(44);
	}
});
