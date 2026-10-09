import { GATE_CONTENT } from '@craftabot/gate/presets';
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	parseExperimentResult,
	reviewsFromContent,
	type ExperimentResult,
	type ContentRecord,
	type PackManifest,
	type Storage
} from '@craftabot/core';
import { GUARDRAIL_CATALOGUE } from '@craftabot/governance';
import {
	controlEffectiveness,
	controlInventory,
	controlInventoryExport,
	INVENTORY_KIND_LABELS,
	readingSourcesFrom,
	renderControlInventoryMarkdown,
	type ControlInventoryExport,
	type InventoryCampaignReport,
	type LiveRunSource
} from '@craftabot/governance/reports';
import { createRegistry } from '../config.js';

/**
 * **`craftabot controls list | export`** (WP134, `110-CONTROL-SUITE-PLAN.md`
 * §4.3): the Control Inventory from the host's side — the same fold
 * `/workshop/controls` renders. The controls are the installed packs'; what
 * fitted them is the shipped campaigns and the experiment files; with
 * `--store`, what fired, the register and the benchmarks come from a run
 * store, and the readings from it and the content directory. The register
 * reads the committed reference results under `docs/evidence/` too (WP150),
 * so the Effect column fills without a store.
 */
export interface ControlsOptions {
	packs: readonly PackManifest[];
	content?: readonly ContentRecord[];
	storage?: Storage;
	/** The reference experiments' directory (`experiments` by default), read when it exists. */
	experimentsDir?: string;
	/** The committed reference results' directory (`docs/evidence` by default), read when it exists (WP150). */
	evidenceDir?: string;
	generatedAt: string;
}

export async function controlsFor(options: ControlsOptions): Promise<ControlInventoryExport> {
	// The Gate's presets beside the packs (2026-10-02): what the Gate fits reads *fitted*, as the Workbench's page has it.
	const registry = createRegistry({
		packs: options.packs.some((pack) => pack.id === GATE_CONTENT.id)
			? [...options.packs]
			: [...options.packs, GATE_CONTENT]
	});
	const campaigns: Array<{ id: string; campaign: unknown; kind?: 'campaign' | 'experiment' }> =
		options.packs.flatMap((pack) =>
			(pack.campaigns ?? []).map((shipped) => ({ id: shipped.id, campaign: shipped.campaign() }))
		);
	const dir = options.experimentsDir ?? 'experiments';
	if (existsSync(dir))
		for (const name of (await readdir(dir)).filter((file) => file.endsWith('.json')).sort())
			campaigns.push({
				id: name.replace(/\.json$/, ''),
				kind: 'experiment',
				campaign: JSON.parse(await readFile(join(dir, name), 'utf8')) as unknown
			});
	const records: ContentRecord[] = [...(options.content ?? [])];
	const storage = options.storage;
	if (storage)
		records.push(
			...(await storage.listContent('review')),
			...(await storage.listContent('control-review'))
		);
	const [summaries, stored, storedResults, benchmarks] = storage
		? await Promise.all([
				storage.listRunSummaries(),
				storage.listCampaignReports(),
				storage.listExperimentResults(),
				storage.listBenchmarkReports()
			])
		: [[], [], [], []];
	const evidenceDir = options.evidenceDir ?? join('docs', 'evidence');
	// WP196: the live suites' recordings (`live/`, `live-35b/`), with their models and cells, read as the register's live column.
	const live = await liveRecordings(evidenceDir);
	const results = [
		...storedResults,
		...[...(await committedResults(evidenceDir)), ...live.results].filter(
			(result) => !storedResults.some((each) => each.id === result.id)
		)
	];
	const campaignReports: InventoryCampaignReport[] = stored.flatMap((each) => {
		const cells = (each.report as { cells?: unknown }).cells;
		return Array.isArray(cells) ? [{ cells: cells as InventoryCampaignReport['cells'] }] : [];
	});
	const sources = readingSourcesFrom(options.packs, {});
	const rows = controlInventory({
		registry,
		catalogue: GUARDRAIL_CATALOGUE,
		campaigns,
		summaries,
		campaignReports,
		register: controlEffectiveness(results, registry.listControlMaps(), { liveRuns: live.runs }),
		benchmarks,
		reviews: reviewsFromContent(records),
		errorModels: sources.errorModels ?? [],
		reviewerModels: sources.reviewerModels ?? []
	});
	return controlInventoryExport(rows, options.generatedAt);
}

