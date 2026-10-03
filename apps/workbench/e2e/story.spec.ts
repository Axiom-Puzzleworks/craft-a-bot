import { expect, test } from '@playwright/test';
import { awaitRunSaved, buildReadyBot, skipTutorial } from './support.js';

/**
 * **The story** (WP161, `112-REAL-ENOUGH-PLAN.md` §5): a stored run read
 * top to bottom in the Run Lab, by keyboard, and downloaded from the Audit
 * Centre as the markdown `craftabot story` writes. The truth only at the end.
 */
test.beforeEach(async ({ page }) => skipTutorial(page));

async function aStoredRun(page: import('@playwright/test').Page): Promise<string> {
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
	const agentId = await buildReadyBot(page, 'card-snack');
	await page.goto(`/bench/${agentId}`);
	await page.getByRole('button', { name: /GO/ }).click();
	await page.getByTestId('step').click();
	await expect(page.getByTestId('world-view')).toBeVisible();
	await page.getByTestId('step').click();
	await page.getByTestId('stop').click();
	await awaitRunSaved(page);
	await page.goto('/workshop/runs');
	const row = page.locator('[data-testid^="run-row-"]').first();
	return (await row.getAttribute('data-testid'))?.replace('run-row-', '') ?? '';
}

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
	return Buffer.concat(chunks).toString('utf8');
}

test('the Run Lab reads a run as a story by keyboard, the ending last', async ({ page }) => {
	const runId = await aStoredRun(page);
	await page.goto(`/workshop/runs/${runId}`);
	await expect(page.getByTestId('run-header')).toBeVisible();
	await expect(page.getByTestId('story')).toHaveCount(0);

	await page.getByTestId('show-story').focus();
	await page.keyboard.press('Space');
	const story = page.getByTestId('story');
	await expect(story).toBeVisible();
	await expect(page.getByTestId('story-facts')).toContainText('Model');
	await expect(story).toContainText('Turn 1');
	await expect(story).toContainText('It saw:');
	await expect(page.getByTestId('story-ending')).toContainText('How it ended');

	// Off again.
	await page.keyboard.press('Space');
	await expect(page.getByTestId('story')).toHaveCount(0);
});

test('the Audit Centre downloads the story as markdown', async ({ page }) => {
	const runId = await aStoredRun(page);
	await page.goto(`/workshop/export?run=${runId}`);
	await expect(page.getByTestId('export-run-head')).toBeVisible();
	const download = page.waitForEvent('download');
	await page.getByTestId('export-download-story').click();
	const file = await download;
	expect(file.suggestedFilename()).toBe(`story-${runId}.md`);
	const text = await streamToString(await file.createReadStream());
	expect(text).toContain('# My Very First Agent on ');
	expect(text).toContain('## How it ended');
	expect(text).toContain('**saw**');
});
