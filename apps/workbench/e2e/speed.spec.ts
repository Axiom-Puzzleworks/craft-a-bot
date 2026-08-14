import { expect, test, type Page } from '@playwright/test';
import { buildAndGo, skipTutorial } from './support.js';

/**
 * **The honest speed dial** (`16-…` §1.6, `12-…` D15).
 *
 * Turning the dial mid-run used to do nothing at all: the delay was fixed when
 * the session was built, so the buttons moved, the highlight followed, and the
 * bot carried on at exactly the pace it started at. The lie was completely
 * silent, which is the worst kind for a teaching aid — a child concludes the
 * toy is broken, or worse, that they imagined the difference.
 *
 * Cadence is the one thing about this that only a real browser can settle,
 * which is why the proof lives here rather than in a unit test.
 */

test.beforeEach(async ({ page }) => skipTutorial(page));

/** Steps taken so far, read out of the "N of M" gauge. */
async function stepsUsed(page: Page): Promise<number> {
	const text = (await page.getByTestId('steps-left').textContent()) ?? '';
	const [left, max] = text.split(' of ').map((part) => Number.parseInt(part.trim(), 10));
	if (Number.isNaN(left) || Number.isNaN(max)) throw new Error(`unreadable gauge: "${text}"`);
	return max - left;
}

/** How many steps the bot gets through in a fixed window. */
async function stepsIn(page: Page, windowMs: number): Promise<number> {
	const before = await stepsUsed(page);
	await page.waitForTimeout(windowMs);
	return (await stepsUsed(page)) - before;
}

test('a speed change reaches the run already in progress', async ({ page }) => {
	await buildAndGo(page);

	// Slowest first: 700ms base doubled to 1400ms a tick.
	await page.getByTestId('speed-0.5').click();
	await page.getByTestId('play').click();

	const slow = await stepsIn(page, 2000);

	// Now the fastest, without stopping or restarting: 175ms a tick.
	await page.getByTestId('speed-4').click();
	const fast = await stepsIn(page, 2000);

	// An eight-fold difference in the dial, measured over the same window. The
	// assertion is deliberately "more", not a ratio — CI machines are not
	// metronomes, and the defect being guarded against produced *no* change.
	expect(fast).toBeGreaterThan(slow);
});

test('the dial the child chose is the dial they get next time', async ({ page }) => {
	await buildAndGo(page);

	await page.getByTestId('speed-2').click();
	await expect(page.getByTestId('speed-2')).toHaveAttribute('aria-pressed', 'true');

	// The preference outlives the run, and the page it was set on.
	await page.reload();

	await expect(page.getByTestId('speed-2')).toHaveAttribute('aria-pressed', 'true');
});

test('the bot wears what the run is doing on its face', async ({ page }) => {
	await buildAndGo(page);

	// The Playroom draws no bot until a run puts one there, so the first face
	// anyone can see is the one after the opening step.
	await page.getByTestId('step').click();
	await expect(page.getByTestId('bot')).toBeVisible();

	await page.getByTestId('play').click();

	// And by the end of a snack run it has something to celebrate.
	await expect(page.getByTestId('end-card')).toBeVisible({ timeout: 30_000 });
	await expect(page.getByTestId('bot')).toHaveAttribute('data-expression', 'celebrating');
});
