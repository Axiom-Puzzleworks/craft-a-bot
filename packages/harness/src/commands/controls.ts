import { GATE_CONTENT } from '@craftabot/gate/presets';
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	reviewsFromContent,
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
	type InventoryCampaignReport
} from '@craftabot/governance/reports';
import { createRegistry } from '../config.js';

/**
 * **`craftabot controls list | export`** (WP134, `110-CONTROL-SUITE-PLAN.md`
 * §4.3): the Control Inventory from the host's side — the same fold
 * `/workshop/controls` renders. The controls are the installed packs'; what
 * fitted them is the shipped campaigns and the experiment files; with
 * `--store`, what fired, the register and the benchmarks come from a run
 * store, and the readings from it and the content directory.
 */
export interface ControlsOptions {
	packs: readonly PackManifest[];
	content?: readonly ContentRecord[];
	storage?: Storage;
	/** The reference experiments' directory (`experiments` by default), read when it exists. */
	experimentsDir?: string;
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
	const [summaries, stored, results, benchmarks] = storage
		? await Promise.all([
				storage.listRunSummaries(),
				storage.listCampaignReports(),
				storage.listExperimentResults(),
				storage.listBenchmarkReports()
			])
		: [[], [], [], []];
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
		register: controlEffectiveness(results, registry.listControlMaps()),
		benchmarks,
		reviews: reviewsFromContent(records),
		errorModels: sources.errorModels ?? [],
		reviewerModels: sources.reviewerModels ?? []
	});
	return controlInventoryExport(rows, options.generatedAt);
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
