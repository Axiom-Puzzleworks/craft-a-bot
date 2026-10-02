import {
	CASSETTE_FORMAT_VERSION,
	createCassetteProvider,
	parseProviderCassette,
	recordingProvider,
	type BenchmarkReport,
	type GuardrailService,
	type LLMProvider,
	type PackRegistry,
	type ProviderCassetteEntry,
	type ProviderCassetteFile,
	type Reader,
	type Storage
} from '@craftabot/core';
import {
	BENCHMARK_CASSETTE_KIND,
	benchmarkCassetteSchema,
	cassetteFetch,
	parseBenchmark,
	recordingFetch,
	renderBenchmarkMarkdown,
	runBenchmark,
	type BenchmarkCassette,
	type BenchmarkClient
} from '@craftabot/evals';
import { ATTACK_QUESTION, GUARD_QUESTION_SET_ID } from '@craftabot/pack-fs-bank';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CredentialSource } from '../credentials.js';

/**
 * **`craftabot benchmark run`** (WP123, `106-BENCHMARK.md` §6): a benchmark
 * file over the registry's adversarial corpora. Each guard service answers
 * from its cassette under `--cassettes` when there is one, and from its
 * offline stand-in when there is not; `--record` calls each service live with
 * its credential from the environment and writes its cassette — the only
 * path that sends a row anywhere. Readers answer the guard question set's
 * noul. The report goes to `--out` as JSON and markdown, and to a store when
 * one is named.
 */
export const DEFAULT_BENCHMARK_CASSETTES = 'benchmarks/cassettes';

export function cassetteFileFor(dir: string, subjectId: string): string {
	return join(dir, `${subjectId.replace(/\//g, '--')}.benchmark-cassette.json`);
}

/** An LLM reader's provider cassette (WP143): what its model answered to every row, keyed by prompt. */
export function readerCassetteFileFor(dir: string, readerId: string): string {
	return join(dir, `${readerId.replace(/\//g, '--')}.provider-cassette.json`);
}

async function readProviderCassette(path: string): Promise<ProviderCassetteFile | undefined> {
	try {
		return parseProviderCassette(JSON.parse(await readFile(path, 'utf8')));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
		throw error;
	}
}

async function readCassette(path: string): Promise<BenchmarkCassette | undefined> {
	try {
		return benchmarkCassetteSchema.parse(JSON.parse(await readFile(path, 'utf8')));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
		throw error;
	}
}

export interface BenchmarkRunOptions {
	file: string;
	registry: PackRegistry;
	credentials: CredentialSource;
	cassettes?: string;
	/** Call each service live and write its cassette. */
	record?: boolean;
	/**
	 * With `record`, only these services are called live; the rest answer as
	 * without it (WP140). An LLM reader is recorded only when named here (WP143).
	 */
	only?: readonly string[];
	/** The provider an LLM reader is recorded through: `ollama` by default (WP143). */
	readerProvider?: string;
	out?: string;
	storage?: Storage;
	/** Stamped on the report; the CLI passes the time, tests a fixed one. */
	ranAt: string;
	/** The live fetch and the recorder's clock — injected by tests. */
	fetch?: typeof globalThis.fetch;
	now?: () => number;
}

export interface BenchmarkRunResult {
	report: BenchmarkReport;
	markdown: string;
	/** The cassette files written by `--record`. */
	recorded: string[];
	reportFile?: string;
	markdownFile?: string;
}