/** The committed reference results: `<dir>/<experiment>/<experiment>.experiment-result.json`, each held to its digest. */
export async function committedResults(dir: string): Promise<ExperimentResult[]> {
	if (!existsSync(dir)) return [];
	const results: ExperimentResult[] = [];
	for (const entry of (await readdir(dir, { withFileTypes: true })).filter((each) =>
		each.isDirectory()
	)) {
		const file = join(dir, entry.name, `${entry.name}.experiment-result.json`);
		if (existsSync(file))
			results.push(parseExperimentResult(JSON.parse(await readFile(file, 'utf8')) as unknown));
	}
	return results.sort((a, b) => a.experimentId.localeCompare(b.experimentId));
}

/** The directories under `docs/evidence/` that hold a live suite: each design's folder inside, with a `timings.json` naming the model. */
export const LIVE_SUITE_DIRS = ['live', 'live-35b', 'live-oversight'] as const;

/** Retired live designs (`scripts/live-check.mjs`'s `RETIRED`): their evidence stays on disk, but they are not the suite the register reads. */
const RETIRED_LIVE_DESIGNS = new Set(['lending-stack-live-b']);

/**
 * **The live recordings** (WP196, `114-DECISIONS-UNDER-PRESSURE-PLAN.md`): each design of each live suite — its result, held to its
 * digest, with the model and day from the suite's `timings.json` and the cells of the run. A design with no timing (a retired one)
 * is left out: its evidence stays on disk as the record of what it was, but it is not the suite.
 */
export async function liveRecordings(
	dir: string
): Promise<{ results: ExperimentResult[]; runs: LiveRunSource[] }> {
	const results: ExperimentResult[] = [];
	const runs: LiveRunSource[] = [];
	for (const suite of LIVE_SUITE_DIRS) {
		const timingsFile = join(dir, suite, 'timings.json');
		if (!existsSync(timingsFile)) continue;
		const timings = JSON.parse(await readFile(timingsFile, 'utf8')) as Record<
			string,
			{ recordedOn?: string; model?: string; cartridge?: string; wallSeconds?: number }
		>;
		for (const [id, timing] of Object.entries(timings).sort(([a], [b]) => a.localeCompare(b))) {
			const file = join(dir, suite, id, `${id}.experiment-result.json`);
			if (!existsSync(file) || timing.model === undefined || RETIRED_LIVE_DESIGNS.has(id)) continue;
			const result = parseExperimentResult(JSON.parse(await readFile(file, 'utf8')) as unknown);
			const cellsFile = join(dir, suite, id, 'cells.json');
			const cells = existsSync(cellsFile)
				? (JSON.parse(await readFile(cellsFile, 'utf8')) as Array<{
						campaign: string;
						outcome: string;
					}>)
				: undefined;
			results.push(result);
			runs.push({
				resultId: result.id,
				model: timing.model,
				...(timing.cartridge ? { cartridge: timing.cartridge } : {}),
				...(timing.recordedOn ? { recordedOn: timing.recordedOn } : {}),
				...(timing.wallSeconds !== undefined ? { wallSeconds: timing.wallSeconds } : {}),
				...(cells ? { cells: cells.map(({ campaign, outcome }) => ({ campaign, outcome })) } : {})
			});
		}
	}
	return { results, runs };
}

export async function writeControls(
	file: ControlInventoryExport,
	format: 'json' | 'markdown',
	out?: string
): Promise<string> {
	const text =
		format === 'markdown'
			? renderControlInventoryMarkdown(file)
			: `${JSON.stringify(file, null, '\t')}\n`;
	if (out) await writeFile(out, text, 'utf8');
	return text;
}

/** One line per kind, for the terminal: how many, and each facet's headline. */
export function renderControlsSummary(file: ControlInventoryExport): string {
	const { summary } = file;
	const kinds = [...new Set(file.rows.map((row) => row.kind))];
	return `${[
		`controls: ${summary.rows} — ${summary.uncatalogued} uncatalogued, ${summary.unfitted} unfitted, ${summary.fired} fired, ${summary.measured} measured, ${summary.evidenced} evidenced, ${summary.unread} unread`,
		...kinds.map((kind) => {
			const rows = file.rows.filter((row) => row.kind === kind);
			const unfitted = rows.filter((row) => row.fitted.state === 'unfitted').length;
			const uncatalogued = rows.filter((row) => row.coverage === 'uncatalogued').length;
			return `  ${INVENTORY_KIND_LABELS[kind].padEnd(16)} ${String(rows.length).padStart(4)}${uncatalogued ? `  ${uncatalogued} uncatalogued` : ''}${unfitted ? `  ${unfitted} unfitted` : ''}`;
		})
	].join('\n')}\n`;
}
