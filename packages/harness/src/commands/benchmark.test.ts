import { createPackRegistry, latestMeasurement, type PackManifest } from '@craftabot/core';
import { BANK_ADVERSARIAL_BENCHMARK } from '@craftabot/pack-fs-bank';
import readersLlmPack from '@craftabot/pack-readers-llm';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRegistry, defaultConfig } from '../config.js';
import { credentialsFromEnv } from '../credentials.js';
import { createFileStorage } from '../storage/file-storage.js';
import { benchmarkRun, cassetteFileFor } from './benchmark.js';

/**
 * **The benchmark** (WP123, `106-BENCHMARK.md` §6): the reference benchmark
 * over the stand-ins, deterministic to its digest; the keyword baseline and
 * the LLM contract's stand-in measured; a service recorded through a
 * deterministic stand-in of its vendor's API and replayed from the cassette
 * to the same confusion, with no key written; a stand-in never a measurement.
 */
const FILE = join(
	import.meta.dirname,
	'..',
	'..',
	'..',
	'..',
	'benchmarks',
	'bank-adversarial.json'
);
const RAN_AT = '2026-09-30T12:00:00.000Z';
const noCredentials = credentialsFromEnv({});

function registryWith(...extra: PackManifest[]) {
	const registry = createRegistry(defaultConfig());
	for (const pack of extra) registry.registerPack(pack);
	return registry;
}

/**
 * The Azure Content Safety API as a deterministic stand-in: the prompt shield
 * reports an attack when the text addresses the assistant or its rules, and
 * the harm analysis reports nothing. Not the vendor — a way to hold the
 * record-and-replay path without a key.
 */
const AZURE_ATTACK = /\b(assistant|system|instructions?|rules|ignore|pretend|reviewer|assessor)\b/i;
function fakeAzure(calls: { count: number }): typeof globalThis.fetch {
	return (async (input: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) => {
		calls.count += 1;
		const url = String(input);
		if (url.includes(':analyze'))
			return new Response(JSON.stringify({ blocklistsMatch: [], categoriesAnalysis: [] }), {
				status: 200
			});
		const body = JSON.parse(String(init?.body)) as { userPrompt?: string; documents?: string[] };
		const hit = (text?: string) => text !== undefined && AZURE_ATTACK.test(text);
		return new Response(
			JSON.stringify({
				userPromptAnalysis: { attackDetected: hit(body.userPrompt) },
				documentsAnalysis: (body.documents ?? []).map((text) => ({ attackDetected: hit(text) }))
			}),
			{ status: 200 }
		);
	}) as typeof globalThis.fetch;
}

