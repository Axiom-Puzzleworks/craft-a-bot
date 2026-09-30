import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { skipTutorial } from './support.js';

/**
 * **A Gate's day in the Audit Centre** (WP128, `107-THE-GATE.md` §4): the
 * bundle the Gate package holds byte for byte, opened in the Audit Centre and
 * verified against its digest, its conversation there to pick, and the
 * assurance pack for the Gate naming its mode and stack.
 */
test.beforeEach(async ({ page }) => skipTutorial(page));

const FIXTURE = new URL('../../../packages/gate/fixtures/gate-day.bundle.json', import.meta.url);

test('a Gate’s bundle opens verified, and the assurance pack names the Gate', async ({ page }) => {
	await page.goto('/workshop/export');
	await expect(page.getByTestId('export-page')).toBeVisible();
	await page.getByTestId('export-open-bundle').setInputFiles({
		name: 'gate-day.bundle.json',
		mimeType: 'application/json',
		buffer: readFileSync(FIXTURE)
	});
	const note = page.getByTestId('export-bundle-note');
	await expect(note).toContainText(
		'through the Gate (example/stack/gated-agent in enforce) — digest verified.'
	);
	await expect(note).toHaveAttribute('data-ok', 'true');
	await expect(page.getByTestId('export-run-picker')).toContainText('The Gate');

	await page.goto('/workshop/assurance');
	await page.getByTestId('assurance-agent-picker').selectOption({ label: 'The Gate' });
	const download = page.waitForEvent('download');
	await page.getByTestId('assurance-entry-download').click();
	const html = readFileSync(await (await download).path(), 'utf8');
	expect(html).toContain(
		'Through the Gate: stack <code>example/stack/gated-agent</code> in <strong>enforce</strong> mode'
	);
});
