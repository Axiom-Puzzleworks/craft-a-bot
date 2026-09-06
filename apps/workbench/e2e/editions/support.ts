import { expect, type Page } from '@playwright/test';
import { SETTINGS_STORAGE_KEY } from '../../src/lib/state/settings.js';
import { BRICKS } from '../support.js';

/**
 * The editions' smoke helpers (`59-EDITIONS.md` §4.5, WP69). Every URL here
 * is *relative* — `page.goto('settings')` — so it resolves under the
 * project's `baseURL`, which is the edition's folder; `'/settings'` would
 * escape to the host's root, which under `vite preview` is the `full`
 * build and on a static host is nothing. The bot is built the way the
 * default suite's `buildReadyBot` builds it, keyboard-only, with the
 * keyless Demo Brain.
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

/** The shelf at the edition's root, with the document stamped for this edition. */
export async function openShelf(page: Page, edition: string): Promise<void> {
	await page.goto('');
	await expect(page.locator('html')).toHaveAttribute('data-edition', edition);
	await expect(page.getByTestId('new-bot')).toBeVisible();
}

/** A bot built from the shelf that can do the snack goal, its GO lever lit; returns the agent id. */
export async function buildReadyBot(page: Page, cardTestId = 'card-snack'): Promise<string> {
	await page.getByTestId('new-bot').click();
	await expect(page.getByTestId('baseplate')).toBeVisible();
	for (const kind of ['llm', 'sense', 'actions', 'memory'] as const) {
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
	await expect(page.getByRole('button', { name: /GO/ })).toBeEnabled();
	await page.waitForTimeout(300);
	const match = /\/bench\/([^/?#]+)/.exec(page.url());
	if (!match?.[1]) throw new Error(`no agent id in ${page.url()}`);
	return match[1];
}

/** Build, pull GO, play to the end card and wait for the run to be saved. */
export async function playToTheEnd(page: Page, cardTestId = 'card-snack'): Promise<string> {
	const agentId = await buildReadyBot(page, cardTestId);
	await page.getByRole('button', { name: /GO/ }).click();
	await expect(page).toHaveURL(/\/play\//);
	await page.getByTestId('play').click();
	await expect(page.getByTestId('end-card')).toBeVisible({ timeout: 30_000 });
	await expect(page.getByTestId('run-saved')).toBeVisible({ timeout: 10_000 });
	return agentId;
}

/**
 * A client-side navigation to a path under the edition's base — an anchor
 * the app's own router intercepts. A `page.goto` would be a full load, and
 * `vite preview` has one SPA fallback (the `full` build's) rather than one
 * per folder, so a deep link under preview never reaches this edition;
 * a static host with its rewrite rule does (`docs/publishing.md` §2).
 */
export async function clientGoto(page: Page, edition: string, path: string): Promise<void> {
	await page.evaluate(
		([href]) => {
			const anchor = document.createElement('a');
			anchor.href = href as string;
			anchor.textContent = 'go';
			document.body.append(anchor);
			anchor.click();
		},
		[`/${edition}${path}`]
	);
}
