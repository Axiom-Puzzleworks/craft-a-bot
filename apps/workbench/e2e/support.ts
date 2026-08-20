import { expect, type Page } from '@playwright/test';
import { SETTINGS_STORAGE_KEY } from '../src/lib/state/settings.js';

/**
 * Start as someone who has built kits before.
 *
 * The Instruction Leaflet opens by itself for a first-time visitor, which is
 * right for the product and wrong for a spec about something else — it dims the
 * page and docks a panel over one corner. Specs that are not testing the
 * tutorial seed the same preference the "I've built kits before" button writes,
 * so they exercise the ordinary returning-user path.
 *
 * `addInitScript` runs before any page script, so the leaflet never opens at
 * all rather than opening and being dismissed.
 *
 * It merges rather than overwrites, because it runs before *every* navigation
 * including reloads. Replacing the whole settings object wiped any preference
 * the test itself had set — which is how a passing reduced-motion preference
 * appeared to be forgotten across a reload.
 */
export async function skipTutorial(page: Page): Promise<void> {
	await page.addInitScript((key) => {
		const storageKey = key as string;
		let settings: Record<string, unknown>;
		try {
			settings = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}') as Record<
				string,
				unknown
			>;
		} catch {
			settings = {};
		}
		window.localStorage.setItem(
			storageKey,
			JSON.stringify({ schemaVersion: 1, ...settings, tutorialSkipped: true })
		);
	}, SETTINGS_STORAGE_KEY);
}

/**
 * The six starter bricks, in every vocabulary a spec needs (WP14 slice 4b).
 *
 * The tray is keyed by **kind id** and the baseplate by **socket** since the
 * bench stopped knowing V1's six brick names. Specs still say `BRICKS.llm`,
 * because "the brain brick" is what a test is actually talking about — this is
 * the one place that knows what that means in markup.
 */
export const BRICKS = {
	llm: { id: 'starter/llm', slot: 'brain', socket: 'head', name: 'Brain Brick' },
	memory: { id: 'starter/memory', slot: 'memory', socket: 'backpack', name: 'Scrapbook Brick' },
	tools: { id: 'starter/tools', slot: 'equipment', socket: 'belt', name: 'Tool Belt Brick' },
	sense: { id: 'starter/sense', slot: 'perception', socket: 'visor', name: 'Eyes & Ears Brick' },
	actions: {
		id: 'starter/actions',
		slot: 'mobility',
		socket: 'wheels',
		name: 'Hands & Wheels Brick'
	},
	safety: { id: 'starter/safety', slot: 'safety', socket: 'chest', name: 'Safety Brick' }
} as const;

export type BrickName = keyof typeof BRICKS;

/**
 * Build a bot GO-ready — every brick fitted, battery slotted, GO lit — and
 * stop there, returning its agent id.
 *
 * Split out of `buildAndGo` (WP31, `24-…` §10 stage B) so a duo test can
 * build two GO-ready bots without launching either through the solo Play
 * route: the shared setup cost of "a bot that can actually do the goal" is
 * one function regardless of how many bots a spec needs on the shelf, or
 * what it does with them once they are ready.
 */
export async function buildReadyBot(page: Page, cardTestId = 'card-snack'): Promise<string> {
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

	const match = /\/bench\/([^/?#]+)/.exec(page.url());
	if (!match?.[1])
		throw new Error(`Could not read an agent id out of the bench URL: ${page.url()}`);
	return match[1];
}

/** Build a bot that can actually do the snack goal, then pull the GO lever. */
export async function buildAndGo(page: Page, cardTestId = 'card-snack'): Promise<void> {
	await buildReadyBot(page, cardTestId);
	await page.getByRole('button', { name: /GO/ }).click();
	await expect(page).toHaveURL(/\/play\//);
}