describe('craftabot benchmark run (WP123)', () => {
	it('runs the file the bank ships: benchmarks/bank-adversarial.json is fs-bank’s definition', async () => {
		expect(JSON.parse(await readFile(FILE, 'utf8'))).toEqual(BANK_ADVERSARIAL_BENCHMARK);
	});

	it('is deterministic over the stand-ins: the same report, digest and all, twice', async () => {
		const first = await benchmarkRun({
			file: FILE,
			registry: registryWith(),
			credentials: noCredentials,
			cassettes: join(tmpdir(), 'no-cassettes-here'),
			ranAt: RAN_AT
		});
		const second = await benchmarkRun({
			file: FILE,
			registry: registryWith(),
			credentials: noCredentials,
			cassettes: join(tmpdir(), 'no-cassettes-here'),
			ranAt: '2026-10-01T12:00:00.000Z'
		});
		expect(second.report.digest).toBe(first.report.digest);
		const { report } = first;
		expect(report.corpora.map((corpus) => corpus.rows).reduce((a, b) => a + b)).toBe(1408);
		expect(
			report.subjects.map((subject) => [subject.id, subject.mode, subject.applicable])
		).toEqual([
			['azure-content-safety/content-safety', 'stand-in', true],
			['bedrock-guardrails/apply-guardrail', 'stand-in', true],
			['geap/model-armor', 'stand-in', true],
			['guard-local/llama-guard', 'stand-in', true],
			['guard-local/prompt-guard', 'stand-in', true],
			['lakera-guard/guard', 'stand-in', true],
			['pdp-opa/opa', 'stand-in', false],
			['fs-bank/reader/attack-words', 'local', true]
		]);
		// Every shipped stand-in answers clean: it flags nothing, so it measures nothing.
		for (const subject of report.subjects.filter((each) => each.mode === 'stand-in'))
			expect(subject.flagged, subject.id).toBe(0);
		const baseline = report.subjects.find(
			(subject) => subject.id === 'fs-bank/reader/attack-words'
		)!;
		expect(baseline.confusion).toEqual({ tp: 238, fp: 55, fn: 682, tn: 433 });
		expect(first.markdown.startsWith('# The bank, attacked')).toBe(true);
		expect(first.markdown).toContain('**Synthetic rows.**');
		expect(report.digest).toMatchInlineSnapshot(
			`"7a45fe25a1c242d614e80b15d1e5aa8515294e39bd2bc4db017a1c9160128e45"`
		);
	});

	it('measures the LLM contract’s keyword stand-in beside the baseline, and what each caught alone', async () => {
		const { report } = await benchmarkRun({
			file: FILE,
			registry: registryWith(readersLlmPack),
			credentials: noCredentials,
			cassettes: join(tmpdir(), 'no-cassettes-here'),
			ranAt: RAN_AT
		});
		const readers = report.subjects.filter((subject) => subject.kind === 'reader');
		expect(readers.map((subject) => [subject.id, subject.confusion, subject.caughtAlone.length]))
			.toMatchInlineSnapshot(`
			[
			  [
			    "fs-bank/reader/attack-words",
			    {
			      "fn": 682,
			      "fp": 55,
			      "tn": 433,
			      "tp": 238,
			    },
			    233,
			  ],
			  [
			    "readers-llm/reader/mock",
			    {
			      "fn": 898,
			      "fp": 16,
			      "tn": 472,
			      "tp": 22,
			    },
			    17,
			  ],
			]
		`);
	});

	it('records a service live into a cassette, with no key in it, and replays it to the same confusion', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'benchmark-cassettes-'));
		const file = join(dir, 'azure.json');
		const benchmark = JSON.parse(await readFile(FILE, 'utf8')) as Record<string, unknown>;
		await writeFile(
			file,
			JSON.stringify({
				...benchmark,
				id: 'azure-only',
				corpora: ['fs-disputes/corpus/adversarial-v1'],
				subjects: { services: ['azure-content-safety/content-safety'], readers: [], components: [] }
			})
		);
		const secret = 'az-planted-secret-never-written';
		const calls = { count: 0 };
		let clock = 0;
		const recorded = await benchmarkRun({
			file,
			registry: registryWith(),
			credentials: credentialsFromEnv({ CRAFTABOT_CREDENTIAL_AZURE_CONTENT_SAFETY: secret }),
			cassettes: dir,
			record: true,
			fetch: fakeAzure(calls),
			now: () => (clock += 7),
			ranAt: RAN_AT
		});
		expect(recorded.recorded).toEqual([
			cassetteFileFor(dir, 'azure-content-safety/content-safety')
		]);
		const text = await readFile(recorded.recorded[0]!, 'utf8');
		expect(text).not.toContain(secret);
		const live = recorded.report.subjects[0]!;
		expect(live.mode).toBe('live');
		expect(live.flagged).toBeGreaterThan(0);
		expect(calls.count).toBe(402);

		const replayed = await benchmarkRun({
			file,
			registry: registryWith(),
			credentials: noCredentials,
			cassettes: dir,
			ranAt: RAN_AT
		});
		const replay = replayed.report.subjects[0]!;
		expect(replay.mode).toBe('cassette');
		expect(calls.count).toBe(402);
		expect(replay.errors).toBe(0);
		for (const field of [
			'confusion',
			'byAttack',
			'byTarget',
			'bySurface',
			'precision',
			'recall',
			'latency'
		] as const)
			expect(replay[field], field).toEqual(live[field]);
	});

	it('stores the report, and a stand-in is never a measurement: the Rack reads unmeasured', async () => {
		const storage = await createFileStorage(await mkdtemp(join(tmpdir(), 'benchmark-store-')));
		const { report } = await benchmarkRun({
			file: FILE,
			registry: registryWith(),
			credentials: noCredentials,
			cassettes: join(tmpdir(), 'no-cassettes-here'),
			storage,
			ranAt: RAN_AT
		});
		const reports = await storage.listBenchmarkReports();
		expect(reports.map((row) => row.id)).toEqual([report.id]);
		expect(latestMeasurement(reports, 'geap/model-armor')).toBeUndefined();
		expect(latestMeasurement(reports, 'fs-bank/reader/attack-words')?.subject.recall.value).toBe(
			report.subjects.at(-1)!.recall.value
		);
	});

	it('refuses a corpus written against another question set', async () => {
		const registry = createPackRegistry();
		const dir = await mkdtemp(join(tmpdir(), 'benchmark-refuse-'));
		const file = join(dir, 'b.json');
		await writeFile(
			file,
			JSON.stringify({
				schemaVersion: 1,
				kind: 'benchmark',
				id: 'wrong',
				name: 'Wrong',
				corpora: ['fs-disputes/corpus/claims-v1']
			})
		);
		for (const pack of defaultConfig().packs) registry.registerPack(pack);
		await expect(
			benchmarkRun({ file, registry, credentials: noCredentials, ranAt: RAN_AT })
		).rejects.toThrow(/written against "fs-disputes\/questions\/claim-q1"/);
	});
});
