import { expect, test, type Page } from '@playwright/test';
import { awaitRunSaved, buildAndGo, skipTutorial } from './support.js';

/**
 * **The evidence store in the Workshop** (`58-EVIDENCE-STORE.md` §4.5, §11
 * items 4–5, WP70): with no store configured, the Audit Centre shows no push
 * control; with the Supabase store configured and a token fitted, a run
 * pushed from the Audit Centre lands in the project as a bundle row, the
 * Evidence page pulls it back verified and imports it, and a row tampered
 * in the project is listed with a digest mismatch and cannot be imported.
 * The project is a Playwright route standing in for PostgREST — what the
 * project would receive and answer, with nothing to provision; the token
 * never appears in a URL.
 */

const PROJECT = 'https://planted-ref.supabase.co';
const ANON = 'sb_publishable_e2e_anon_0123456789';
const TOKEN = 'e2e-workspace-token-0123456789';

interface Row {
	workspace: string;
	id: string;
	digest: string;
	pushed_at: string;
	pushed_by: string | null;
	payload: unknown;
}

async function installProject(page: Page): Promise<{ tables: Map<string, Row[]>; urls: string[] }> {
	const tables = new Map<string, Row[]>();
	const urls: string[] = [];
	await page.route(`${PROJECT}/**`, async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		urls.push(url.toString());
		const headers = request.headers();
		if (headers['apikey'] !== ANON || headers['authorization'] !== `Bearer ${TOKEN}`) {
			await route.fulfill({
				status: 401,
				contentType: 'application/json',
				body: '{"message":"invalid JWT"}'
			});
			return;
		}
		const table = url.pathname.replace('/rest/v1/', '');
		const rows = tables.get(table) ?? [];
		tables.set(table, rows);
		if (request.method() === 'POST') {
			for (const row of request.postDataJSON() as Row[]) {
				const at = rows.findIndex((held) => held.id === row.id);
				if (at >= 0) rows[at] = row;
				else rows.push(row);
			}
			await route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
			return;
		}
		let out = rows.filter((row) => row.workspace === 'e2e');
		const id = url.searchParams.get('id');
		if (id) out = out.filter((row) => `eq.${row.id}` === id);
		const select = url.searchParams.get('select')?.split(',') ?? [];
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(
				out.map((row) =>
					Object.fromEntries(
						select.map((field) => [field, (row as unknown as Record<string, unknown>)[field]])
					)
				)
			)
		});
	});
	return { tables, urls };
}

async function openWorkshop(page: Page): Promise<void> {
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
}

/** A real run to push: the snack bot played to its end card (the sinks spec's own way). */
async function playARun(page: Page): Promise<string> {
	await buildAndGo(page, 'card-snack');
	await page.getByTestId('play').click();
	await expect(page.getByTestId('end-card')).toBeVisible({ timeout: 30_000 });
	await awaitRunSaved(page);
	await page.goto('/workshop/runs');
	const row = page.getByTestId(/^run-row-/).first();
	await expect(row).toBeVisible();
	return ((await row.getAttribute('data-testid')) ?? '').replace('run-row-', '');
}

async function configureStore(page: Page): Promise<void> {
	await page.goto('/workshop/evidence');
	await expect(page.getByTestId('evidence-unconfigured')).toBeVisible();
	await page
		.getByTestId('evidence-config-evidence/supabase')
		.fill(JSON.stringify({ url: PROJECT, anonKey: ANON, workspace: 'e2e' }));
	await page.getByTestId('evidence-save-evidence/supabase').click();
	await expect(page.getByTestId('evidence-state-evidence/supabase')).toHaveText('configured');
	await page.getByTestId('evidence-token-input-evidence/supabase').fill(TOKEN);
	await page.getByTestId('evidence-fit-evidence/supabase').click();
	await expect(page.getByTestId('evidence-token-evidence/supabase')).toContainText('fitted');
	await expect(page.getByTestId('evidence-push')).toBeVisible();
}

test.beforeEach(async ({ page }) => skipTutorial(page));

test('unconfigured, nothing offers a push; configured, a run pushed from the Audit Centre pulls back verified and imports', async ({
	page
}) => {
	const project = await installProject(page);
	await openWorkshop(page);
	const runId = await playARun(page);

	// Nothing requires the store (§11 item 5).
	await page.goto(`/workshop/export?run=${runId}`);
	await expect(page.getByTestId('export-download-bundle')).toBeVisible();
	await expect(page.getByTestId('export-push-evidence/supabase')).toHaveCount(0);

	await configureStore(page);

	// Push from the Audit Centre.
	await page.goto(`/workshop/export?run=${runId}`);
	await page.getByTestId('export-push-evidence/supabase').click();
	await expect(page.getByTestId('export-pushed-evidence/supabase')).toContainText(
		'Pushed — digest'
	);
	const bundles = project.tables.get('evidence_bundles') ?? [];
	expect(bundles).toHaveLength(1);
	expect(bundles[0]?.id).toBe(runId);
	expect(bundles[0]?.workspace).toBe('e2e');
	for (const url of project.urls) {
		expect(url).not.toContain(TOKEN);
		expect(url).not.toContain(ANON);
	}

	// Pulled back and imported over the run's events (the second-machine proof over a route).
	await page.goto('/workshop/evidence');
	await page.getByTestId('evidence-pull-go').click();
	await expect(page.getByTestId('evidence-pull-note')).toContainText('every digest verified');
	await expect(page.getByTestId(`evidence-verified-bundle-${runId}`)).toContainText('verified');
	await page.getByTestId(`evidence-import-bundle-${runId}`).click();
	await expect(page.getByTestId(`evidence-import-note-bundle-${runId}`)).toContainText(
		'Imported 1 run'
	);
	await page.goto('/workshop/runs');
	await expect(page.getByTestId(`run-row-${runId}`)).toBeVisible();

	// A row tampered in the project is refused.
	const held = bundles[0] as Row;
	held.payload = { ...(held.payload as object), exportedBy: 'someone else' };
	await page.goto('/workshop/evidence');
	await page.getByTestId('evidence-pull-go').click();
	await expect(page.getByTestId('evidence-pull-note')).toContainText('1 refused');
	await expect(page.getByTestId(`evidence-verified-bundle-${runId}`)).toContainText('mismatch');
	await expect(page.getByTestId(`evidence-import-bundle-${runId}`)).toBeDisabled();
});

test('a store that answers 401 reports it on the page, and the token stays out of the note', async ({
	page
}) => {
	await page.route(`${PROJECT}/**`, (route) =>
		route.fulfill({
			status: 401,
			contentType: 'application/json',
			body: '{"message":"JWT expired"}'
		})
	);
	await openWorkshop(page);
	const runId = await playARun(page);
	await configureStore(page);
	await page.getByTestId('evidence-push-id').selectOption(runId);
	await page.getByTestId('evidence-push-go').click();
	await expect(page.getByTestId('evidence-push-note')).toContainText('answered 401: JWT expired');
	await expect(page.getByTestId('evidence-push-note')).not.toContainText(TOKEN);
});
