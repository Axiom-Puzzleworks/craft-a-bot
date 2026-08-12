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
 */
export async function skipTutorial(page: Page): Promise<void> {
	await page.addInitScript(
		([key, value]) => {
			window.localStorage.setItem(key as string, value as string);
		},
		[SETTINGS_STORAGE_KEY, JSON.stringify({ tutorialSkipped: true, schemaVersion: 1 })]
	);
}
