import { expect, test, type Page } from '@playwright/test';
import { BRICKS, skipTutorial } from './support.js';

/**
 * **Free Play made real, and a bot you can talk to** (`16-…` §2.5, §2.6).
 *
 * Two features that were finished everywhere except where a child could reach
 * them. Free Play captured the goal a child wrote, stored it, showed it back on
 * the card holder — and never put it in the prompt, so the bot pursued the
 * card's generic wording and the child's goal was heard by nobody. Hearing
 * could report messages since WP5 and there was no way to send one (`12-…` D2).
 */

test.beforeEach(async ({ page }) => skipTutorial(page));

/** A bot with the four bricks a run needs, on a chosen card. */
async function buildOn(
	page: Page,
	cardTestId: string,
	kinds = ['llm', 'sense', 'actions', 'memory']
) {
	await page.goto('/');
	await page.getByTestId('new-bot').click();
	await expect(page.getByTestId('baseplate')).toBeVisible();

	for (const kind of kinds) {
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
	await page.getByTestId('socket-brain').getByRole('button').click();
	await page.getByTestId('cartridge-select').selectOption({ label: 'Demo Brain' });

	/*
	 * Wait for the lever before handing back. The bench saves the spec as it
	 * changes and the play route reads it back from storage, so a caller that
	 * pressed GO the instant this returned could land in the Playroom with a
	 * spec that had not caught up — which looked exactly like a bot built
	 * without the brick it had just been given.
	 */
	await expect(page.getByRole('button', { name: /GO/ })).toBeEnabled();
}

test('the goal a child writes is the goal the bot is given', async ({ page }) => {
	await buildOn(page, 'card-free-play');

	await page.getByTestId('custom-goal-text').fill('Push every block into a pile.');

	await page.getByRole('button', { name: /GO/ }).click();
	await expect(page).toHaveURL(/\/play\//);

	await page.getByTestId('step').click();
	await expect(page.getByTestId('bot')).toBeVisible();

	// The Flight Recorder holds the exact composed prompt, which is where this
	// can be checked rather than assumed.
	await page.getByTestId('trace-viewport').evaluate((node) => {
		node.scrollTop = 0;
		node.dispatchEvent(new Event('scroll'));
	});
	await page.getByTestId('trace-row').filter({ hasText: 'Prompt composed' }).first().click();

	const detail = page.getByTestId('payload-prompt');
	await expect(detail).toContainText('Your goal: Push every block into a pile.');
	// And the card's printed wording is not what it was told.
	await expect(detail).not.toContainText('potter about');
});

test('a person can declare Free Play finished, and the card says who did', async ({ page }) => {
	await buildOn(page, 'card-free-play');
	await page.getByTestId('custom-goal-text').fill('Have a wander.');
	await page.getByRole('button', { name: /GO/ }).click();
	await expect(page).toHaveURL(/\/play\//);

	// The button waits for a run to exist — there is nothing to call finished
	// before the bot has done anything.
	await expect(page.getByTestId('goal-achieved')).toBeDisabled();

	await page.getByTestId('step').click();
	await expect(page.getByTestId('bot')).toBeVisible();

	await page.getByTestId('goal-achieved').click();

	const endCard = page.getByTestId('end-card');
	await expect(endCard).toBeVisible();
	await expect(endCard).toHaveAttribute('data-outcome', 'SUCCESS');
	await expect(page.getByTestId('end-declared-by-player')).toBeVisible();
});

test('a bot with ears is told what you say to it', async ({ page }) => {
	await buildOn(page, 'card-free-play');

	/*
	 * Ears are off out of the box: the visor opens sight and compass, and
	 * hearing is a switch someone has to find. That is the lesson rather than an
	 * inconvenience — a bot only has the senses it was built with.
	 */
	await page.getByTestId('socket-perception').getByRole('button').first().click();
	await page.getByRole('checkbox', { name: /Hearing/ }).check();
	await expect(page.getByRole('checkbox', { name: /Hearing/ })).toBeChecked();

	await page.getByRole('button', { name: /GO/ }).click();
	await expect(page).toHaveURL(/\/play\//);

	await page.getByTestId('say-input').fill('Try over by the chest!');
	await page.getByTestId('say-send').click();

	// It reaches the trace as its own event, so "who told it that?" has an
	// answer (`02-…` §7, `19-…` §2).
	await expect(page.getByTestId('trace-viewport')).toContainText('Somebody said something', {
		timeout: 10_000
	});
});

test('a bot with no ears says so, rather than going quiet', async ({ page }) => {
	// No sense brick, so no Hearing channel.
	await buildOn(page, 'card-free-play', ['llm', 'actions', 'memory']);

	await page.getByRole('button', { name: /GO/ }).click();
	await expect(page).toHaveURL(/\/play\//);

	await expect(page.getByTestId('say-input')).toBeDisabled();
	await expect(page.getByTestId('say-no-ears')).toContainText('no ears yet');
	await expect(page.getByTestId('say-no-ears')).toContainText('Fit the Eyes & Ears brick');
});

/**
 * The two ways a bot ends up deaf look identical from the play screen and are
 * entirely different jobs. Telling a child to fit a brick they have already
 * fitted is the sort of thing that makes a toy feel broken.
 */
test('a bot with ears switched off is told to switch them on, not to fit a brick', async ({
	page
}) => {
	await buildOn(page, 'card-free-play');

	await page.getByRole('button', { name: /GO/ }).click();
	await expect(page).toHaveURL(/\/play\//);

	await expect(page.getByTestId('say-no-ears')).toContainText('hearing is switched off');
	await expect(page.getByTestId('say-no-ears')).not.toContainText('Fit the Eyes & Ears brick');
});
