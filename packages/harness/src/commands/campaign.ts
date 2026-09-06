import type { EgressMode, Principal } from '@craftabot/core';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
	computeTraceDigest,
	engineEventSchema,
	localPackFrom,
	type LLMProvider,
	type PackRegistry
} from '@craftabot/core';
import {
	campaignEnvelope,
	packFromScenarioFile,
	parseCampaign,
	parseCampaignReport,
	renderCampaignScorecard,
	renderJUnit,
	renderSarif,
	runCampaign,
	type CampaignBrain,
	type CampaignCell,
	type CampaignReport
} from '@craftabot/evals';
import { summariseRun } from '@craftabot/governance/reports';
import { harnessPlans } from '../plans.js';
import { createRegistry, packVersions, type HarnessConfig } from '../config.js';
import { credentialVariable, type CredentialSource } from '../credentials.js';
import { runRecordFrom } from '../run-record.js';
import { buildSink, sinkById } from '../sinks.js';
import { createFileStorage, runExists, type FileStorage } from '../storage/file-storage.js';
import { createCellPool } from './cell-pool.js';

/**
 * `craftabot campaign` (WP38 stage C, `28-CAMPAIGNS.md` §4.7): a campaign
 * file in, a report and its renderings out — and, by default, every cell's
 * run directory beside them, so a failed gate's run ids open with
 * `craftabot bundle`. The same `runCampaign` the Workshop calls; the harness
 * only adds persistence, providers and files.
 */
export interface CampaignFileOptions {
	file: string;
	out: string;
	baseline?: string;
	junit?: string;
	sarif?: string;
	markdown?: string;
	/** Persist every cell's run under `<out>/runs` — the default; a directory has no cap. */
	keepRuns?: boolean;
	config: HarnessConfig;
	credentials: CredentialSource;
	now?: () => string;
	newId?: () => string;
	fetch?: typeof globalThis.fetch;
	/** Every cell's egress mode (WP41); the CI job passes `'none'`. */
	egress?: EgressMode;
	/** Every cell's principal (WP65) — the harness's service principal. */
	principal?: Principal;
	/** Scenario pack files (WP44) registered beside the config's packs, so a campaign can name their scenarios. */
	scenarioPacks?: string[];
	onCell?: (done: number, total: number) => void;
	/** Cells in flight at once (WP68, `57-…` §4.2): above 1, a pool of workers over the harness's built `campaign-worker.js`. */
	jobs?: number;
	/** Run the `index`-th of `of` slices only; the report says so, and `craftabot merge` folds slices back. */
	shard?: { index: number; of: number };
	/** Replace the file's seeds with `a..b` — a scale run as one flag on a baseline. */
	seeds?: { from: number; to: number };
	/** The config file and content directory the CLI resolved, so a worker builds the same registry (the config object itself cannot cross to a worker). */
	configPath?: string;
	contentDir?: string;
	/**
	 * Pick up where a stopped run left off (WP68, `57-…` §4.3): a cell whose
	 * line in `<out>/cells.jsonl` names a run whose events still digest to
	 * what the line recorded is reused; every other cell runs. Needs the
	 * runs kept.
	 */
	resume?: boolean;
	/** Called after each cell with whether it was reused from a previous run (WP68). */
	onCellDone?: (done: number, total: number, reused: boolean) => void;
}

/** One line of `<out>/cells.jsonl` (WP68): which run was which cell, and the events' digest a resume verifies. */
export interface CellLine {
	ordinal: number;
	runId: string;
	digest: string;
	cell: CampaignCell;
}

/** The cells a stopped run finished and left verifiable on disk: `cells.jsonl` lines whose run's events still digest to what they recorded. */
export async function reusableCells(
	out: string,
	storage: FileStorage
): Promise<Map<number, CellLine>> {
	let text: string;
	try {
		text = await readFile(join(out, CELLS), 'utf8');
	} catch {
		return new Map();
	}
	const reusable = new Map<number, CellLine>();
	for (const line of text.split('\n')) {
		if (line.trim() === '') continue;
		let parsed: CellLine;
		try {
			parsed = JSON.parse(line) as CellLine;
		} catch {
			continue;
		}
		if (typeof parsed.ordinal !== 'number' || typeof parsed.runId !== 'string') continue;
		if (!(await runExists(storage, parsed.runId))) continue;
		const events = (await storage.getEvents(parsed.runId)).map((row) => row.event);
		if (events.length === 0) continue;
		if ((await computeTraceDigest(events)) !== parsed.digest) continue;
		reusable.set(parsed.ordinal, parsed);
	}
	return reusable;
}

