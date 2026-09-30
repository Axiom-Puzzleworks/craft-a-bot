import { expect, test, type Page } from '@playwright/test';
import { BRICKS, skipTutorial, type BrickName } from './support.js';

/**
 * **Sure or unsure** (WP131, `109-THE-TAIL-DAY7.md` §3; `100-…` §6.8, G89):
 * the Kit's Day 7 card on the Front Desk's queue, played by the Demo Brain —
 * which does whatever the reader says — so the run is won or lost by the
 * child's line alone. Keyboard only, as every Kit build path is proved: not
 * one pointer event in this file.
 */
const CARD = 'card-workshop/sure-or-unsure';

async function placeByKeyboard(page: Page, kind: BrickName): Promise<void> {
	await page.getByTestId(`tray-${BRICKS[kind].id}`).focus();
	await page.keyboard.press('Enter');
	for (let step = 0; step < 8; step++) {
		const said = await page.getByTestId('announcer').textContent();
		if (said?.includes(`${BRICKS[kind].socket} socket — this one fits`)) break;
		await page.keyboard.press('ArrowDown');
	}
	await page.keyboard.press('Enter');
	await expect(page.getByTestId('announcer')).toContainText(`${BRICKS[kind].name} placed`);
}

async function tick(page: Page, controls: string, names: string[]): Promise<void> {
	for (const name of names) {
		const box = page.getByTestId(controls).getByRole('checkbox', { name });
		await box.focus();
		if (!(await box.isChecked())) await page.keyboard.press('Space');
		await expect(box).toBeChecked();
	}
}

/** A bot on the card, built by keyboard, its dial turned `steps` notches from the default (50%). */
async function buildOnTheQueue(page: Page, steps: number): Promise<void> {
	await page.goto('/');
	await page.getByTestId('new-bot').focus();
	await page.keyboard.press('Enter');
	await expect(page.getByTestId('baseplate')).toBeVisible();
	for (const kind of ['llm', 'sense', 'actions', 'memory'] as const)
		await placeByKeyboard(page, kind);

	// The card, from the keyboard; it is a Kit card, on the rack with the Workshop door shut.
	await page.getByTestId(CARD).focus();
	await page.keyboard.press('Enter');
	await expect(page.getByTestId('active-goal')).toContainText('reader');

	// The queue's senses and hands.
	await page.getByTestId('socket-perception').getByRole('button').focus();
	await page.keyboard.press('Enter');
	await tick(page, 'brick-controls-perception', ['Case file', 'Queue']);
	await page.getByTestId('socket-mobility').getByRole('button').focus();
	await page.keyboard.press('Enter');
	await tick(page, 'brick-controls-mobility', ['Read note', 'Let in', 'Turn away']);

	// The keyless Demo Brain.
	await page.getByTestId('socket-brain').getByRole('button').focus();
	await page.keyboard.press('Enter');
	const cartridge = page.getByTestId('cartridge-select');
	await cartridge.focus();
	await page.keyboard.type('Demo Brain');
	await expect(cartridge.locator('option:checked')).toHaveText(/Demo Brain/);

	// The dial: the child's line.
	const dial = page.getByTestId('card-dial-input');
	await dial.focus();
	for (let step = 0; step < steps; step++) await page.keyboard.press('ArrowRight');
	await expect(page.getByTestId('card-dial-value')).toHaveText(`${50 + steps * 5}%`);

	const go = page.getByRole('button', { name: /GO/ });
	await expect(go).toBeEnabled();
	await go.focus();
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/play\//);
	const play = page.getByTestId('play');
	await play.focus();
	await page.keyboard.press('Enter');
	await expect(page.getByTestId('end-card')).toBeVisible({ timeout: 60_000 });
}

test.beforeEach(async ({ page }) => skipTutorial(page));

test('at the default line (50%) the reader’s 55% guess lets the wrong visitor in: the card is lost', async ({
	page
}) => {
	await buildOnTheQueue(page, 0);
	await expect(page.getByTestId('end-card')).not.toHaveAttribute('data-outcome', 'SUCCESS');
	await expect(page.getByTestId('desk-queue-visitor-4')).toHaveAttribute('data-status', 'decided');
	// The chip says how sure the reader was about each note it read.
	await expect(page.getByTestId('desk-reading-chip-visitor-4-note')).toHaveText('55% sure');
});

test('at 65% both wrong readings go to a colleague, two in all: the card is won', async ({
	page
}) => {
	await buildOnTheQueue(page, 3);
	await expect(page.getByTestId('end-card')).toHaveAttribute('data-outcome', 'SUCCESS');
	await expect(page.getByTestId('desk-queue-visitor-4')).toHaveAttribute(
		'data-status',
		'escalated'
	);
	await expect(page.getByTestId('desk-queue-visitor-5')).toHaveAttribute(
		'data-status',
		'escalated'
	);
});
