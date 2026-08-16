import { expect, test, type Page } from '@playwright/test';
import { BRICKS, skipTutorial } from './support.js';

/**
 * **WP22's definition of done, as a walk**: "a card round-trips Kit ⇄
 * Workshop."
 *
 * A card is fitted through the real Kit bench — the same picker a child
 * uses, rendered as a toy card (`PolicyCardChip`) — and then read back in
 * the Workshop's Spec Lab with no export, import or conversion, the same
 * property `workshop.spec.ts`'s "Spec Lab agrees with the Kit bench" test
 * proves for the rest of a bot.
 */

const KINDS = ['llm', 'sense', 'actions', 'memory', 'safety'] as const;

/** Build a bot with a Safety Brick fitted, stopping short of GO. */
async function buildWithSafetyBrick(page: Page, card = 'card-tidy-the-blocks'): Promise<void> {
	await page.goto('/');
	await page.getByTestId('new-bot').click();
	await expect(page.getByTestId('baseplate')).toBeVisible();

	for (const kind of KINDS) {
		await page.getByTestId(`tray-${BRICKS[kind].id}`).focus();
		await page.keyboard.press('Enter');
		for (let step = 0; step < 8; step++) {
			const said = await page.getByTestId('announcer').textContent();
			if (said?.includes(`${BRICKS[kind].socket} socket — this one fits`)) break;
			await page.keyboard.press('ArrowDown');
		}
		await page.keyboard.press('Enter');
	}

	await page.getByTestId(card).click();
	await page.getByTestId('socket-brain').getByRole('button').click();
	await page.getByTestId('cartridge-select').selectOption({ label: 'Demo Brain' });
}

test.beforeEach(async ({ page }) => skipTutorial(page));

test('the Policy Studio loads and lists what the packs ship', async ({ page }) => {
	await page.goto('/workshop/policies');
	await expect(page.getByTestId('policy-library')).toBeVisible();
	await expect(page.getByTestId('policy-library')).toContainText('No loose ends');
});

test('a policy card fitted in the Kit round-trips to the Workshop', async ({ page }) => {
	await buildWithSafetyBrick(page);

	await page.getByTestId('socket-safety').getByRole('button').click();
	await expect(page.getByTestId('policy-cards')).toBeVisible();

	// `PolicyCardChip`'s checkbox is visually hidden — the toy card itself is
	// the control, the same way `Rocker` paints its switch onto the input
	// rather than beside it. A real pointer clicks the card face, which the
	// native `<label>` forwards to the input; that is what this clicks too.
	const card = page.getByTestId('policy-cards').getByText('No loose ends');
	await card.click();
	await expect(
		page.getByTestId('policy-cards').getByRole('checkbox', { name: 'No loose ends' })
	).toBeChecked();

	// Off the bench and into the Workshop, with no save button in between — the
	// bench autosaves on every change, which is what makes this a round trip
	// rather than an export. `page.goto` is a full navigation, not a
	// same-app transition `beforeNavigate` would catch, so the debounced save
	// needs the same wait every other persistence spec gives it.
	await page.waitForTimeout(500);
	await page.goto('/workshop');
	await expect(page.getByTestId('fleet')).toBeVisible();
	await page.locator('[data-testid^="fleet-row-"]').first().getByRole('link').click();

	await expect(page.getByTestId('spec-policy-cards')).toBeVisible();
	await expect(page.getByTestId('spec-policy-cards')).toContainText('starter/policy/no-loose-ends');
	await expect(page.getByTestId('spec-policy-cards')).not.toContainText('not installed');
});
