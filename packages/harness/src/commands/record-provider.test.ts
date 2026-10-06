import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseProviderCassette } from '@craftabot/core';
import { afterAll, describe, expect, it } from 'vitest';
import { defaultConfig } from '../config.js';
import { credentialsFromEnv } from '../credentials.js';
import { experimentRun } from './experiment.js';
import { recordExperiment } from './record-provider.js';

/**
 * **`craftabot record --experiment`** (WP114, `103-FALLIBLE-ACTORS.md` §4):
 * the lending stack design with its brain made a live brain naming a
 * cassette, recorded through the mock provider at a small population, then
 * run as `experiment run` runs it — under `--egress none`, with no key — from
 * the cassette alone: every cell answers, twice over to the same result.
 */
const ROOT = resolve(import.meta.dirname, '../../../..');
const roots: string[] = [];
afterAll(async () => {
	await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

const fixedNow = () => {
	let n = 0;
	return () => new Date(Date.UTC(2026, 8, 29, 12, 0, n++)).toISOString();
};
const fixedIds = () => {
	let n = 0;
	return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
};

describe('record --experiment (WP114)', { timeout: 600_000 }, () => {
	it('records a design’s live brain to its cassette, and the design then replays with no key and no network', async () => {
		const root = await mkdtemp(join(tmpdir(), 'craftabot-record-'));
		roots.push(root);
		const cassettePath = join(root, 'lending-stack.provider-cassette.json');
		const design = JSON.parse(
			await readFile(join(ROOT, 'experiments', 'lending-stack.json'), 'utf8')
		) as {
			design: {
				template: { brains: unknown[] };
				factors: Array<{ axis: string }>;
				baseline: Record<string, string>;
			};
		};
		// One brain, recorded: the design's brain factor (WP116) goes with the brains it named.
		design.design.factors = design.design.factors.filter((factor) => factor.axis !== 'brain');
		delete design.design.baseline['brain'];
		design.design.template.brains = [{ id: 'live', tier: 'live', cassette: cassettePath }];
		const file = join(root, 'design.json');
		await writeFile(file, JSON.stringify(design), 'utf8');
		const config = defaultConfig();
		const credentials = credentialsFromEnv({});

		const recorded = await recordExperiment({
			file,
			provider: 'mock',
			out: join(root, 'recording'),
			config,
			credentials,
			size: 60,
			now: fixedNow(),
			newId: fixedIds(),
			clock: () => 0
		});
		expect(recorded.cassettes).toHaveLength(1);
		expect(recorded.cassettes[0]?.entries).toBeGreaterThan(0);
		const cassette = parseProviderCassette(JSON.parse(await readFile(cassettePath, 'utf8')));
		expect(cassette.providerId).toBe('mock');
		expect(cassette.note).toContain('a stand-in, not a live model');
		expect(cassette.entries.every((entry) => entry.model.length > 0)).toBe(true);

		const replay = async (out: string) =>
			experimentRun({
				file,
				out: join(root, out),
				config,
				credentials,
				size: 60,
				egress: 'none',
				now: fixedNow(),
				newId: fixedIds()
			});
		const first = await replay('replay-1');
		expect(first.cells).toBe(recorded.cells);
		const reports = await Promise.all(
			first.reportFiles.map(async (path) => JSON.parse(await readFile(path, 'utf8')))
		);
		const cells = reports.flatMap((report) => report.cells as Array<{ error?: string }>);
		expect(cells.filter((cell) => cell.error !== undefined)).toEqual([]);
		const second = await replay('replay-2');
		expect(second.result.digest).toBe(first.result.digest);
	});

	it('refuses a design with no cassette brain, and a provider the cartridge does not name', async () => {
		const root = await mkdtemp(join(tmpdir(), 'craftabot-record-'));
		roots.push(root);
		const design = JSON.parse(
			await readFile(join(ROOT, 'experiments', 'lending-stack.json'), 'utf8')
		) as {
			design: {
				template: { brains: unknown[] };
				factors: Array<{ axis: string }>;
				baseline: Record<string, string>;
			};
		};
		// One brain, recorded: the design's brain factor (WP116) goes with the brains it named.
		design.design.factors = design.design.factors.filter((factor) => factor.axis !== 'brain');
		delete design.design.baseline['brain'];
		const file = join(root, 'design.json');
		await writeFile(file, JSON.stringify(design), 'utf8');
		const base = {
			file,
			out: join(root, 'out'),
			config: defaultConfig(),
			credentials: credentialsFromEnv({})
		};
		await expect(recordExperiment({ ...base, provider: 'mock' })).rejects.toThrow(
			/has no brain that names a cassette/
		);
		design.design.template.brains = [
			{ id: 'live', tier: 'live', cartridgeId: 'openai/gpt-4o-mini', cassette: 'x.json' }
		];
		await writeFile(file, JSON.stringify(design), 'utf8');
		await expect(recordExperiment({ ...base, provider: 'anthropic' })).rejects.toThrow(
			/not 'anthropic'/
		);
	});
});

describe(
	'record --experiment with cells at once (99-DGX-SPARK.md §9)',
	{ timeout: 600_000 },
	() => {
		it('records the same cassette with four cells in flight as with one, the cells placed by ordinal', async () => {
			const root = await mkdtemp(join(tmpdir(), 'craftabot-record-conc-'));
			roots.push(root);
			const base = JSON.parse(
				await readFile(join(ROOT, 'experiments', 'lending-stack.json'), 'utf8')
			) as {
				design: {
					template: { brains: unknown[] };
					factors: Array<{ axis: string }>;
					baseline: Record<string, string>;
				};
			};
			base.design.factors = base.design.factors.filter((factor) => factor.axis !== 'brain');
			delete base.design.baseline['brain'];
			const record = async (name: string, concurrency?: number) => {
				const cassette = join(root, `${name}.provider-cassette.json`);
				const design = structuredClone(base);
				design.design.template.brains = [{ id: 'live', tier: 'live', cassette }];
				const file = join(root, `${name}.json`);
				await writeFile(file, JSON.stringify(design), 'utf8');
				const result = await recordExperiment({
					file,
					provider: 'mock',
					out: join(root, `${name}-out`),
					config: defaultConfig(),
					credentials: credentialsFromEnv({}),
					size: 60,
					...(concurrency !== undefined ? { concurrency } : {}),
					now: fixedNow(),
					newId: fixedIds(),
					clock: () => 0
				});
				const entries = parseProviderCassette(JSON.parse(await readFile(cassette, 'utf8'))).entries;
				return { result, entries };
			};
			const serial = await record('serial');
			const parallel = await record('parallel', 4);
			expect(parallel.result.cells).toBe(serial.result.cells);
			const key = (entry: { promptDigest?: string; digest?: string }) => JSON.stringify(entry);
			expect(parallel.entries.map(key).sort()).toEqual(serial.entries.map(key).sort());
		});
	}
);

describe(
	'record --experiment and a credential in a response (2026-10-06)',
	{ timeout: 600_000 },
	() => {
		it('stops at the first offending answer rather than recording to the end, and writes nothing', async () => {
			const root = await mkdtemp(join(tmpdir(), 'craftabot-record-leak-'));
			roots.push(root);
			const cassette = join(root, 'leak.provider-cassette.json');
			const design = JSON.parse(
				await readFile(join(ROOT, 'experiments', 'lending-stack.json'), 'utf8')
			) as {
				design: {
					template: { brains: unknown[] };
					factors: Array<{ axis: string }>;
					baseline: Record<string, string>;
				};
			};
			design.design.factors = design.design.factors.filter((factor) => factor.axis !== 'brain');
			delete design.design.baseline['brain'];
			design.design.template.brains = [{ id: 'live', tier: 'live', cassette }];
			const file = join(root, 'design.json');
			await writeFile(file, JSON.stringify(design), 'utf8');
			// The mock's plans say "Deciding."; a held secret that is a word the model says is exactly the 2026-10-06 incident.
			await expect(
				recordExperiment({
					file,
					provider: 'mock',
					out: join(root, 'recording'),
					config: defaultConfig(),
					credentials: credentialsFromEnv({ CRAFTABOT_CREDENTIAL_OPENAI: 'Deciding' }),
					size: 60,
					now: fixedNow(),
					newId: fixedIds(),
					clock: () => 0
				})
			).rejects.toThrow(/stopping at once/);
			await expect(readFile(cassette, 'utf8')).rejects.toThrow();
		});
	}
);
