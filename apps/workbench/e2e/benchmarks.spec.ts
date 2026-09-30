import { expect, test } from '@playwright/test';

/**
 * **Benchmarks** (WP123, `106-BENCHMARK.md` §6): the page says *synthetic
 * rows* first; the reference benchmark runs over the stand-ins in the
 * browser, the keyword baseline measured and every stand-in unmeasured, the
 * policy decision point not applicable; the Matrix has its twin; the Guard
 * Rack reads *unmeasured* for a service no benchmark has measured.
 */
test('the benchmark over the stand-ins, and the Rack reading unmeasured', async ({ page }) => {
	await page.goto('/workshop/benchmarks');
	const synthetic = page.getByTestId('benchmark-synthetic');
	await expect(synthetic).toContainText('Synthetic rows.');
	await expect(page.getByTestId('benchmark-empty')).toBeVisible();

	await page.getByTestId('benchmark-run').click();
	const table = page.getByTestId('benchmark-table');
	await expect(table).toBeVisible();
	await expect(page.getByTestId('benchmark-row-fs-bank-reader-attack-words')).toContainText(
		'local'
	);
	await expect(page.getByTestId('benchmark-row-fs-bank-reader-attack-words')).toContainText('26%');
	await expect(page.getByTestId('benchmark-row-geap-model-armor')).toContainText(
		'stand-in — unmeasured'
	);
	await expect(page.getByTestId('benchmark-row-pdp-opa-opa')).toContainText('not applicable');
	await expect(page.getByTestId('benchmark-twin')).toContainText(
		'fs-bank/reader/attack-words flagged steer'
	);
	// The page's first words are the synthetic caveat, before any number.
	const first = await page.getByTestId('benchmarks-page').locator('p').first().textContent();
	expect(first).toContain('Synthetic rows.');

	await page.goto('/workshop/studio?tab=connections');
	await expect(page.getByTestId('guard-benchmark-geap/model-armor')).toContainText('unmeasured');
	await expect(
		page.getByTestId('guard-benchmark-azure-content-safety/content-safety')
	).toContainText('unmeasured');
});