export async function benchmarkRun(options: BenchmarkRunOptions): Promise<BenchmarkRunResult> {
	const benchmark = parseBenchmark(JSON.parse(await readFile(options.file, 'utf8')));
	const dir = options.cassettes ?? DEFAULT_BENCHMARK_CASSETTES;
	const recorders: Array<{
		service: GuardrailService;
		entries: () => BenchmarkCassette['entries'];
	}> = [];
	const replays = new Map<string, BenchmarkCassette>();
	const live = (serviceId: string) =>
		options.record === true && (!options.only || options.only.includes(serviceId));
	for (const service of options.registry.listGuardrailServices()) {
		const cassette = live(service.id)
			? undefined
			: await readCassette(cassetteFileFor(dir, service.id));
		if (cassette) replays.set(service.id, cassette);
	}

	// An LLM reader asks its model through a provider the host hands it (WP143): its
	// cassette's replay, or, named in --only under --record, the live model recorded.
	const readerProviders = new Map<
		string,
		{ provider: LLMProvider; mode: 'cassette' | 'live'; latencies: () => number[] }
	>();
	const readerRecordings: Array<{
		reader: Reader;
		provider: LLMProvider;
		entries: ProviderCassetteEntry[];
	}> = [];
	for (const reader of options.registry.listReaders()) {
		if (reader.kind !== 'llm') continue;
		if (options.record === true && options.only?.includes(reader.id)) {
			const providerId = options.readerProvider ?? 'ollama';
			const factory = options.registry.getProviderFactory(providerId);
			if (!factory) throw new Error(`no provider "${providerId}" to record ${reader.id} through`);
			const inner = factory.create({
				apiKey: options.credentials.get(providerId) ?? '',
				...(options.fetch ? { fetch: options.fetch } : {})
			});
			const recording = recordingProvider(inner, { now: options.now ?? (() => performance.now()) });
			readerRecordings.push({ reader, provider: inner, entries: recording.entries });
			readerProviders.set(reader.id, {
				provider: recording.provider,
				mode: 'live',
				latencies: () => recording.entries.map((entry) => entry.latencyMs)
			});
			continue;
		}
		const cassette = await readProviderCassette(readerCassetteFileFor(dir, reader.id));
		if (cassette)
			readerProviders.set(reader.id, {
				provider: createCassetteProvider(cassette),
				mode: 'cassette',
				latencies: () => cassette.entries.map((entry) => entry.latencyMs)
			});
	}

	const clientFor = (service: GuardrailService, config: unknown): BenchmarkClient | undefined => {
		if (live(service.id)) {
			const credentialId = service.credential?.id;
			if (credentialId && !options.credentials.has(credentialId)) return undefined;
			const recorder = recordingFetch(
				options.fetch ?? globalThis.fetch.bind(globalThis),
				options.now ?? (() => performance.now())
			);
			recorders.push({ service, entries: recorder.entries });
			return {
				client: service.create({
					config,
					fetch: recorder.fetch,
					getCredential: (id) => options.credentials.get(id),
					timeoutMs: 15_000
				}),
				mode: 'live',
				latencies: () => recorder.entries().map((entry) => entry.latencyMs)
			};
		}
		const cassette = replays.get(service.id);
		if (!cassette) return undefined;
		const replay = cassetteFetch(cassette);
		return {
			// A replay sends nothing, so the client is handed a placeholder where a key would go.
			client: service.create({
				config,
				fetch: replay.fetch,
				getCredential: () => 'cassette',
				timeoutMs: 15_000
			}),
			mode: 'cassette',
			latencies: replay.latencies
		};
	};

	const report = await runBenchmark(benchmark, {
		registry: options.registry,
		question: { setId: GUARD_QUESTION_SET_ID, questionId: 'attack', noul: ATTACK_QUESTION },
		clientFor,
		readerContextFor: (reader) => {
			const own = readerProviders.get(reader.id);
			return own ? { provider: own.provider } : undefined;
		},
		readerMode: (reader) =>
			readerProviders.get(reader.id)?.mode ??
			(reader.kind === 'rule' || reader.egress.length === 0 ? 'local' : 'cassette'),
		readerLatencies: (reader) => readerProviders.get(reader.id)?.latencies() ?? [],
		ranAt: options.ranAt
	});
	const markdown = renderBenchmarkMarkdown(report);

	const recorded: string[] = [];
	if (options.record && recorders.length > 0) {
		await mkdir(dir, { recursive: true });
		for (const { service, entries } of recorders) {
			const path = cassetteFileFor(dir, service.id);
			const cassette: BenchmarkCassette = {
				kind: BENCHMARK_CASSETTE_KIND,
				version: 1,
				subjectId: service.id,
				recordedAt: options.ranAt,
				entries: entries()
			};
			await writeFile(path, JSON.stringify(cassette, null, '\t') + '\n');
			recorded.push(path);
		}
	}
	if (options.record)
		for (const { reader, provider, entries } of readerRecordings) {
			await mkdir(dir, { recursive: true });
			const path = readerCassetteFileFor(dir, reader.id);
			const cassette: ProviderCassetteFile = {
				format: 'craftabot-cassette',
				formatVersion: CASSETTE_FORMAT_VERSION,
				kind: 'provider',
				providerId: provider.id,
				recordedAt: options.ranAt,
				recordedBy: 'craftabot-harness/0.0.1',
				note: `${reader.id} over benchmark ${benchmark.id}: every row, asked live.`,
				egress: provider.egress ?? [],
				entries
			};
			await writeFile(path, JSON.stringify(cassette, null, '\t') + '\n');
			recorded.push(path);
		}

	const result: BenchmarkRunResult = { report, markdown, recorded };
	if (options.out) {
		await mkdir(options.out, { recursive: true });
		result.reportFile = join(options.out, `${benchmark.id}.report.json`);
		result.markdownFile = join(options.out, `${benchmark.id}.md`);
		await writeFile(result.reportFile, JSON.stringify(report, null, '\t') + '\n');
		await writeFile(result.markdownFile, markdown);
	}
	await options.storage?.putBenchmarkReport(report);
	return result;
}

/** One line per subject for the terminal. */
export function renderBenchmarkSummary(report: BenchmarkReport): string {
	const pct = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`);
	const lines = [
		`benchmark ${report.benchmarkId} — synthetic rows, ${report.corpora.reduce((sum, corpus) => sum + corpus.rows, 0)} over ${report.corpora.length} corpora`
	];
	for (const subject of report.subjects) {
		lines.push(
			subject.applicable
				? `  ${subject.id.padEnd(40)} ${subject.mode === 'stand-in' ? 'stand-in (unmeasured)' : subject.mode.padEnd(21)} precision ${pct(subject.precision.value)}  recall ${pct(subject.recall.value)}  false alarms ${pct(subject.falseAlarms.value)}${subject.errors ? `  errors ${subject.errors}` : ''}`
				: `  ${subject.id.padEnd(40)} not applicable — ${subject.reason ?? ''}`
		);
	}
	lines.push(`  digest ${report.digest}`, '');
	return lines.join('\n');
}
