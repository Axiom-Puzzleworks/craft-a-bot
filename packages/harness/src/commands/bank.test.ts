import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBankRun } from '@craftabot/core';
import { afterAll, describe, expect, it } from 'vitest';
import { main } from '../cli.js';
import { defaultConfig } from '../config.js';
import { credentialsFromEnv } from '../credentials.js';
import { bankRun } from './bank.js';

/**
 * WP83 stage B: `craftabot bank run` — a day at the lending desk over a
 * small population at `Infinity`, the runs and the day on disk, the day
 * the same bytes twice, the wall time recorded; the CLI's flags.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const roots: string[] = [];
async function tempDir(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'craftabot-bank-'));
	roots.push(root);
	return root;
}
afterAll(async () => {
	await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

const DESKS = [
	{
		id: 'lending',
		workflowId: 'fs-lending/lending',
		kinds: ['application'],
		configuration: 'rules-only',
		concurrency: 4
	}
];

describe('craftabot bank run', { timeout: 300_000 }, () => {
	it('works a day at the lending desk, writes every run and the BankRun, and is the same bytes twice', async () => {
		const root = await tempDir();
		const desks = join(root, 'desks.json');
		await writeFile(desks, JSON.stringify(DESKS), 'utf8');
		const options = {
			desksPath: desks,
			seed: 1,
			size: 2_000,
			brain: 'scripted-optimal' as const,
			out: join(root, 'out'),
			config: defaultConfig(),
			credentials: credentialsFromEnv({}),
			egress: 'none' as const
		};
		const first = await bankRun({ ...options, from: '2026-06-01', to: '2026-06-14' });
		expect(first.bankRun.counts.routed).toBeGreaterThan(0);
		expect(first.bankRun.counts.completed).toBe(first.bankRun.counts.routed);
		expect(first.bankRun.runs).toHaveLength(first.bankRun.counts.routed);
		expect(first.bankRun.desks[0]).toMatchObject({
			id: 'lending',
			configuration: 'rules-only',
			concurrency: 4
		});
		expect(first.bankRun.clock.books.map((book) => book.kind)).toEqual(['application']);
		expect(first.wallMs).toBeGreaterThanOrEqual(0);
		const written = parseBankRun(JSON.parse(await readFile(first.file, 'utf8')));
		expect(written.digest).toBe(first.bankRun.digest);
		expect(written.wallMs).toBe(first.wallMs);
		const workflows = await readdir(join(root, 'out', 'workflows'));
		expect(workflows).toHaveLength(first.bankRun.runs.length);
		// Rules-only made no agent run; a bot desk would fill <out>/runs.
		const second = await bankRun({
			...options,
			out: join(root, 'again'),
			from: '2026-06-01',
			to: '2026-06-14'
		});
		expect(second.bankRun.digest).toBe(first.bankRun.digest);
		expect(JSON.stringify({ ...second.bankRun, wallMs: 0 })).toBe(
			JSON.stringify({ ...first.bankRun, wallMs: 0 })
		);
	});

	it('works the three-desk day file the CI runs — lending, fraud and advice each take their kind', async () => {
		const root = await tempDir();
		const result = await bankRun({
			desksPath: resolve(HERE, '..', '..', '..', '..', 'campaigns', 'desks', 'bank-day.json'),
			from: '2026-06-01',
			to: '2026-06-30',
			seed: 1,
			size: 800,
			brain: 'scripted-optimal',
			out: join(root, 'out'),
			config: defaultConfig(),
			credentials: credentialsFromEnv({}),
			egress: 'none'
		});
		expect(result.bankRun.desks.map((desk) => desk.id)).toEqual(['lending', 'fraud', 'advice']);
		expect(result.bankRun.clock.books.map((book) => book.kind).sort()).toEqual([
			'advice-request',
			'alert',
			'application'
		]);
		expect(result.bankRun.counts.unrouted).toBe(0);
		expect(result.bankRun.counts.byDesk['lending']?.worked).toBeGreaterThan(0);
		expect(result.bankRun.counts.byDesk['fraud']?.worked).toBeGreaterThan(0);
		expect(result.bankRun.counts.completed).toBe(result.bankRun.counts.routed);
		expect(result.bankRun.incidents).toEqual([]);
	});

	it('a bot desk writes its agent runs; a day outside the period is refused; the CLI wants its flags', async () => {
		const root = await tempDir();
		const desks = join(root, 'desks.json');
		await writeFile(
			desks,
			JSON.stringify([{ ...DESKS[0], configuration: 'bot-everywhere', concurrency: 2 }]),
			'utf8'
		);
		const result = await bankRun({
			desksPath: desks,
			day: '2026-06-10',
			seed: 1,
			size: 3_000,
			brain: 'scripted-optimal',
			out: join(root, 'out'),
			config: defaultConfig(),
			credentials: credentialsFromEnv({}),
			egress: 'none',
			stopAfter: 3
		});
		expect(result.bankRun.runs.length).toBeLessThanOrEqual(3);
		if (result.bankRun.runs.length > 0) {
			const runs = await readdir(join(root, 'out', 'runs'));
			expect(runs.length).toBeGreaterThan(0);
		}
		await expect(
			bankRun({
				desksPath: desks,
				day: '2030-01-01',
				seed: 1,
				size: 100,
				brain: 'scripted-optimal',
				out: join(root, 'out2'),
				config: defaultConfig(),
				credentials: credentialsFromEnv({})
			})
		).rejects.toThrow('inside the population');
		const err: string[] = [];
		const io = { stdout: () => {}, stderr: (text: string) => void err.push(text), env: {} };
		expect(await main(['bank', 'run', '--desks', desks], io)).toBe(1);
		expect(err.join('')).toContain('bank needs run --day');
		expect(
			await main(['bank', 'run', '--day', '2026-06-10', '--desks', desks, '--brain', 'live'], io)
		).toBe(1);
		expect(err.join('')).toContain('--brain must be scripted-optimal or scripted-noisy');
	});
});
