import type { EgressMode } from '@craftabot/core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { localPackFrom, type LLMProvider, type PackRegistry } from '@craftabot/core';
import {
	packFromScenarioFile,
	parseCampaign,
	parseCampaignReport,
	renderCampaignScorecard,
	renderJUnit,
	renderSarif,
	runCampaign,
	type CampaignBrain,
	type CampaignReport
} from '@craftabot/evals';
import { summariseRun } from '@craftabot/governance/reports';
import { createRegistry, packVersions, type HarnessConfig } from '../config.js';
import { credentialVariable, type CredentialSource } from '../credentials.js';
import { runRecordFrom } from '../run-record.js';
import { buildSink, sinkById } from '../sinks.js';
import { createFileStorage } from '../storage/file-storage.js';

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
	/** Scenario pack files (WP44) registered beside the config's packs, so a campaign can name their scenarios. */
	scenarioPacks?: string[];
	onCell?: (done: number, total: number) => void;
}

export interface CampaignFileReport {
	report: CampaignReport;
	reportFile: string;
	written: string[];
	/** Every sink export that failed (WP47) — the campaign itself is unaffected. */
	sinkFailures: string[];
}

export async function runCampaignFile(options: CampaignFileOptions): Promise<CampaignFileReport> {
	const campaign = parseCampaign(JSON.parse(await readFile(options.file, 'utf8')));
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

	let writing: Promise<void> = Promise.resolve();
	const report = await runCampaign(campaign, {
		...(baseline ? { baseline } : {}),
		packVersions: versions,
		providerFor: (brain) => providerFor(brain, registry, options),
		egress: options.egress ?? 'declared',
		packs: runnerPacks,
		onCell: (_cell, done, total) => options.onCell?.(done, total),
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
				.then(() => storage.putRunSummary(summariseRun(runId, trace.events)));
		}
	});
	await writing;

	await mkdir(options.out, { recursive: true });
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
