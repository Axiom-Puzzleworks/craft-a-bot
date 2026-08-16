import { expect, test, type Page } from '@playwright/test';
import { BRICKS, skipTutorial } from './support.js';

/**
 * WP27: `@craftabot/pack-monitor`'s Watchbot, shipped for real — proof that a
 * brick built in WP14 purely to demonstrate the open brick contract reaches a
 * player with nothing hand-written for it (`18-…` WP27).
 *
 * Deliberately mirrors `safety-brick.spec.ts`'s shape: same kind of proof, a
 * different brick in the same socket, and the point of the comparison is the
 * point of the brick — a Safety Brick *blocks*, a Watchbot *notices*.
 */

/** Focus a tray item, pick it up, and place it in the given socket. */
async function fit(page: Page, trayTestId: string, socketPhrase: string): Promise<void> {
	await page.getByTestId(trayTestId).focus();
	await page.keyboard.press('Enter');
	for (let step = 0; step < 8; step++) {
		const said = await page.getByTestId('announcer').textContent();
		if (said?.includes(socketPhrase)) break;
		await page.keyboard.press('ArrowDown');
	}
	await page.keyboard.press('Enter');
}

/**
 * A bot with no Scrapbook brick, on the snack card, and a Watchbot rather
 * than a Safety Brick. `demo-brain.ts`'s "no-memory" variant has it plan the
 * same "a snack — tables are north" move over and over, forgetting each time
 * that it has already tried it — every call in the script is `move`,
 * whichever direction, which is exactly the shape `monitor/going-in-circles`
 * (its own default watch) is built to catch.
 */
async function buildForgetfulBot(page: Page): Promise<void> {
	await page.goto('/');
	await page.getByTestId('new-bot').click();
	await expect(page.getByTestId('baseplate')).toBeVisible();

	for (const kind of ['llm', 'tools', 'sense', 'actions'] as const) {
		await fit(page, `tray-${BRICKS[kind].id}`, `${BRICKS[kind].socket} socket — this one fits`);
	}
	await fit(page, 'tray-monitor/watchbot', 'chest socket — this one fits');

	await page.getByTestId('card-snack').click();
	await page.getByTestId('socket-brain').getByRole('button').click();
	await page.getByTestId('cartridge-select').selectOption({ label: 'Demo Brain' });
}

test.beforeEach(async ({ page }) => skipTutorial(page));

test('a Watchbot can be fitted where a Safety Brick would go, and the tray reflects the choice', async ({
	page
}) => {
	await page.goto('/');
	await page.getByTestId('new-bot').click();
	await expect(page.getByTestId('baseplate')).toBeVisible();

	await fit(page, 'tray-monitor/watchbot', 'chest socket — this one fits');

	await expect(page.getByTestId('socket-safety')).toHaveAttribute('data-fitted', 'true');
	// The tray names it as content, same as any other brick — "Socket taken"
	// rather than the Watchbot's own name, because the socket is chest-shaped,
	// not Watchbot-shaped.
	await expect(page.getByTestId('tray-starter/safety')).toContainText('Socket taken');
	await expect(page.getByTestId('brick-controls-safety')).toContainText('Watch out for');
});

test('the Watchbot writes down what it sees instead of stopping it', async ({ page }) => {
	await buildForgetfulBot(page);

	await expect(page.getByRole('button', { name: /GO/ })).toBeEnabled();
	await page.getByRole('button', { name: /GO/ }).click();
	await expect(page).toHaveURL(/\/play\//);

	// `going-in-circles` trips on three identical calls running — the "no
	// memory" script is `move` every single turn, whichever direction, so the
	// third turn is already enough.
	for (let step = 0; step < 5; step++) {
		await page.getByTestId('step').click();
	}

	// Unlike the Safety Brick's loop-breaker, nothing here ever refuses a turn
	// — the bot moves every time it tries to, which is the whole point of an
	// observer over a control.
	await expect(page.getByTestId('end-card')).toBeHidden();
	await expect(page.getByTestId('safety-ticker')).toContainText('Safety brick:');

	const notes = await page.evaluate(async () => {
		const open = indexedDB.open('craftabot');
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			open.onsuccess = () => resolve(open.result);
			open.onerror = () => reject(open.error);
		});
		const rows = await new Promise<{ event: { type: string; payload: unknown } }[]>(
			(resolve, reject) => {
				const request = db.transaction('events').objectStore('events').getAll();
				request.onsuccess = () => resolve(request.result as never);
				request.onerror = () => reject(request.error);
			}
		);
		db.close();
		return rows
			.map((row) => row.event)
			.filter((event) => event.type === 'guardrail.checked')
			.map((event) => (event.payload as { verdict: { note?: string } }).verdict.note)
			.filter((note): note is string => note !== undefined);
	});

	// `monitor/going-in-circles`'s own words (`rules.ts`) — the Watchbot's
	// note, in the permanent record, without the run being interfered with.
	expect(notes.some((note) => note.includes('Round in circles'))).toBe(true);
});
