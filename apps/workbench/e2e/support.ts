import type { Page } from '@playwright/test';
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
