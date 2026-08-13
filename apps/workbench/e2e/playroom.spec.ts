import { expect, test, type Page } from '@playwright/test';
import { BRICKS, skipTutorial } from './support.js';

/**
 * WP6 definition of done: a full snack-goal run visible tick-by-tick with the
 * mock provider, and a trace that shows the exact composed prompt.
 */

/**
 * Scroll the Flight Recorder back to the start. The drawer follows the run, so
 * early rows are legitimately not in the DOM once a few turns have passed —
 * that is the virtualisation doing its job, and a reader scrolls up too.
 */
async function scrollTraceToTop(page: Page): Promise<void> {
	await page.getByTestId('trace-viewport').evaluate((node) => {
		node.scrollTop = 0;
		node.dispatchEvent(new Event('scroll'));
	});
}

/** Build a bot that can actually do the snack goal, then pull the GO lever. */
async function buildAndGo(page: Page, cardTestId = 'card-snack'): Promise<void> {
	await page.goto('/');
	await page.getByTestId('new-bot').click();
	await expect(page.getByTestId('baseplate')).toBeVisible();

	for (const kind of ['llm', 'sense', 'actions', 'memory']) {
		await page.getByTestId(`tray-${BRICKS[kind].id}`).focus();
		await page.keyboard.press('Enter');
		for (let step = 0; step < 8; step++) {
			const said = await page.getByTestId('announcer').textContent();
			if (said?.includes(`${BRICKS[kind].socket} socket — this one fits`)) break;
			await page.keyboard.press('ArrowDown');
		}
		await page.keyboard.press('Enter');
	}

	await page.getByTestId(cardTestId).click();
	// Slot the keyless Demo Brain cartridge, which is what clears the last
	// blocking build check and lights the GO lever.
	await page.getByTestId('socket-brain').getByRole('button').click();
	await page.getByTestId('cartridge-select').selectOption({ label: 'Demo Brain' });
	await expect(page.getByRole('button', { name: /GO/ })).toBeEnabled();

	await page.getByRole('button', { name: /GO/ }).click();
	await expect(page).toHaveURL(/\/play\//);
}

test.beforeEach(async ({ page }) => skipTutorial(page));

test('runs the snack goal tick-by-tick and reaches the success end card', async ({ page }) => {
	await buildAndGo(page);

	await expect(page.getByTestId('head-up')).toBeVisible();
	await expect(page.getByTestId('headup-goal')).toContainText('snack');
	// Before the first step there is no world to draw — and we say so.
	await expect(page.getByTestId('world-waiting')).toBeVisible();

	await page.getByTestId('step').click();
	await expect(page.getByTestId('world-view')).toBeVisible();
	await expect(page.getByTestId('bot')).toBeVisible();
	await expect(page.getByTestId('teddy')).toBeVisible();

	const firstThought = await page.getByTestId('thought-text').textContent();
	expect(firstThought?.length).toBeGreaterThan(0);

	// Step until the run ends, asserting the tick counter climbs as we go.
	let previousSteps = await page.getByTestId('steps-left').textContent();
	for (let step = 0; step < 15; step++) {
		if (await page.getByTestId('end-card').isVisible()) break;
		await page.getByTestId('step').click();
		const nowSteps = await page.getByTestId('steps-left').textContent();
		expect(nowSteps).not.toBe(previousSteps);
		previousSteps = nowSteps;
	}

	const endCard = page.getByTestId('end-card');
	await expect(endCard).toBeVisible();
	await expect(endCard).toHaveAttribute('data-outcome', 'SUCCESS');
	await expect(endCard).toContainText('Goal achieved');

	// The world agrees: Teddy really is holding the snack.
	await page.getByTestId('end-see-trace').click();
	await expect(page.getByTestId('teddy-holding')).toContainText('snack');
});

test('the Flight Recorder shows the exact composed prompt', async ({ page }) => {
	await buildAndGo(page);
	await page.getByTestId('step').click();

	const recorder = page.getByTestId('flight-recorder');
	await expect(recorder).toBeVisible();

	await scrollTraceToTop(page);
	await page.getByTestId('trace-row').filter({ hasText: 'Prompt composed' }).first().click();

	const detail = page.getByTestId('payload-prompt');
	await expect(detail).toBeVisible();
	// The three labelled sections from 02 §8, and a token count.
	await expect(detail).toContainText('system');
	await expect(detail).toContainText('observation');
	await expect(detail).toContainText('tokens');
	// The real prompt text, verbatim — this is the promise the whole trace rests on.
	await expect(detail).toContainText('small robot in a simulated playroom');
	await expect(detail).toContainText('Find a snack');
});

test('the trace is colour-coded by brick and readable in words', async ({ page }) => {
	await buildAndGo(page);
	await page.getByTestId('step').click();

	await expect(page.getByTestId('trace-count')).toContainText('events');
	await scrollTraceToTop(page);
	const senseRow = page.getByTestId('trace-row').filter({ hasText: 'Looked around' }).first();
	await expect(senseRow).toBeVisible();
	await expect(senseRow).toHaveAttribute('data-event-type', 'sense');
});

test('play mode runs to the end on its own', async ({ page }) => {
	await buildAndGo(page);

	await page.getByTestId('play').click();
	await expect(page.getByTestId('end-card')).toBeVisible({ timeout: 30_000 });
	await expect(page.getByTestId('end-card')).toHaveAttribute('data-outcome', 'SUCCESS');
});

test('stop ends the run with its own end card', async ({ page }) => {
	await buildAndGo(page);
	await page.getByTestId('step').click();
	await page.getByTestId('stop').click();

	const endCard = page.getByTestId('end-card');
	await expect(endCard).toBeVisible();
	await expect(endCard).toHaveAttribute('data-outcome', 'STOPPED_BY_USER');
});

test('reset world puts everything back', async ({ page }) => {
	await buildAndGo(page);
	await page.getByTestId('step').click();
	await expect(page.getByTestId('world-view')).toBeVisible();

	await page.getByTestId('reset').click();
	await expect(page.getByTestId('world-waiting')).toBeVisible();
	await expect(page.getByTestId('trace-count')).toContainText('0 events');
});

test('an unscripted card says so, and the bot potters about instead', async ({ page }) => {
	await buildAndGo(page, 'card-free-play');
	await expect(page.getByTestId('unscripted-notice')).toBeVisible();

	await page.getByTestId('step').click();
	await expect(page.getByTestId('world-view')).toBeVisible();
});

test('the end card leads back to the bench', async ({ page }) => {
	await buildAndGo(page);
	await page.getByTestId('play').click();
	await expect(page.getByTestId('end-card')).toBeVisible({ timeout: 30_000 });

	await page.getByTestId('end-back-to-bench').click();
	await expect(page).toHaveURL(/\/bench\//);
});

test('streamed tokens appear in the thought bubble as they arrive', async ({ page }) => {
	// The mock provider has streamed since WP3, so this needs no key — but it is
	// the same `think.token` path a real OpenAI response takes (WP7 DoD).
	await buildAndGo(page);

	const bubble = page.getByTestId('thought-text');
	await page.getByTestId('step').click();
	await expect(bubble).toBeVisible();

	// Every streamed delta became a think.token event on the way.
	await scrollTraceToTop(page);
	const tokenRows = page.getByTestId('trace-row').filter({ hasText: 'Thinking…' });
	expect(await tokenRows.count()).toBeGreaterThan(1);

	// And the settled thought matches the text those tokens spelled out.
	await expect(bubble).toContainText('table');
});
