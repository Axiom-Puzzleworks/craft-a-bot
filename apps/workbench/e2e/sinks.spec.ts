import { expect, test, type Page } from '@playwright/test';
import { buildAndGo, skipTutorial } from './support.js';

/**
 * **Sinks** (`35-TELEMETRY.md` §6 stage B DoD, WP47): a live Workshop run
 * streams to a collector, and with the collector refusing mid-run the run
 * finishes unaffected while the sink reports its failure. The collector
 * is a Playwright route on `localhost:4318` recording every body — what a
 * collector would receive, with no container to start (`35-…` §7 D-d).
 */

const COLLECTOR = 'http://localhost:4318';

interface Collected {
	bodies: Array<{
		resourceSpans: Array<{ scopeSpans: Array<{ spans: Array<{ name: string }> }> }>;
	}>;
	refuse: boolean;
}

async function installCollector(page: Page): Promise<Collected> {
	const collected: Collected = { bodies: [], refuse: false };
	await page.route(`${COLLECTOR}/**`, async (route) => {
		const body = route.request().postDataJSON() as Collected['bodies'][number];
		collected.bodies.push(body);
		await route.fulfill({
			status: collected.refuse ? 500 : 200,
			contentType: 'application/json',
			body: '{}'
		});
	});
	return collected;
}

async function enableSink(page: Page): Promise<void> {
	await page.goto('/workshop/sinks');
	await expect(page.getByTestId('sink-telemetry/otlp-http')).toBeVisible();
	await page
		.getByTestId('sink-config-telemetry/otlp-http')
		.fill(JSON.stringify({ url: COLLECTOR, batchSize: 4, flushAfterMs: 100 }));
	await page.getByTestId('sink-enable-telemetry/otlp-http').click();
	await expect(page.getByTestId('sink-state-telemetry/otlp-http')).toContainText('enabled');
}

test.beforeEach(async ({ page }) => skipTutorial(page));

test('a live run streams to the collector as one trace, and a stored run can be sent again', async ({
	page
}) => {
	const collected = await installCollector(page);
	await enableSink(page);

	await buildAndGo(page, 'card-snack');
	await page.getByTestId('play').click();
	await expect(page.getByTestId('end-card')).toBeVisible({ timeout: 30_000 });
	await expect.poll(() => collected.bodies.length, { timeout: 10_000 }).toBeGreaterThan(0);
	const names = collected.bodies.flatMap(
		(body) => body.resourceSpans[0]?.scopeSpans[0]?.spans.map((span) => span.name) ?? []
	);
	expect(names.some((name) => name.startsWith('invoke_agent'))).toBe(true);
	expect(names).toContain('chat');

	await page.goto('/workshop/sinks');
	await expect(page.getByTestId('sink-status-telemetry/otlp-http')).toContainText('failed 0');
	const before = collected.bodies.length;
	await page.getByTestId('sink-send-telemetry/otlp-http').click();
	await expect(page.getByTestId('sink-sent-telemetry/otlp-http')).toContainText('Sent');
	expect(collected.bodies.length).toBe(before + 1);

	// The Audit Centre's "Send to…" goes to the same sink.
	await page.goto('/workshop/export');
	await expect(page.getByTestId('export-run-picker')).toBeVisible();
	await page.getByTestId('export-run-picker').selectOption({ index: 1 });
	await expect(page.getByTestId('export-run-head')).toBeVisible();
	await page.getByTestId('export-send-telemetry/otlp-http').click();
	await expect(page.getByTestId('export-sent-telemetry/otlp-http')).toContainText('Sent');
});

test('a collector that starts refusing mid-run never touches the run; the sink reports it', async ({
	page
}) => {
	const collected = await installCollector(page);
	await enableSink(page);

	await buildAndGo(page, 'card-snack');
	await page.getByTestId('step').click();
	await page.getByTestId('step').click();
	collected.refuse = true;
	await page.getByTestId('play').click();
	await expect(page.getByTestId('end-card')).toBeVisible({ timeout: 30_000 });
	await expect(page.getByTestId('end-card')).not.toHaveAttribute('data-outcome', 'ERROR');

	await page.goto('/workshop/sinks');
	await expect(page.getByTestId('sink-status-telemetry/otlp-http')).toContainText(/failed [1-9]/);
	await expect(page.getByTestId('sink-status-telemetry/otlp-http')).toContainText('500');
});
