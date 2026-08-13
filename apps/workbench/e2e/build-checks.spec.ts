import { expect, test, type Page } from '@playwright/test';
import { skipTutorial } from './support.js';

/**
 * WP5 definition of done, part three: **invalid builds show the correct checks**.
 *
 * The distinction under test is the one the whole tone of the app rests on:
 * blocking problems stop GO, warnings explain and let you carry on
 * (03-UI-UX-DESIGN.md §4.2, §4.4).
 */

async function newBot(page: Page): Promise<void> {
	await page.goto('/');
	await page.getByTestId('new-bot').click();
	await expect(page.getByTestId('baseplate')).toBeVisible();
}

async function fitBrick(page: Page, kind: string): Promise<void> {
	await page.getByTestId(`tray-${kind}`).focus();
	await page.keyboard.press('Enter');
	for (let step = 0; step < 8; step++) {
		const announcement = await page.getByTestId('announcer').textContent();
		if (announcement?.includes(`${kind} socket — this one fits`)) break;
		await page.keyboard.press('ArrowDown');
	}
	await page.keyboard.press('Enter');
	await expect(page.getByTestId(`socket-${kind}`)).toHaveAttribute('data-fitted', 'true');
}

test.beforeEach(async ({ page }) => skipTutorial(page));

test('a brainless bot is blocked, and says why', async ({ page }) => {
	await newBot(page);

	const problem = page.getByTestId('check-missing-brain');
	await expect(problem).toContainText('needs a brain');
	await expect(problem).toHaveAttribute('data-severity', 'blocking');
	await expect(page.getByRole('button', { name: /GO/ })).toBeDisabled();
});

test('a notebook tool without a notebook warns but never blocks', async ({ page }) => {
	await newBot(page);
	await fitBrick(page, 'tools');
	await fitBrick(page, 'memory');

	// Open the tools panel and switch on a tool that needs the notebook.
	await page.getByTestId('socket-tools').getByRole('button').click();
	await expect(page.getByTestId('brick-controls-equipment')).toBeVisible();
	await page.getByRole('checkbox', { name: 'Notebook (write)' }).check();

	const warning = page.getByTestId('check-tool-needs-notebook');
	await expect(warning).toBeVisible();
	await expect(warning).toHaveAttribute('data-severity', 'warning');
	await expect(warning).toContainText('notebook');
});

test('the checks clear once the build is sound', async ({ page }) => {
	await newBot(page);
	await expect(page.getByTestId('check-missing-brain')).toBeVisible();

	await fitBrick(page, 'llm');
	// The brain is on, so that problem is gone — replaced by the empty slot.
	await expect(page.getByTestId('check-missing-brain')).toHaveCount(0);
	await expect(page.getByTestId('check-unknown-cartridge')).toBeVisible();
});

test('clicking a check jumps to the brick that needs attention', async ({ page }) => {
	await newBot(page);
	await fitBrick(page, 'llm');

	await page.getByTestId('check-unknown-cartridge').getByRole('button').click();
	await expect(page.getByTestId('brick-controls-brain')).toBeVisible();
});

test('every brick panel has a flip side in real terminology', async ({ page }) => {
	await newBot(page);
	await fitBrick(page, 'llm');

	await page.getByTestId('socket-llm').getByRole('button').click();
	await expect(page.getByTestId('brick-controls-brain')).toBeVisible();

	await page.getByTestId('flip-brick-panel').click();
	const flip = page.getByTestId('brick-flip-side');
	await expect(flip).toContainText('LLM (large language model)');
	await expect(flip).toContainText('chat-completions call');
});
