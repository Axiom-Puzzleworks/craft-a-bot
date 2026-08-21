import { expect, test } from '@playwright/test';
import { skipTutorial } from './support.js';

test.beforeEach(async ({ page }) => skipTutorial(page));

test('the Shelf page loads', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Craft A Bot' })).toBeVisible();
});

/**
 * The kit line (WP33's own kit-line-packaging half): every pack `18-…` §4
 * names, plus the curated Agent Builder bundle, both real on the Shelf a
 * reader sees first — not just in the design doc's own table.
 */
test('the kit line shows every pack, honestly, and the curated bundle', async ({ page }) => {
	await page.goto('/');

	for (const id of [
		'llm-multipack',
		'safety-patrol',
		'planner',
		'robot-friends',
		'explorers-world',
		'library',
		'tool-shop'
	]) {
		await expect(page.getByTestId(`pack-${id}`)).toBeVisible();
	}

	// Six packs are real, built content; Tool Shop's own tools do not exist
	// anywhere yet, and the shelf says so rather than claiming otherwise.
	await expect(page.getByTestId('pack-llm-multipack')).toContainText('Unlocked!');
	await expect(page.getByTestId('pack-tool-shop')).toContainText('Coming soon');

	await expect(page.getByTestId('agent-builder-bundle')).toBeVisible();
	await expect(page.getByTestId('agent-builder-bundle')).toContainText('Agent Builder');
});

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
	return Buffer.concat(chunks).toString('utf8');
}

/**
 * The Agent Card, downloaded straight from the Shelf (WP33 stage C) — a
 * second, deliberately different file from "Export"'s kit file: a
 * `.craftabot-card.json` a reader looks at, not one they hand back in.
 */
test('Export Passport downloads a bot’s own Agent Card, not a kit file', async ({ page }) => {
	await page.goto('/');
	await page.getByTestId('new-bot').click();
	await expect(page.getByTestId('baseplate')).toBeVisible();
	await page.getByTestId('bot-name').fill('Cardbot');
	await page.waitForTimeout(300); // benchStore's save debounce (support.ts's own note)

	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Cardbot' })).toBeVisible();

	const downloadPromise = page.waitForEvent('download');
	await page.getByTestId(/^export-card-/).click();
	const file = await downloadPromise;

	expect(file.suggestedFilename()).toBe('cardbot.craftabot-card.json');
	const card = JSON.parse(await streamToString(await file.createReadStream())) as {
		name: string;
		bricks: unknown[];
	};
	expect(card.name).toBe('Cardbot');
	expect(Array.isArray(card.bricks)).toBe(true);
});
