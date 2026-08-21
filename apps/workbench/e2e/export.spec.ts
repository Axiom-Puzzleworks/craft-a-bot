import { expect, test } from '@playwright/test';
import { buildAndGo, skipTutorial } from './support.js';

/**
 * **The Audit Centre** (`17-…` §2/§4.9, WP34 stage D): "traces, reports,
 * cards, OTel export" — the capstone screen tying together this run's own
 * OTel-shaped trace, its bot's Agent Card, and links to the safety case
 * and incident log built in stages B and C.
 */

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
	return Buffer.concat(chunks).toString('utf8');
}

test.beforeEach(async ({ page }) => skipTutorial(page));

test('says so when the run store is empty', async ({ page }) => {
	await page.goto('/workshop/export');
	await expect(page.getByTestId('export-empty')).toBeVisible();
	await expect(page.getByTestId('export-run-head')).toHaveCount(0);
});

test('builds a real audit bundle: a downloadable OTel trace, a downloadable Agent Card, and working links to the safety case and incident log', async ({
	page
}) => {
	await buildAndGo(page, 'card-snack');
	await page.getByTestId('step').click();
	await expect(page.getByTestId('world-view')).toBeVisible();
	await page.getByTestId('step').click();

	await page.goto('/workshop/runs');
	await expect(page.getByTestId('run-table')).toBeVisible();
	const row = page.locator('[data-testid^="run-row-"]').first();
	const runId = (await row.getAttribute('data-testid'))?.replace('run-row-', '') ?? '';

	await page.goto(`/workshop/export?run=${runId}`);
	await expect(page.getByTestId('export-run-head')).toBeVisible();

	const tracePromise = page.waitForEvent('download');
	await page.getByTestId('export-download-trace').click();
	const traceFile = await tracePromise;
	expect(traceFile.suggestedFilename()).toBe('my-very-first-agent.otel-trace.json');
	const trace = JSON.parse(await streamToString(await traceFile.createReadStream())) as {
		resourceSpans: { scopeSpans: { spans: { name: string }[] }[] }[];
	};
	const spans = trace.resourceSpans[0].scopeSpans[0].spans;
	expect(spans[0]?.name).toMatch(/^invoke_agent /);

	const cardPromise = page.waitForEvent('download');
	await page.getByTestId('export-download-card').click();
	const cardFile = await cardPromise;
	expect(cardFile.suggestedFilename()).toBe('my-very-first-agent.craftabot-card.json');
	const card = JSON.parse(await streamToString(await cardFile.createReadStream())) as {
		name: string;
	};
	expect(card.name).toBe('My Very First Agent');

	await page.getByTestId('export-safety-case-link').click();
	await expect(page.getByTestId('safety-case-head')).toBeVisible();

	await page.goBack();
	await expect(page.getByTestId('export-run-head')).toBeVisible();
	await page.getByTestId('export-incidents-link').click();
	await expect(page.getByTestId('incidents-page')).toBeVisible();
});
