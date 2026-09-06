import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { injectionBaseline, type CampaignReport } from '@craftabot/evals';
import { main } from '../cli.js';
import { defaultConfig } from '../config.js';
import { credentialsFromEnv } from '../credentials.js';
import { createFileStorage } from '../storage/file-storage.js';
import { runCampaignFile, reusableCells } from './campaign.js';

/**
 * `--resume` and the index (WP68, `57-HARNESS-AT-SCALE.md` §11 items 3–4):
 * a campaign stopped after some cells and run again with `--resume`
 * finishes with every cell present and none run twice; a cell whose run
 * was tampered with runs again; the index the store maintained equals the
 * one rebuilt from disk, and a listing reads it without a `readdir`.
 */
const roots: string[] = [];
async function tmp(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'craftabot-resume-'));
	roots.push(root);
	return root;
}
afterAll(async () => {
	for (const root of roots) await rm(root, { recursive: true, force: true });
});

const config = defaultConfig();
const credentials = credentialsFromEnv({});
const clock = () => {
	let calls = 0;
	return () => new Date(Date.UTC(2026, 8, 6, 9, 0, calls++)).toISOString();
};
const ids = () => {
	let n = 0;
	return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
};

class Stopped extends Error {}

describe('--resume (WP68)', () => {
	it(
		'a run stopped part-way resumes with every cell present and none run twice; a tampered cell runs again',
		{ timeout: 120_000 },
		async () => {
			const root = await tmp();
			const file = join(root, 'injection.json');
			await writeFile(file, JSON.stringify(injectionBaseline([1])), 'utf8');
			const out = join(root, 'out');
			const base = {
				file,
				out,
				config,
				credentials,
				principal: { kind: 'service' as const, id: 'craftabot-harness', name: 'ci' },
				egress: 'none' as const
			};

			// The whole, for comparison, from a separate directory with the same pinned clock and ids.
			const { report: whole } = await runCampaignFile({
				...base,
				out: join(root, 'whole'),
				now: clock(),
				newId: ids()
			});

			// Stopped after ten cells: the harness throws out of the run and lets what was written settle.
			let done = 0;
			await expect(
				runCampaignFile({
					...base,
					now: clock(),
					newId: ids(),
					onCell: (count) => {
						done = count;
						if (count === 10) throw new Stopped('killed');
					}
				})
			).rejects.toThrow(Stopped);
			expect(done).toBe(10);
			const storage = await createFileStorage(join(out, 'runs'));
			const kept = await reusableCells(out, storage);
			expect(kept.size).toBe(10);

			// Tamper with one kept run's events: its digest no longer matches, so it runs again.
			const [tamperedOrdinal, tampered] = [...kept.entries()][3] as [number, { runId: string }];
			const eventsPath = join(out, 'runs', 'runs', tampered.runId, 'events.jsonl');
			await writeFile(eventsPath, `${(await readFile(eventsPath, 'utf8')).trimEnd()}\n`, 'utf8');
			const stored = await createFileStorage(join(out, 'runs'));
			const rows = await stored.getEvents(tampered.runId);
			const last = rows.at(-1);
			if (last) {
				await writeFile(
					eventsPath,
					`${rows
						.slice(0, -1)
						.map((row) => JSON.stringify(row))
						.join('\n')}\n`,
					'utf8'
				);
			}
			expect(
				(await reusableCells(out, await createFileStorage(join(out, 'runs')))).has(tamperedOrdinal)
			).toBe(false);

			// Resumed: nine cells reused, the rest run, every cell present once, the report the whole's.
			const reused: number[] = [];
			const ran: number[] = [];
			const { report } = await runCampaignFile({
				...base,
				resume: true,
				now: clock(),
				newId: ids(),
				onCellDone: (count, _total, wasReused) => (wasReused ? reused : ran).push(count)
			});
			expect(reused).toHaveLength(9);
			expect(ran).toHaveLength(whole.cells.length - 9);
			expect(report.cells).toHaveLength(whole.cells.length);
			expect(new Set(report.cells.map((cell) => cell.ordinal)).size).toBe(whole.cells.length);
			expect(report.cells).toEqual(whole.cells);
			expect(report.gates).toEqual(whole.gates);

			// Every cell's run is on disk exactly once, and the store lists them all.
			const runs = await (await createFileStorage(join(out, 'runs'))).listRuns();
			expect(new Set(runs.map((run) => run.id)).size).toBe(whole.cells.length);
		}
	);

	it('refuses to resume without the runs kept', async () => {
		const root = await tmp();
		const file = join(root, 'injection.json');
		await writeFile(file, JSON.stringify(injectionBaseline([1])), 'utf8');
		await expect(
			runCampaignFile({
				file,
				out: join(root, 'out'),
				keepRuns: false,
				resume: true,
				config,
				credentials
			})
		).rejects.toThrow(/--resume needs the runs kept/);
	});
});

describe('the index (WP68)', () => {
	it(
		'the maintained index equals one rebuilt from disk, and the summaries list from it',
		{ timeout: 120_000 },
		async () => {
			const root = await tmp();
			const file = join(root, 'injection.json');
			await writeFile(file, JSON.stringify(injectionBaseline([1])), 'utf8');
			const out = join(root, 'out');
			const { report } = await runCampaignFile({
				file,
				out,
				config,
				credentials,
				egress: 'none',
				now: clock(),
				newId: ids()
			});
			const storage = await createFileStorage(join(out, 'runs'));
			const maintained = await storage.readIndex();
			expect(maintained).toHaveLength(report.cells.length);
			expect(maintained.every((line) => line.summary && line.digest !== undefined)).toBe(true);
			const byId = (lines: typeof maintained) =>
				Object.fromEntries(lines.map((line) => [line.id, line]));
			const rebuilt = await storage.rebuildIndex();
			expect(byId(rebuilt)).toEqual(byId(maintained));
			// The file on disk after a rebuild is one line per run, and a fresh store folds it to the same.
			const fresh = await createFileStorage(join(out, 'runs'));
			expect(byId(await fresh.readIndex())).toEqual(byId(maintained));
			expect((await fresh.listRunSummaries()).map((summary) => summary.runId).sort()).toEqual(
				report.cells.map((cell) => cell.runId ?? '').sort()
			);
			// A deleted run leaves the index too, and a store with no index rebuilds one on first read.
			const gone = report.cells[0]?.runId ?? '';
			await fresh.deleteRun(gone);
			expect((await fresh.readIndex()).some((line) => line.id === gone)).toBe(false);
			await rm(join(out, 'runs', 'index.jsonl'), { force: true });
			const again = await createFileStorage(join(out, 'runs'));
			expect((await again.readIndex()).length).toBe(report.cells.length - 1);
			expect(await readFile(join(out, 'runs', 'index.jsonl'), 'utf8')).toContain('"summary":true');
			// The CLI's rebuild says how many it found.
			const sink = {
				out: '',
				err: '',
				env: {},
				stdout: (t: string) => void (sink.out += t),
				stderr: (t: string) => void (sink.err += t)
			};
			expect(await main(['index', '--rebuild', '--out', join(out, 'runs')], sink)).toBe(0);
			expect(sink.out).toContain(`index rebuilt: ${report.cells.length - 1} runs`);
			expect(await main(['index', '--out', join(out, 'runs')], sink)).toBe(1);
			expect(sink.err).toContain('--rebuild');
		}
	);
});

/** The report's cells and gates, for the equality above; a type the compiler checks, not a runtime cast. */
export type WholeReport = Pick<CampaignReport, 'cells' | 'gates'>;
