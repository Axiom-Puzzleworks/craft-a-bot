import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { parseEvalReport, SCRIPTED_MATRIX, type MatrixSpec } from '@craftabot/evals';
import { main } from '../cli.js';
import { runMatrixCommand } from './matrix.js';

/**
 * `craftabot campaign --matrix` (WP56 stage B): the evals CLI's job, done by
 * the harness — and done identically. The strongest check is the one the
 * DoD names: the scripted matrix, run here, produces the summaries the old
 * CLI committed in `packages/evals/baselines/scripted.baseline.json`. The
 * matrix is scripted and seeded, so byte-for-byte on the numbers is the bar,
 * not "roughly".
 */
const roots: string[] = [];
async function tmp(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'craftabot-matrix-'));
	roots.push(root);
	return root;
}
afterAll(async () => {
	for (const root of roots) await rm(root, { recursive: true, force: true });
});

const HERE = dirname(fileURLToPath(import.meta.url));
const COMMITTED_SCRIPTED_BASELINE = resolve(
	HERE,
	'..',
	'..',
	'..',
	'evals',
	'baselines',
	'scripted.baseline.json'
);

/** Two cards, both scripted tiers, three seeds: enough to exercise every path in seconds. */
const SMALL: MatrixSpec = {
	...SCRIPTED_MATRIX,
	goalCardIds: ['starter/say-hello', 'starter/snack'],
	seeds: [1, 2, 3]
};

function io(env: NodeJS.ProcessEnv = {}) {
	const sink = {
		out: '',
		err: '',
		env,
		stdout: (t: string) => void (sink.out += t),
		stderr: (t: string) => void (sink.err += t)
	};
	return sink;
}

describe('craftabot campaign --matrix', () => {
	it('reproduces the evals CLI’s committed scripted baseline, summary for summary', async () => {
		const out = await tmp();
		const result = await runMatrixCommand({ matrix: 'scripted', out });
		const committed = parseEvalReport(
			JSON.parse(await readFile(COMMITTED_SCRIPTED_BASELINE, 'utf8'))
		);
		expect(result.report.matrix).toEqual(committed.matrix);
		expect(result.report.summaries).toEqual(committed.summaries);
		// No baseline in a fresh directory: says so, exits 0, writes the report and the scorecard.
		expect(result.comparison).toBeUndefined();
		expect(result.exitCode).toBe(0);
		expect(result.lines.at(-1)).toContain('no baseline yet');
		expect(
			parseEvalReport(JSON.parse(await readFile(result.reportFile, 'utf8'))).cells
		).not.toHaveLength(0);
		expect(await readFile(result.scorecardFile, 'utf8')).toContain('scripted-optimal');
	}, 60_000);

	it('records a baseline (summaries only), then compares against it', async () => {
		const out = await tmp();
		const first = await runMatrixCommand({ matrix: SMALL, out, record: true });
		expect(first.recorded).toBe(true);
		const stored = parseEvalReport(JSON.parse(await readFile(first.baselineFile, 'utf8')));
		expect(stored.cells).toHaveLength(0);
		expect(stored.summaries).toEqual(first.report.summaries);

		const second = await runMatrixCommand({ matrix: SMALL, out, strict: true });
		expect(second.comparison).toMatchObject({ comparable: true, regressions: [] });
		expect(second.exitCode).toBe(0);
		expect(second.lines.at(-1)).toBe('no regressions against the baseline');
	});

	it('refuses a corrupt baseline rather than treating it as missing', async () => {
		const out = await tmp();
		const { writeFile } = await import('node:fs/promises');
		await writeFile(join(out, 'custom.baseline.json'), '{"schemaVersion": 1}\n');
		await expect(runMatrixCommand({ matrix: SMALL, out })).rejects.toThrow(
			'could not read the baseline'
		);
	});

	it('is reachable from the CLI, and names the matrices it knows', async () => {
		const out = await tmp();
		const sink = io();
		const code = await main(['campaign', '--matrix', 'nope', '--out', out], sink);
		expect(code).toBe(1);
		expect(sink.err).toContain('scripted, expert');

		const ok = io();
		expect(await main(['campaign', '--matrix', 'scripted', '--out', out], ok)).toBe(0);
		expect(ok.out).toContain('matrix scripted');
		expect(ok.out).toContain('scorecard written to');
	}, 60_000);
});
