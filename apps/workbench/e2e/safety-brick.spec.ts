import { expect, test, type Page } from '@playwright/test';
import { skipTutorial } from './support.js';

/**
 * WP8: the Safety Brick's three rules, exercised through the real UI.
 *
 * Before WP8 every assertion in this file would have failed identically — the
 * brick's panel wrote its settings into the spec and the play route created its
 * session without any guardrails at all, so the dial, the checkboxes, and the
 * approval toggle were decoration. These tests are the standing proof that the
 * brick is wired to something.
 */

const KINDS = ['llm', 'sense', 'actions', 'memory', 'safety'] as const;

/** Build a bot with a Safety Brick fitted. */
async function buildWithSafetyBrick(page: Page, card = 'card-say-hello'): Promise<void> {
	await page.goto('/');
	await page.getByTestId('new-bot').click();
	await expect(page.getByTestId('baseplate')).toBeVisible();

	for (const kind of KINDS) {
		await page.getByTestId(`tray-${kind}`).focus();
		await page.keyboard.press('Enter');
		for (let step = 0; step < 8; step++) {
			const said = await page.getByTestId('announcer').textContent();
			if (said?.includes(`${kind} socket — this one fits`)) break;
			await page.keyboard.press('ArrowDown');
		}
		await page.keyboard.press('Enter');
	}

	await page.getByTestId(card).click();
	await page.getByTestId('socket-llm').getByRole('button').click();
	await page.getByTestId('cartridge-select').selectOption({ label: 'Demo Brain' });
}

/** Open the safety control panel (03-UI-UX-DESIGN.md §4.3). */
async function openSafetyPanel(page: Page): Promise<void> {
	await page.getByTestId('socket-safety').getByRole('button').click();
	await expect(page.getByTestId('brick-controls-safety')).toBeVisible();
}

async function go(page: Page): Promise<void> {
	await expect(page.getByRole('button', { name: /GO/ })).toBeEnabled();
	await page.getByRole('button', { name: /GO/ }).click();
	await expect(page).toHaveURL(/\/play\//);
}

test.beforeEach(async ({ page }) => skipTutorial(page));

test('the step budget dial stops the run with the Safety Brick end card', async ({ page }) => {
	// Deliberately a card with no demo plan: the scripted goals all finish inside
	// the dial's minimum of five turns (say-hello succeeds on turn four, because
	// the `say` *is* the goal), so only an unscripted bot can reach the budget.
	await buildWithSafetyBrick(page, 'card-tidy-the-blocks');
	await openSafetyPanel(page);
	await page.getByTestId('max-ticks').fill('5');
	await expect(page.getByTestId('brick-controls-safety')).toContainText('Step budget: 5 turns');

	await go(page);
	await page.getByTestId('play').click();

	const endCard = page.getByTestId('end-card');
	await expect(endCard).toBeVisible({ timeout: 20_000 });
	// Not "Ran out of steps": the builder's own rule stopped this, and the card
	// says so (08 §3, as amended in WP8).
	await expect(endCard).toHaveAttribute('data-outcome', 'STOPPED_BY_GUARDRAIL');
	await expect(endCard).toContainText('The Safety Brick did its job');
});

test('the gauge counts down the dial, not the engine floor', async ({ page }) => {
	await buildWithSafetyBrick(page);
	await openSafetyPanel(page);
	await page.getByTestId('max-ticks').fill('8');

	await go(page);
	// The floor is 30; showing that here would contradict the brick on the bench.
	await expect(page.getByTestId('steps-left')).toContainText('of 8');
});

test('a blocked action is refused, and the run carries on', async ({ page }) => {
	await buildWithSafetyBrick(page);
	await openSafetyPanel(page);

	const controls = page.getByTestId('brick-controls-safety');
	await controls.getByRole('checkbox', { name: 'Move' }).check();

	await go(page);
	await page.getByTestId('step').click();

	// The bot wanted to move; the rule said no and the run kept its legs.
	await expect(page.getByTestId('flight-recorder')).toContainText('Safety rule stopped it', {
		timeout: 10_000
	});
	await expect(page.getByTestId('end-card')).toBeHidden();
	await page.getByTestId('step').click();
	await expect(page.getByTestId('end-card')).toBeHidden();
});

test('approval mode pauses for a person, who can allow the action', async ({ page }) => {
	await buildWithSafetyBrick(page);
	await openSafetyPanel(page);
	await page
		.getByTestId('brick-controls-safety')
		.getByRole('checkbox', { name: 'Ask before acting' })
		.check();

	await go(page);
	await page.getByTestId('step').click();

	const card = page.getByTestId('approval-card');
	await expect(card).toBeVisible({ timeout: 10_000 });
	await expect(page.getByTestId('approval-signature')).toContainText('move(');
	await expect(page.getByTestId('status-lamp')).toContainText('Paused');

	await page.getByTestId('approval-allow').click();
	await expect(card).toBeHidden();
	// Allowed, so the world actually changed.
	await expect(page.getByTestId('world-view')).toBeVisible();
});

test('approval mode lets a person deny, and the bot is told why', async ({ page }) => {
	await buildWithSafetyBrick(page);
	await openSafetyPanel(page);
	await page
		.getByTestId('brick-controls-safety')
		.getByRole('checkbox', { name: 'Ask before acting' })
		.check();

	await go(page);
	await page.getByTestId('step').click();
	await expect(page.getByTestId('approval-card')).toBeVisible({ timeout: 10_000 });
	await page.getByTestId('approval-deny').click();

	await expect(page.getByTestId('approval-card')).toBeHidden();
	// A denial is information, not an ending: the run is still going.
	await expect(page.getByTestId('end-card')).toBeHidden();
});
