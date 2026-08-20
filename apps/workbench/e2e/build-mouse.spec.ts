import { expect, test, type Page } from '@playwright/test';
import { BRICKS, skipTutorial, type BrickName } from './support.js';

/**
 * WP5 definition of done, part one: **build a valid bot mouse-only**.
 *
 * Drags are driven with real pointer events rather than a test-only hook,
 * because the custom DnD (05-TECH-STACK.md §5) is exactly the thing under test.
 */

async function newBot(page: Page): Promise<void> {
	await page.goto('/');
	await page.getByTestId('new-bot').click();
	await expect(page).toHaveURL(/\/bench\//);
	await expect(page.getByTestId('baseplate')).toBeVisible();
}

/**
 * Lift a brick out of its tray well and drop it on a socket.
 *
 * The tray has no `overflow`/`max-height` (`PartsTray.svelte`) — it simply
 * grows as more brick kinds are registered, so a well far enough down the
 * list (and, symmetrically, a socket far enough down the baseplate) can sit
 * outside the viewport `boundingBox()` was read against. Scrolling each side
 * into view right before reading its box, rather than once for the whole
 * gesture, is what keeps this working as the catalogue keeps growing
 * (Radio joined the tray in WP31 stage F; Planner/Librarian/Connector are
 * still to come). A real held mouse button survives the scroll fine — the
 * page moving under a stationary pointer fires no `pointermove` of its own.
 */
async function dragBrickToSocket(page: Page, kind: BrickName): Promise<void> {
	const brick = page.getByTestId(`tray-${BRICKS[kind].id}`);
	const socket = page.getByTestId(`socket-${BRICKS[kind].slot}`);

	await brick.scrollIntoViewIfNeeded();
	const from = await brick.boundingBox();
	if (!from) throw new Error(`missing bounding box for ${kind}`);

	await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
	await page.mouse.down();

	await socket.scrollIntoViewIfNeeded();
	const to = await socket.boundingBox();
	if (!to) throw new Error(`missing bounding box for ${kind}`);
	// Two moves: the first starts the carry, the second lands on the socket.
	await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
	await page.mouse.up();
}

test.beforeEach(async ({ page }) => skipTutorial(page));

test('builds a bot with the mouse and pulls the GO lever', async ({ page }) => {
	await newBot(page);

	// A brainless bot cannot go anywhere.
	await expect(page.getByTestId('check-missing-brain')).toBeVisible();
	await expect(page.getByRole('button', { name: /GO/ })).toBeDisabled();

	await dragBrickToSocket(page, 'llm');
	await expect(page.getByTestId('socket-brain')).toHaveAttribute('data-fitted', 'true');

	await dragBrickToSocket(page, 'sense');
	await dragBrickToSocket(page, 'actions');
	await expect(page.getByTestId('socket-perception')).toHaveAttribute('data-fitted', 'true');
	await expect(page.getByTestId('socket-mobility')).toHaveAttribute('data-fitted', 'true');

	// The brain is on but its cartridge slot is empty, so GO is still held back —
	// and the ribbon says so rather than leaving the user guessing.
	await expect(page.getByTestId('check-unknown-cartridge')).toContainText('no model cartridge');

	// Slot a Goal Card.
	await page.getByTestId('card-snack').click();
	await expect(page.getByTestId('active-goal')).toContainText('Find a snack');
});

test('a brick dragged off the baseplate goes back to the tray', async ({ page }) => {
	await newBot(page);
	await dragBrickToSocket(page, 'memory');
	await expect(page.getByTestId('socket-memory')).toHaveAttribute('data-fitted', 'true');

	const socket = await page.getByTestId('socket-memory').boundingBox();
	if (!socket) throw new Error('missing socket');

	await page.mouse.move(socket.x + socket.width / 2, socket.y + socket.height / 2);
	await page.mouse.down();
	await page.mouse.move(socket.x + 500, socket.y + 320, { steps: 8 });
	await page.mouse.up();

	await expect(page.getByTestId('socket-memory')).toHaveAttribute('data-fitted', 'false');
	await expect(page.getByTestId('tray-starter/memory')).toBeEnabled();
});

test('the wrong socket refuses the brick', async ({ page }) => {
	await newBot(page);

	const brick = await page.getByTestId('tray-starter/llm').boundingBox();
	const wrong = await page.getByTestId('socket-memory').boundingBox();
	if (!brick || !wrong) throw new Error('missing bounding box');

	await page.mouse.move(brick.x + brick.width / 2, brick.y + brick.height / 2);
	await page.mouse.down();
	await page.mouse.move(wrong.x + wrong.width / 2, wrong.y + wrong.height / 2, { steps: 8 });
	// The socket shakes its head rather than silently ignoring the brick.
	await expect(page.getByTestId('socket-memory')).toHaveAttribute('data-state', 'rejecting');
	await page.mouse.up();

	await expect(page.getByTestId('socket-memory')).toHaveAttribute('data-fitted', 'false');
	await expect(page.getByTestId('socket-brain')).toHaveAttribute('data-fitted', 'false');
});
