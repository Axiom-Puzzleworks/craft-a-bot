import {
	CASSETTE_FORMAT_VERSION,
	containsSecret,
	mergeProviderEntries,
	parseProviderCassette,
	redactSecrets,
	type EgressDeclaration,
	type EgressMode,
	type ProviderCassetteEntry,
	type ProviderCassetteFile
} from '@craftabot/core';
import { expandExperiment, parseExperiment } from '@craftabot/evals';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createRegistry, type HarnessConfig } from '../config.js';
import type { CredentialSource } from '../credentials.js';
import { runCampaignFile } from './campaign.js';
import { withPopulationSize } from './experiment.js';

/**
 * **`craftabot record --experiment <file> --provider <id|mock>`** (WP114,
 * `103-FALLIBLE-ACTORS.md` §4; `100-…` §6.1): the one path that runs a live
 * brain over a design and keeps what the provider said. Every campaign the
 * design expands to runs as `campaign` runs one; every brain that names a
 * `cassette` runs live instead — through its cartridge's provider, whose id
 * must be `--provider`, under the session's declared egress and the file's
 * own budget — and each cell's calls are recorded. Each cassette path gets
 * one file: the cells' entries merged first-answer-wins, redacted against
 * every secret the process holds (a key that survives is a refusal, and
 * nothing is written). `--provider mock` records the scripted-optimal plans
 * instead — no key, no network — which is what the tests and a dry run use.
 */
export interface RecordExperimentOptions {
	file: string;
	/** A provider id every cassette brain's cartridge must name, or `mock`. */
	provider: string;
	/** Where the expanded campaigns and their runs go while recording. */
	out: string;
	config: HarnessConfig;
	credentials: CredentialSource;
	/** A shape run: the design's book population at this size. */
	size?: number;
	/** Cells at once, in this process: a local provider (the Sparks) serves them concurrently. Absent, one at a time. */
	concurrency?: number;
	egress?: EgressMode;
	now?: () => string;
	newId?: () => string;
	/** Milliseconds, for each call's latency; the wall clock by default. */
	clock?: () => number;
}

export interface RecordExperimentReport {
	experimentId: string;
	campaigns: number;
	cells: number;
	cassettes: Array<{ path: string; entries: number; conflicts: number }>;
}

export async function recordExperiment(
	options: RecordExperimentOptions
): Promise<RecordExperimentReport> {
	const designed = parseExperiment(JSON.parse(await readFile(options.file, 'utf8')));
	const { experiment, campaigns } = expandExperiment(
		options.size !== undefined ? withPopulationSize(designed, options.size) : designed
	);
	const mode = options.provider === 'mock' ? 'mock' : 'live';
	const registry = createRegistry(options.config);
	// Every cassette brain's cartridge must be the provider asked for: a recording never quietly calls another.
	const cassetteBrains = experiment.design.template.brains.filter(
		(brain) => brain.cassette !== undefined
	);
	if (cassetteBrains.length === 0)
		throw new Error(
			`${experiment.id} has no brain that names a cassette — give a live brain "cassette": "<path>" to record into`
		);
	let egress: EgressDeclaration[] = [];
	if (mode === 'live') {
		for (const brain of cassetteBrains) {
			const cartridge =
				brain.cartridgeId !== undefined ? registry.getCartridge(brain.cartridgeId) : undefined;
			if (!cartridge || cartridge.providerId !== options.provider)
				throw new Error(
					`brain '${brain.id}' records through ${cartridge ? `'${cartridge.providerId}'` : 'no installed cartridge'}, not '${options.provider}'`
				);
			egress = registry.getProviderFactory(options.provider)?.egress ?? [];
		}
	}

	const recordings = new Map<string, ProviderCassetteEntry[][]>();
	await mkdir(options.out, { recursive: true });
	let cells = 0;
	for (const campaign of campaigns) {
		const campaignFile = join(options.out, `${campaign.id}.campaign.json`);
		await writeFile(campaignFile, `${JSON.stringify(campaign, null, '\t')}\n`, 'utf8');
		const ran = await runCampaignFile({
			file: campaignFile,
			out: join(options.out, campaign.id),
			config: options.config,
			credentials: options.credentials,
			...(options.concurrency !== undefined ? { concurrency: options.concurrency } : {}),
			record: {
				provider: mode,
				recordings,
				clock: options.clock ?? (() => Date.now())
			},
			...(options.egress !== undefined ? { egress: options.egress } : {}),
			...(options.now ? { now: options.now } : {}),
			...(options.newId ? { newId: options.newId } : {})
		});
		cells += ran.report.cells.length;
	}

	const recordedAt = (options.now ?? (() => new Date().toISOString()))();
	const written: RecordExperimentReport['cassettes'] = [];
	for (const [path, runs] of recordings) {
		const merged = mergeProviderEntries(runs);
		const cassette: ProviderCassetteFile = redactSecrets(
			{
				format: 'craftabot-cassette',
				formatVersion: CASSETTE_FORMAT_VERSION,
				kind: 'provider',
				providerId: mode === 'mock' ? 'mock' : options.provider,
				recordedAt,
				recordedBy: 'craftabot-harness/0.0.1',
				note:
					mode === 'mock'
						? `${experiment.id}: recorded from the mock provider (the scripted-optimal plans), ${cells} cells — a stand-in, not a live model`
						: `${experiment.id}: recorded live through ${options.provider}, ${cells} cells${options.size !== undefined ? `, the population at ${options.size}` : ''}`,
				egress: mode === 'mock' ? [] : egress,
				entries: merged.entries
			},
			options.credentials.secrets()
		);
		if (containsSecret(cassette, options.credentials.secrets())) {
			throw new Error(
				`a recorded response carries a credential — nothing was written for ${path}; a provider must never echo its key`
			);
		}
		parseProviderCassette(cassette);
		const absolute = resolve(path);
		await mkdir(dirname(absolute), { recursive: true });
		await writeFile(absolute, `${JSON.stringify(cassette, null, '\t')}\n`, 'utf8');
		written.push({ path, entries: merged.entries.length, conflicts: merged.conflicts });
	}
	return { experimentId: experiment.id, campaigns: campaigns.length, cells, cassettes: written };
}