const CELLS = 'cells.jsonl';

export interface CampaignFileReport {
	report: CampaignReport;
	reportFile: string;
	written: string[];
	/** Every sink export that failed (WP47) — the campaign itself is unaffected. */
	sinkFailures: string[];
}

export async function runCampaignFile(options: CampaignFileOptions): Promise<CampaignFileReport> {
	const fromFile = JSON.parse(await readFile(options.file, 'utf8')) as Record<string, unknown>;
	if (options.seeds) {
		const { from, to } = options.seeds;
		if (!Number.isInteger(from) || !Number.isInteger(to) || to < from) {
			throw new Error(`--seeds wants a range a-b with a ≤ b, got ${from}-${to}`);
		}
		fromFile['seeds'] = Array.from({ length: to - from + 1 }, (_, index) => from + index);
	}
	const campaign = parseCampaign(fromFile);
	const baseline =
		options.baseline === undefined
			? undefined
			: parseCampaignReport(JSON.parse(await readFile(options.baseline, 'utf8')));
	const scenarioPacks = await Promise.all(
		(options.scenarioPacks ?? []).map(async (path) =>
			packFromScenarioFile(JSON.parse(await readFile(path, 'utf8')))
		)
	);
	const packs = [...options.config.packs, ...scenarioPacks];
	const content = options.config.content;
	const registry = createRegistry({ packs, ...(content ? { content } : {}) });
	// The runner registers what it is handed and skips what it already has: the local pack rides along (WP46).
	const runnerPacks = content ? [...packs, localPackFrom(content)] : packs;
	const now = options.now ?? (() => new Date().toISOString());
	const versions = packVersions(options.config);
	const keepRuns = options.keepRuns ?? true;
	const storage = keepRuns ? await createFileStorage(join(options.out, 'runs')) : undefined;
	if (options.resume && !storage) {
		throw new Error('--resume needs the runs kept: drop --no-keep-runs');
	}
	const reusable =
		options.resume && storage ? await reusableCells(options.out, storage) : new Map();
	await mkdir(options.out, { recursive: true });

	// The file's sinks (WP47): every cell's finished trace goes to each, built once behind their guards.
	const sinks = campaign.sinks.map((entry) => {
		const sink = sinkById(entry.id);
		return buildSink({
			sink,
			config: sink.configSchema.parse(entry.config ?? {}),
			credentials: options.credentials,
			...(options.fetch ? { fetch: options.fetch } : {}),
			...(options.egress ? { egress: options.egress } : {})
		});
	});
	const sinkFailures: string[] = [];

	// The `--jobs` pool (WP68): workers compute, this thread writes.
	const jobs = Math.max(1, Math.floor(options.jobs ?? 1));
	const pool =
		jobs > 1
			? await createCellPool(jobs, {
					campaign: fromFile,
					...(options.configPath !== undefined ? { configPath: options.configPath } : {}),
					...(options.contentDir !== undefined ? { contentDir: options.contentDir } : {}),
					scenarioPacks: options.scenarioPacks ?? [],
					egress: options.egress ?? 'declared',
					...(options.principal ? { principal: options.principal } : {})
				})
			: undefined;

	let writing: Promise<void> = Promise.resolve();
	const reusedOrdinals = new Set<number>();
	let report: CampaignReport;
	try {
		report = await runCampaign(campaign, {
			...(baseline ? { baseline } : {}),
			// Reuse what a stopped run finished (WP68), then the pool or the runner's own way.
			execute: (spec, run) => {
				const kept = reusable.get(spec.ordinal);
				if (kept) {
					reusedOrdinals.add(spec.ordinal);
					return Promise.resolve({ cell: kept.cell });
				}
				return pool ? pool.execute(spec) : run();
			},
			...(pool ? { concurrency: jobs } : {}),
			...(options.shard ? { shard: options.shard } : {}),
			packVersions: versions,
			providerFor: (brain) => providerFor(brain, registry, options),
			egress: options.egress ?? 'declared',
			...(options.principal ? { principal: options.principal } : {}),
			packs: runnerPacks,
			plans: harnessPlans,
			// A hosted evaluator's battery (WP51): from the environment, live only under the file's own `budget`.
			credentials: (id) => options.credentials.get(id),
			...(options.fetch ? { fetch: options.fetch } : {}),
			onCell: (cell, done, total) => {
				options.onCell?.(done, total);
				options.onCellDone?.(
					done,
					total,
					cell.ordinal !== undefined && reusedOrdinals.has(cell.ordinal)
				);
			},
			...(options.now ? { now: options.now } : {}),
			...(options.newId ? { newId: options.newId } : {}),
			onTrace: (cell, trace) => {
				if (cell.runId === undefined) return;
				if (sinks.length > 0) {
					const exported = runRecordFrom({
						runId: cell.runId,
						spec: trace.spec,
						events: trace.events,
						packVersions: versions,
						startedAt: now(),
						finishedAt: now(),
						...(cell.outcome !== undefined ? { outcome: cell.outcome } : {})
					});
					for (const sink of sinks) {
						writing = writing.then(async () => {
							const result = await sink.export({ run: exported, events: trace.events });
							if (!result.ok) sinkFailures.push(result.error);
						});
					}
				}
				if (!storage) return;
				const runId = cell.runId;
				const stamp = now();
				const run = runRecordFrom({
					runId,
					spec: trace.spec,
					events: trace.events,
					packVersions: versions,
					startedAt: stamp,
					finishedAt: stamp,
					...(cell.outcome !== undefined ? { outcome: cell.outcome } : {})
				});
				writing = writing
					.then(() => storage.putRun(run))
					.then(() => storage.appendEvents(runId, trace.events))
					.then(() => storage.putRunSummary(summariseRun(runId, trace.events)))
					// Which run was which cell (WP68): the line a resume reads and verifies.
					.then(async () => {
						if (cell.ordinal === undefined) return;
						const line: CellLine = {
							ordinal: cell.ordinal,
							runId,
							// Over the events as the store will read them back (`12-…` D21): parsed, keys in schema order.
							digest: await computeTraceDigest(engineEventSchema.array().parse(trace.events)),
							cell
						};
						await appendFile(join(options.out, CELLS), `${JSON.stringify(line)}\n`, 'utf8');
					});
			}
		});
	} catch (error) {
		// Whatever stopped the run, what was written stays whole and the pool is let go; the stop is the error.
		await writing.catch(() => undefined);
		await pool?.close();
		throw error;
	}
	// A write that failed is a failure of the campaign: never swallowed.
	await writing;
	await pool?.close();

	await mkdir(options.out, { recursive: true });
	// The report is filed beside the runs (WP49) so `craftabot report --safety-case` can quote it, as the Workshop does.
	if (storage) await storage.putCampaignReport(campaignEnvelope(report));
	const reportFile = join(options.out, `${report.id}.campaign-report.json`);
	const written: string[] = [reportFile];
	await writeFile(reportFile, `${JSON.stringify(report, null, '\t')}\n`, 'utf8');

	const renderings: Array<[string | undefined, () => string]> = [
		[options.markdown, () => renderCampaignScorecard(report)],
		[options.junit, () => renderJUnit(report)],
		[
			options.sarif,
			() =>
				`${JSON.stringify(renderSarif(report, { campaignUri: options.file.replace(/\\/g, '/') }), null, '\t')}\n`
		]
	];
	for (const [path, render] of renderings) {
		if (path === undefined) continue;
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, render(), 'utf8');
		written.push(path);
	}

	return { report, reportFile, written, sinkFailures };
}

function providerFor(
	brain: CampaignBrain,
	registry: PackRegistry,
	options: CampaignFileOptions
): LLMProvider {
	if (brain.cartridgeId === undefined) {
		throw new Error(`live brain '${brain.id}' names no cartridgeId`);
	}
	const cartridge = registry.getCartridge(brain.cartridgeId);
	if (!cartridge)
		throw new Error(`live brain '${brain.id}': no cartridge '${brain.cartridgeId}' is installed`);
	const factory = registry.getProviderFactory(cartridge.providerId);
	if (!factory)
		throw new Error(`live brain '${brain.id}': no provider '${cartridge.providerId}' is installed`);
	let apiKey = '';
	if (factory.keyRequirement === 'required') {
		const key = options.credentials.get(factory.id);
		if (key === undefined) {
			throw new Error(`provider ${factory.id} needs a key: set ${credentialVariable(factory.id)}`);
		}
		apiKey = key;
	}
	return factory.create({ apiKey, ...(options.fetch ? { fetch: options.fetch } : {}) });
}
