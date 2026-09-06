import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { buildReadyBot, skipTutorial } from './support.js';

/**
 * **Axe over every Workshop route** (`60-CONTROL-ROOM-V2.md` §4.3, WP71;
 * `42-…` row's "axe green on every Workshop route"). The Kit's audit
 * (`a11y.spec.ts`) is unchanged; this one seeds the corpus the Workshop's
 * screens read — a bot on the shelf, the say-hello golden trace imported as
 * a stored run — opens the Workshop door, and audits each route to WCAG 2.1
 * A and AA, the standard `01-…` §8 commits to.
 */

const STANDARD = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
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
) as Array<{ runId: string }>;
const goldenRunId = golden[0]?.runId ?? '';

async function audit(page: Page): Promise<string> {
	const { violations } = await new AxeBuilder({ page }).withTags(STANDARD).analyze();
	return violations
		.map(
			(v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.map((n) => n.target).join('\n    ')}`
		)
		.join('\n');
}

/** The corpus: the Workshop door open, one bot built, the golden run imported. */
async function seed(page: Page): Promise<string> {
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
	const agentId = await buildReadyBot(page, 'card-snack');
	await page.goto('/workshop/runs');
	await page.getByTestId('import-trace').setInputFiles({
		name: 'say-hello.jsonl',
		mimeType: 'application/x-ndjson',
		buffer: Buffer.from(golden.map((event) => JSON.stringify(event)).join('\n') + '\n', 'utf8')
	});
	await expect(page.getByTestId('import-note')).toContainText('caught up');
	return agentId;
}

test.beforeEach(async ({ page }) => skipTutorial(page));

test('every Workshop route has no accessibility violations', async ({ page }) => {
	test.setTimeout(180_000);
	const agentId = await seed(page);
	const routes = [
		'/workshop',
		'/workshop/runs',
		`/workshop/runs/${goldenRunId}`,
		`/workshop/spec/${agentId}`,
		'/workshop/evals',
		'/workshop/campaigns',
		'/workshop/evaluators',
		`/workshop/evaluators?run=${goldenRunId}`,
		'/workshop/scenarios',
		'/workshop/sinks',
		'/workshop/evidence',
		'/workshop/playground',
		'/workshop/playground/advice',
		'/workshop/playground/fraud',
		'/workshop/playground/lending',
		'/workshop/policies',
		'/workshop/bench',
		'/workshop/telemetry',
		'/workshop/incidents',
		'/workshop/safety-case',
		`/workshop/safety-case?agent=${agentId}`,
		`/workshop/assurance?agent=${agentId}`,
		`/workshop/export?run=${goldenRunId}`,
		`/workshop/compare?a=${goldenRunId}&b=${goldenRunId}`,
		'/workshop/guards'
	];
	const failures: string[] = [];
	for (const route of routes) {
		await page.goto(route);
		await expect(page.getByTestId('workshop')).toBeVisible();
		// Let the stores settle: every Workshop screen reads IndexedDB after mount.
		await page.waitForTimeout(300);
		const report = await audit(page);
		if (report !== '') failures.push(`${route}\n${report}`);
	}
	expect(failures.join('\n\n')).toBe('');
});
