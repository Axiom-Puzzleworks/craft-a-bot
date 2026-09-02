import { expect, test, type Page } from '@playwright/test';
import { SETTINGS_STORAGE_KEY } from '../src/lib/state/settings.js';
import { BRICKS, skipTutorial } from './support.js';

/**
 * **The content store** (`34-CONTENT-STORE.md` §6 stage B DoD, WP46): a card
 * authored in the Policy Studio is saved, picked on the Kit bench while the
 * Workshop door is open, fitted, run, and read back in the Spec Lab — the
 * reverse of WP22's round trip.
 */

const KINDS = ['llm', 'sense', 'actions', 'memory', 'safety'] as const;

/** The Workshop door open from the first load, the way `skipTutorial` sets its flag. */
async function openWorkshopDoor(page: Page): Promise<void> {
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
			JSON.stringify({ schemaVersion: 1, ...settings, workshop: true })
		);
	}, SETTINGS_STORAGE_KEY);
}

async function buildWithSafetyBrick(page: Page): Promise<void> {
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
	await page.getByTestId('card-tidy-the-blocks').click();
	await page.getByTestId('socket-brain').getByRole('button').click();
	await page.getByTestId('cartridge-select').selectOption({ label: 'Demo Brain' });
}

test.beforeEach(async ({ page }) => {
	await skipTutorial(page);
	await openWorkshopDoor(page);
});

test('a card authored in the Studio is fitted in the Kit, runs, and reads back in the Spec Lab', async ({
	page
}) => {
	await page.goto('/workshop/policies');
	await page.getByTestId('policy-title').fill('No shouting');
	await page.getByTestId('policy-description').fill('Quiet, please.');
	// The default condition is "the call is named…" — name it.
	await page.getByTestId('condition-0-0').getByPlaceholder('e.g. open').fill('celebrate');
	await page.getByTestId('policy-save').click();
	await expect(page.getByTestId('policy-saved')).toContainText('local/policy/no-shouting');
	await expect(page.getByTestId('local-policy-local/policy/no-shouting')).toBeVisible();
	await expect(page.getByTestId('policy-library')).toContainText('local/policy/no-shouting');

	await buildWithSafetyBrick(page);
	await page.getByTestId('socket-safety').getByRole('button').click();
	await expect(page.getByTestId('policy-cards')).toBeVisible();
	await page.getByTestId('policy-cards').getByText('No shouting').click();
	await expect(
		page.getByTestId('policy-cards').getByRole('checkbox', { name: 'No shouting' })
	).toBeChecked();

	await page.waitForTimeout(300);
	await page.getByRole('button', { name: /GO/ }).click();
	await expect(page).toHaveURL(/\/play\//);
	await page.getByTestId('step').click();
	await expect(page.getByTestId('world-view')).toBeVisible();

	await page.goto('/workshop');
	await expect(page.getByTestId('fleet')).toBeVisible();
	await page.locator('[data-testid^="fleet-row-"]').first().getByRole('link').click();
	await expect(page.getByTestId('spec-policy-cards')).toBeVisible();
	await expect(page.getByTestId('spec-policy-cards')).toContainText('local/policy/no-shouting');
	await expect(page.getByTestId('spec-policy-cards')).not.toContainText('not installed');
});

test('the Kit keeps authored cards behind the Workshop door', async ({ page }) => {
	await page.goto('/workshop/policies');
	await page.getByTestId('policy-title').fill('Door test');
	await page.getByTestId('condition-0-0').getByPlaceholder('e.g. open').fill('say');
	await page.getByTestId('policy-save').click();
	await expect(page.getByTestId('policy-saved')).toBeVisible();

	// Shut the door: the same settings key, `workshop` off.
	await page.evaluate((key) => {
		const settings = JSON.parse(window.localStorage.getItem(key as string) ?? '{}');
		window.localStorage.setItem(key as string, JSON.stringify({ ...settings, workshop: false }));
	}, SETTINGS_STORAGE_KEY);
	await page.addInitScript((key) => {
		const storageKey = key as string;
		const settings = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}');
		window.localStorage.setItem(storageKey, JSON.stringify({ ...settings, workshop: false }));
	}, SETTINGS_STORAGE_KEY);

	await buildWithSafetyBrick(page);
	await page.getByTestId('socket-safety').getByRole('button').click();
	await expect(page.getByTestId('policy-cards')).toBeVisible();
	await expect(page.getByTestId('policy-cards')).toContainText('No loose ends');
	await expect(page.getByTestId('policy-cards')).not.toContainText('Door test');
});
