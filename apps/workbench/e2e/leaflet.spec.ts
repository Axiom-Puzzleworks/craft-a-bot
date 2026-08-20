import { expect, test, type Page } from '@playwright/test';
import { BRICKS, type BrickName } from './support.js';

/**
 * WP9's definition of done: **"Playwright walks all six chapters with the mock
 * provider; every designed teaching moment reachable."**
 *
 * `chapters.test.ts` proves the arc is walkable as a model. This proves it
 * survives the real DOM — and, more importantly, that each chapter's *failure*
 * genuinely happens before its fix. Those assertions are the ones that would
 * have failed before WP9 made the demo brain spec-aware.
 */

/** Fit a brick from the tray using the keyboard path (03 §4.4). */
async function fitBrick(page: Page, kind: BrickName): Promise<void> {
	await page.getByTestId(`tray-${BRICKS[kind].id}`).focus();
	await page.keyboard.press('Enter');
	for (let attempt = 0; attempt < 8; attempt++) {
		const said = await page.getByTestId('announcer').textContent();
		if (said?.includes(`${BRICKS[kind].socket} socket — this one fits`)) break;
		await page.keyboard.press('ArrowDown');
	}
	await page.keyboard.press('Enter');
}

async function chooseCartridge(page: Page): Promise<void> {
	await page.getByTestId('socket-brain').getByRole('button').click();
	await page.getByTestId('cartridge-select').selectOption({ label: 'Demo Brain' });
}

