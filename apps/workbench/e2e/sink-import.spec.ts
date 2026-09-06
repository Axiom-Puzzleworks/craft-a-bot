import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { skipTutorial } from './support.js';

/**
 * **Live trailing, the harness half** (WP68, `57-…` §4.5, §11 item 5): the
 * file sink's JSONL of a run still being written imports into the Run
 * Browser, the Run Lab says the run is still going, and re-importing the
 * finished file catches up.
 */
test.beforeEach(async ({ page }) => skipTutorial(page));

const HERE = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(
	readFileSync(
		join(
			HERE,
			'..',
			'..',
			'..',
			'packages',
			'packs',
			'starter',
			'src',
			'fixtures',
			'trace.say-hello.v1.json'
		),
		'utf8'
	)
) as Array<{ type: string; runId: string }>;
const lines = (events: readonly unknown[]) =>
	events.map((event) => JSON.stringify(event)).join('\n') + '\n';

test('a file sink’s lines import as a run still going, and re-importing the finished file catches up', async ({
	page
}) => {
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
	await page.goto('/workshop/runs');

	const partial = golden.filter((event) => event.type !== 'run.finished');
	await page.getByTestId('import-trace').setInputFiles({
		name: 'say-hello.jsonl',
		mimeType: 'application/x-ndjson',
		buffer: Buffer.from(lines(partial), 'utf8')
	});
	await expect(page.getByTestId('import-note')).toContainText('still going');
	const runId = golden[0]?.runId ?? '';
	await expect(page.getByTestId(`run-row-${runId}`)).toBeVisible();

	await page.goto(`/workshop/runs/${runId}`);
	await expect(page.getByTestId('header-outcome')).toHaveText('IN_PROGRESS');
	await expect(page.getByTestId('run-in-progress')).toContainText('re-import');

	// The finished file: the same run, caught up.
	await page.goto('/workshop/runs');
	await page.getByTestId('import-trace').setInputFiles({
		name: 'say-hello.jsonl',
		mimeType: 'application/x-ndjson',
		buffer: Buffer.from(lines(golden), 'utf8')
	});
	await expect(page.getByTestId('import-note')).toContainText('caught up');
	await page.goto(`/workshop/runs/${runId}`);
	await expect(page.getByTestId('header-outcome')).toHaveText('SUCCESS');
	await expect(page.getByTestId('run-in-progress')).toHaveCount(0);
});
