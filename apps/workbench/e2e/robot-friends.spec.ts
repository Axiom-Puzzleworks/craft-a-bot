import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { buildReadyBot, skipTutorial } from './support.js';

/**
 * **WP31 stage E** (`24-ROBOT-FRIENDS-DESIGN.md` §10): the Robot Friends
 * bench lever and picker — the last piece the earlier stages typed the URL
 * around. `duo-play.spec.ts`/`duo-persistence.spec.ts` already prove the
 * duo Playroom and its persistence thoroughly; this file's own job is only
 * the picker itself and the walk that reaches it: "shelf → bench → Robot
 * Friends → duo Playroom → scrapbook" (§10 stage E's own gate).
 */

test.beforeEach(async ({ page }) => skipTutorial(page));

test('the lever is disabled with a reason until a second GO-ready bot exists', async ({ page }) => {
	await buildReadyBot(page);

	const lever = page.getByTestId('robot-friends-lever');
	await expect(lever).toBeDisabled();
	await expect(lever).toHaveAttribute('title', 'Build a second robot first');
});

test('the lever, the picker, and the launch it builds — shelf → bench → Robot Friends → duo Playroom → scrapbook', async ({
	page
}) => {
	const idA = await buildReadyBot(page);
	const idB = await buildReadyBot(page);

	// Back on the first bot's own bench, where two GO-ready bots now exist.
	await page.goto(`/bench/${idA}`);
	const lever = page.getByTestId('robot-friends-lever');
	await expect(lever).toBeEnabled();
	await lever.click();

	const picker = page.getByTestId('robot-friends-picker');
	await expect(picker).toBeVisible();
	// The second bot itself is never offered as its own partner.
	await expect(page.getByTestId(`rf-bot-${idA}`)).toHaveCount(0);
	await expect(page.getByTestId(`rf-bot-${idB}`)).toBeVisible();

	// "Send them in!" starts disabled — neither a card nor a partner is chosen yet.
	const go = page.getByTestId('robot-friends-go');
	await expect(go).toBeDisabled();

	await page.getByTestId('rf-card-tidy-together').click();
	await expect(go).toBeDisabled();
	await page.getByTestId(`rf-bot-${idB}`).click();
	await expect(go).toBeEnabled();
	await go.click();

	// Lands in the duo Playroom stage B built, with the real ids and card.
	await expect(page).toHaveURL(/\/play\/duo\?/);
	const launched = new URL(page.url());
	expect(launched.searchParams.get('a')).toBe(idA);
	expect(launched.searchParams.get('b')).toBe(idB);
	expect(launched.searchParams.get('card')).toBe('starter/tidy-together');
	await expect(page.getByTestId('duo-play')).toBeVisible();

	await page.getByTestId('step').click();
	await expect(page.getByTestId(`member-tick-${idA}`)).toHaveText('Turn 1');
	await page.getByTestId('stop').click();
	await expect(page.getByTestId('duo-finished')).toBeVisible();

	// Reaches the scrapbook as a shared adventure — full persistence proof is
	// duo-persistence.spec.ts's own job; this just confirms the walk ends there.
	await page.goto('/scrapbook');
	await expect(page.locator('[data-testid^="group-"]').first()).toBeVisible();
});

test('cancelling the picker keeps the bot on its own bench, untouched', async ({ page }) => {
	const idA = await buildReadyBot(page);
	await buildReadyBot(page);
	await page.goto(`/bench/${idA}`);

	await page.getByTestId('robot-friends-lever').click();
	await expect(page.getByTestId('robot-friends-picker')).toBeVisible();

	await page.getByTestId('robot-friends-cancel').click();
	await expect(page.getByTestId('robot-friends-picker')).toHaveCount(0);
	await expect(page).toHaveURL(new RegExp(`/bench/${idA}$`));
});

test('Escape closes the picker the same way Cancel does', async ({ page }) => {
	const idA = await buildReadyBot(page);
	await buildReadyBot(page);
	await page.goto(`/bench/${idA}`);

	await page.getByTestId('robot-friends-lever').click();
	await expect(page.getByTestId('robot-friends-picker')).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(page.getByTestId('robot-friends-picker')).toHaveCount(0);
});

test('the Robot Friends picker has no accessibility violations', async ({ page }) => {
	const idA = await buildReadyBot(page);
	await buildReadyBot(page);
	await page.goto(`/bench/${idA}`);

	await page.getByTestId('robot-friends-lever').click();
	await expect(page.getByTestId('robot-friends-picker')).toBeVisible();

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