async function go(page: Page): Promise<void> {
	await expect(page.getByRole('button', { name: /GO/ })).toBeEnabled();
	await page.getByRole('button', { name: /GO/ }).click();
	await expect(page).toHaveURL(/\/play\//);
}

async function stepTimes(page: Page, times: number): Promise<void> {
	for (let turn = 0; turn < times; turn++) {
		const stepButton = page.getByTestId('step');
		if (!(await stepButton.isEnabled())) break;
		await stepButton.click();
		// The end card covers the controls once a run finishes.
		if (await page.getByTestId('end-card').isVisible()) break;
	}
}

async function backToBench(page: Page): Promise<void> {
	const endCard = page.getByTestId('end-card');
	if (await endCard.isVisible()) {
		await page.getByTestId('end-see-trace').click();
	}
	await page.getByRole('link', { name: /Back to the bench/ }).click();
	await expect(page).toHaveURL(/\/bench\//);
}

const currentStep = (page: Page) =>
	page.locator('[data-testid^="leaflet-step-"][data-current="true"]');

test('the leaflet greets a first-timer and can be waved away', async ({ page }) => {
	await page.goto('/');

	await expect(page.getByTestId('leaflet')).toBeVisible();
	await expect(page.getByTestId('leaflet-title')).toHaveText('A brain with no hands');
	await expect(currentStep(page)).toContainText('Take a new bot');

	await page.getByTestId('leaflet-skip').click();
	await expect(page.getByTestId('leaflet')).toBeHidden();
	await expect(page.getByTestId('leaflet-handle')).toBeVisible();

	// Skipping is remembered, but the handle always brings it back (03 §6).
	await page.reload();
	await expect(page.getByTestId('leaflet')).toBeHidden();
	await page.getByTestId('leaflet-handle').click();
	await expect(page.getByTestId('leaflet')).toBeVisible();
});

test('walks the six brick chapters and collects their badges', async ({ page }) => {
	test.slow();
	await page.goto('/');
	await expect(page.getByTestId('leaflet')).toBeVisible();

	// ── Chapter 1: a brain with no hands ──────────────────────────────────────
	await page.getByTestId('new-bot').click();
	await expect(page.getByTestId('baseplate')).toBeVisible();
	await expect(currentStep(page)).toContainText('Snap the Brain brick');

	await fitBrick(page, 'llm');
	await chooseCartridge(page);
	await expect(currentStep(page)).toContainText('Pull the GO lever');

	await go(page);
	await stepTimes(page, 2);

	// The designed failure, asserted rather than assumed: it decided to do
	// something and the world had no way to carry it out.
	await expect(page.getByTestId('flight-recorder')).toContainText('Decided');
	await expect(page.getByTestId('narration')).toContainText('not been built with any way');
	await expect(currentStep(page)).toContainText('brain with no hands');
	await page.getByTestId('leaflet-ack').click();

	await backToBench(page);
	await expect(currentStep(page)).toContainText('Actions brick');
	await fitBrick(page, 'actions');

	await go(page);
	await stepTimes(page, 2);
	await expect(page.getByTestId('badge-earned')).toBeVisible();
	await page.getByTestId('badge-dismiss').click();

	// ── Chapter 2: eyes open ──────────────────────────────────────────────────
	await expect(page.getByTestId('leaflet-title')).toHaveText('Eyes open');
	await page.getByTestId('leaflet-ack').click();

	await backToBench(page);
	await fitBrick(page, 'sense');
	await go(page);
	await stepTimes(page, 8);
	await expect(page.getByTestId('end-card')).toHaveAttribute('data-outcome', 'SUCCESS');
	await page.getByTestId('badge-dismiss').click();

	// ── Chapter 3: the goldfish problem ───────────────────────────────────────
	await expect(page.getByTestId('leaflet-title')).toHaveText('The goldfish problem');
	await backToBench(page);
	await page.getByTestId('card-snack').click();
	await go(page);
	await stepTimes(page, 3);

	await backToBench(page);
	await fitBrick(page, 'memory');
	await go(page);
	await stepTimes(page, 12);
	await expect(page.getByTestId('end-card')).toHaveAttribute('data-outcome', 'SUCCESS');
	await page.getByTestId('badge-dismiss').click();

	// ── Chapter 4: confidently wrong ──────────────────────────────────────────
	await expect(page.getByTestId('leaflet-title')).toHaveText('Confidently wrong');
	await backToBench(page);
	await page.getByTestId('card-sums-for-teddy').click();
	await go(page);
	// Four turns is exactly when it announces its answer; a fifth is `celebrate`,
	// which clears the speech bubble again.
	await stepTimes(page, 4);
	// The teaching moment: it says the wrong answer, and sounds certain.
	await expect(page.getByTestId('narration')).toContainText('371');
	await stepTimes(page, 1);

	await backToBench(page);
	await fitBrick(page, 'tools');
	await page.getByTestId('socket-equipment').getByRole('button').click();
	await page
		.getByTestId('brick-controls-equipment')
		.getByRole('checkbox', { name: /Calculator/ })
		.check();
	await go(page);
	await stepTimes(page, 8);
	await expect(page.getByTestId('end-card')).toHaveAttribute('data-outcome', 'SUCCESS');
	await page.getByTestId('badge-dismiss').click();

	// ── Chapter 5: looking things up ──────────────────────────────────────────
	await expect(page.getByTestId('leaflet-title')).toHaveText('Looking things up');
	await backToBench(page);
	await page.getByTestId('card-locked-chest').click();
	await go(page);
	await stepTimes(page, 4);

	await backToBench(page);
	await page.getByTestId('socket-equipment').getByRole('button').click();
	await page
		.getByTestId('brick-controls-equipment')
		.getByRole('checkbox', { name: /Look up the manual/ })
		.check();
	await go(page);
	await stepTimes(page, 3);
	// The lesson is the lookup, not the card: "The locked chest" also asks for a
	// full tidy, which needs more turns than the engine budget allows. The badge
	// is the assertion — the leaflet only awards it once the bot has actually
	// used `look_up_manual`. (The trace drawer is virtualised, so the row itself
	// has scrolled out of view by now.)
	await expect(page.getByTestId('badge-earned')).toBeVisible();
	await page.getByTestId('badge-dismiss').click();

	// ── Chapter 6: who says yes ───────────────────────────────────────────────
	await expect(page.getByTestId('leaflet-title')).toHaveText('Who says yes');
	await backToBench(page);
	await fitBrick(page, 'safety');
	await page.getByTestId('socket-safety').getByRole('button').click();
	await page.getByTestId('brick-controls-safety').getByTestId('approval-everything').check();

	await go(page);
	// Approval mode pauses for world actions, not tools — and this card opens
	// with `look_up_manual`. So step until it wants to change something.
	const approval = page.getByTestId('approval-card');
	for (let turn = 0; turn < 4 && !(await approval.isVisible()); turn++) {
		await page.getByTestId('step').click();
	}
	await expect(approval).toBeVisible();
	await page.getByTestId('approval-allow').click();

	// Four reading steps close chapter 6: the panel's other limits (`16-…` §2.2),
	// its spending cap (`14-…` §4.6, WP24) and the policy cards below them
	// (`14-…` §4.6, WP22).
	for (let step = 0; step < 4; step++) {
		await page.getByTestId('leaflet-ack').click();
	}

	await expect(page.getByTestId('badge-earned')).toBeVisible();
	await page.getByTestId('badge-dismiss').click();

	/*
	 * Chapter 7 ("Turning the dials") hands over here, and its own walk lives in
	 * `chapters.test.ts` alongside every other chapter's. Driving it through the
	 * browser as well would add a minute to the slowest test in the suite to
	 * re-prove predicates a unit walk already pins — what only a browser can
	 * settle is that the arc *reaches* it, which is what this asserts.
	 */
	await page.getByRole('link', { name: /Back to the bench/ }).click();
	await expect(page.getByTestId('baseplate')).toBeVisible();
	await expect(page.getByTestId('leaflet-title')).toHaveText('Turning the dials');
	await expect(currentStep(page)).toContainText('temperature dial');

	// The badge sheet, opened from the leaflet's own button. It used to be
	// reached through the "all chapters built" screen, which the arc no longer
	// hits at chapter 6 now that a seventh follows it.
	await page.getByTestId('leaflet-badges').click();

	for (const badge of [
		'first-words',
		'eyes-open',
		'elephant-memory',
		'tool-time',
		'key-finder',
		'safety-first'
	]) {
		await expect(page.getByTestId(`badge-${badge}`)).toHaveAttribute('data-earned', 'true');
	}

	// The same sheet points at the governance scenarios (`18-…` WP25) — no
	// badge, no tracking, just a reference the reader can act on later.
	for (const quest of [
		'the-warning-sign',
		'keep-the-secret',
		'busy-bot',
		'who-is-watching',
		'party-line'
	]) {
		await expect(page.getByTestId(`side-quest-${quest}`)).toBeVisible();
	}
});

/**
 * **The spotlight follows the reader between screens.**
 *
 * Reported from use: moving between screens with the tutorial open left the
 * highlight behind — a yellow rectangle and a dimmed hole sitting over a page
 * with nothing there.
 *
 * The cause: a step's anchor does not change when the reader navigates, so an
 * effect keyed only on the anchor never re-ran and the measurement stayed from
 * the previous page. The `resize` and `ResizeObserver` fallbacks only catch it
 * when the two screens happen to differ in height, which is why this asserts
 * the invariant rather than a position: **whatever the spotlight points at has
 * to exist on the screen the reader is actually looking at.**
 */
test('the spotlight never points at something on another screen', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByTestId('leaflet')).toBeVisible();

	const spotlight = page.getByTestId('leaflet-spotlight');
	await expect(spotlight).toBeVisible();
	await expect(spotlight).toHaveAttribute('data-anchor', 'new-bot');

	// Away to another screen. The step is unchanged — the reader has not taken a
	// bot off the shelf yet — so nothing about the anchor says the page moved.
	await page.getByTestId('nav-scrapbook').click();
	await page.waitForURL(/\/scrapbook/);
	await expect(page.getByTestId('scrapbook-list')).toBeVisible();

	// Either there is no hole, or it is over something that is really here.
	if ((await spotlight.count()) > 0) {
		const anchor = await spotlight.getAttribute('data-anchor');
		await expect(
			page.locator(`[data-tutorial="${anchor}"]`),
			`the spotlight is pointing at "${anchor}", which is not on this screen`
		).toHaveCount(1);
	}
});
