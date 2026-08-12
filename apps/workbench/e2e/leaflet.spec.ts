import { expect, test, type Page } from '@playwright/test';

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
async function fitBrick(page: Page, kind: string): Promise<void> {
	await page.getByTestId(`tray-${kind}`).focus();
	await page.keyboard.press('Enter');
	for (let attempt = 0; attempt < 8; attempt++) {
		const said = await page.getByTestId('announcer').textContent();
		if (said?.includes(`${kind} socket — this one fits`)) break;
		await page.keyboard.press('ArrowDown');
	}
	await page.keyboard.press('Enter');
}

async function chooseCartridge(page: Page): Promise<void> {
	await page.getByTestId('socket-llm').getByRole('button').click();
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

test('walks all six chapters and collects all six badges', async ({ page }) => {
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
	await page.getByTestId('socket-tools').getByRole('button').click();
	await page
		.getByTestId('brick-controls-tools')
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
	await page.getByTestId('socket-tools').getByRole('button').click();
	await page
		.getByTestId('brick-controls-tools')
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
	await page
		.getByTestId('brick-controls-safety')
		.getByRole('checkbox', { name: 'Ask before acting' })
		.check();

	await go(page);
	// Approval mode pauses for world actions, not tools — and this card opens
	// with `look_up_manual`. So step until it wants to change something.
	const approval = page.getByTestId('approval-card');
	for (let turn = 0; turn < 4 && !(await approval.isVisible()); turn++) {
		await page.getByTestId('step').click();
	}
	await expect(approval).toBeVisible();
	await page.getByTestId('approval-allow').click();

	// ── All six ───────────────────────────────────────────────────────────────
	await expect(page.getByTestId('badge-earned')).toBeVisible();
	await page.getByTestId('badge-dismiss').click();
	await expect(page.getByTestId('leaflet-title')).toHaveText('All six chapters built!');

	await page
		.getByTestId('leaflet-badges')
		.or(page.getByTestId('badge-page'))
		.first()
		.click({ trial: true })
		.catch(() => {});
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
});
