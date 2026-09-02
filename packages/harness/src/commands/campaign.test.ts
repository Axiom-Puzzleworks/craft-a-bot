import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { injectionBaseline, parseCampaignReport } from '@craftabot/evals';
import { main } from '../cli.js';
import { defaultConfig } from '../config.js';
import { credentialsFromEnv } from '../credentials.js';
import { createFileStorage } from '../storage/file-storage.js';
import { runCampaignFile } from './campaign.js';

/**
 * `craftabot campaign`, end to end: the baseline campaign at one seed from a
 * file, every rendering written, every cell's run on disk — and the red run
 * exiting 1 under `--strict`, which is the DoD's own sentence at the CLI.
 */
const roots: string[] = [];
async function tmp(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'craftabot-campaign-'));
	roots.push(root);
	return root;
}
afterAll(async () => {
	for (const root of roots) await rm(root, { recursive: true, force: true });
});

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

describe('craftabot campaign', () => {
	it('runs a campaign file, writes the report and renderings, and keeps every cell’s run', async () => {
		const root = await tmp();
		const file = join(root, 'baseline.json');
		await writeFile(file, JSON.stringify(injectionBaseline([1])), 'utf8');
		const out = join(root, 'out');

		const result = await runCampaignFile({
			file,
			out,
			junit: join(out, 'junit.xml'),
			sarif: join(out, 'results.sarif'),
			markdown: join(out, 'scorecard.md'),
			config: defaultConfig(),
			credentials: credentialsFromEnv({})
		});

		expect(result.report.passed).toBe(true);
		expect(result.report.cells).toHaveLength(16);
		expect(parseCampaignReport(JSON.parse(await readFile(result.reportFile, 'utf8'))).id).toBe(
			result.report.id
		);
		expect(result.written).toHaveLength(4);
		expect(await readFile(join(out, 'junit.xml'), 'utf8')).toContain('failures="0"');
		expect(JSON.parse(await readFile(join(out, 'results.sarif'), 'utf8')).runs[0].results).toEqual(
			[]
		);

		// Every cell is a run directory a person can open.
		const storage = await createFileStorage(join(out, 'runs'));
		const runs = await storage.listRuns();
		expect(runs).toHaveLength(16);
		for (const cell of result.report.cells) {
			expect(runs.some((run) => run.id === cell.runId)).toBe(true);
			expect(await storage.getRunSummary(cell.runId!)).toBeDefined();
		}
		expect((await readdir(join(out, 'runs', 'runs'))).length).toBe(16);
	});

	it('exits 1 under --strict when a guard is removed from a scenario that expects one', async () => {
		const root = await tmp();
		const campaign = injectionBaseline([1]);
		campaign.guards.find((g) => g.id === 'policy-card')!.fit = [];
		const file = join(root, 'red.json');
		await writeFile(file, JSON.stringify(campaign), 'utf8');
		const out = join(root, 'out');

		const sink = io();
		const code = await main(
			[
				'campaign',
				'--file',
				file,
				'--out',
				out,
				'--strict',
				'--sarif',
				join(out, 'r.sarif'),
				'--no-keep-runs'
			],
			sink
		);
		expect(code).toBe(1);
		expect(sink.out).toContain('❌ FAILED');
		expect(sink.err).toContain('guard-holds:keep-the-secret');
		const sarif = JSON.parse(await readFile(join(out, 'r.sarif'), 'utf8'));
		expect(sarif.runs[0].results).toHaveLength(2);
		// --no-keep-runs: the report is there, the runs are not.
		const entries = await readdir(out);
		expect(entries.some((name) => name.endsWith('.campaign-report.json'))).toBe(true);
		expect(entries).not.toContain('runs');
	});

	it('exits 0 without --strict even when a gate fails, and says so', async () => {
		const root = await tmp();
		const campaign = injectionBaseline([1]);
		campaign.guards.find((g) => g.id === 'blocklist')!.fit = [];
		const file = join(root, 'red.json');
		await writeFile(file, JSON.stringify(campaign), 'utf8');
		const sink = io();
		expect(
			await main(['campaign', '--file', file, '--out', join(root, 'out'), '--no-keep-runs'], sink)
		).toBe(0);
		expect(sink.out).toContain('❌ FAILED');
	});

	it('refuses a live brain whose key is missing, naming the variable, without running scripted cells first', async () => {
		const root = await tmp();
		const campaign = injectionBaseline([1]);
		campaign.brains = [{ id: 'live', tier: 'live', cartridgeId: 'openai/quick-thinker' }];
		campaign.budget = { maxLiveCells: 100 };
		const file = join(root, 'live.json');
		await writeFile(file, JSON.stringify(campaign), 'utf8');
		const result = await runCampaignFile({
			file,
			out: join(root, 'out'),
			keepRuns: false,
			config: defaultConfig(),
			credentials: credentialsFromEnv({})
		});
		// Each live cell errors honestly rather than running a mock under the model's name.
		expect(
			result.report.cells.every((cell) => cell.error?.includes('CRAFTABOT_CREDENTIAL_OPENAI'))
		).toBe(true);
	});
});
