import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { injectionBaseline, parseCampaignReport, type CampaignReport } from '@craftabot/evals';
import { adviceBaseline } from '@craftabot/pack-fs-advice';
import { fraudBaseline } from '@craftabot/pack-fs-fraud';
import { lendingBaseline } from '@craftabot/pack-fs-lending';
import { main } from '../cli.js';
import { defaultConfig } from '../config.js';
import { credentialsFromEnv } from '../credentials.js';
import { runCampaignFile } from './campaign.js';
import { mergeCampaignReports, mergeReports } from './merge.js';

/**
 * The harness at scale (WP68, `57-HARNESS-AT-SCALE.md` §11 items 1–2):
 * `--jobs 4` produces the same bytes as `--jobs 1` — over the injection
 * baseline and the three desk baselines — because the runner places every
 * cell by its ordinal and a cell's ids depend on its position alone; a
 * `--shard` set merged equals the whole; a merge of different campaigns,
 * overlapping shards or one over the budget is refused.
 */
const roots: string[] = [];
async function tmp(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'craftabot-scale-'));
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

async function campaignFile(root: string, name: string, campaign: unknown): Promise<string> {
	const file = join(root, `${name}.json`);
	await writeFile(file, JSON.stringify(campaign), 'utf8');
	return file;
}

async function run(
	file: string,
	out: string,
	extra: Partial<Parameters<typeof runCampaignFile>[0]> = {}
): Promise<CampaignReport> {
	const { report } = await runCampaignFile({
		file,
		out,
		keepRuns: false,
		config,
		credentials,
		principal: { kind: 'service', id: 'craftabot-harness', name: 'ci' },
		egress: 'none',
		now: clock(),
		newId: ids(),
		...extra
	});
	return report;
}

/** A report with its stamp and id struck out, for equality across runs that were pinned the same. */
const bytes = (report: CampaignReport): string => JSON.stringify(report);

describe('--jobs (WP68)', () => {
	it(
		'four workers produce the same bytes as one lane, over the injection baseline and the three desk baselines',
		{ timeout: 240_000 },
		async () => {
			const root = await tmp();
			const campaigns: Array<[string, unknown]> = [
				['injection', injectionBaseline([1, 2])],
				['advice', adviceBaseline({ seeds: [1] })],
				['fraud', fraudBaseline({ seeds: [1] })],
				['lending', lendingBaseline({ seeds: [1] })]
			];
			for (const [name, campaign] of campaigns) {
				const file = await campaignFile(root, name, campaign);
				const one = await run(file, join(root, `${name}-1`), { jobs: 1 });
				const four = await run(file, join(root, `${name}-4`), { jobs: 4 });
				expect(four.cells.length, name).toBe(one.cells.length);
				expect(
					four.cells.every((cell) => cell.error === undefined),
					name
				).toBe(true);
				expect(bytes(four), name).toBe(bytes(one));
			}
		}
	);
});

describe('--shard and craftabot merge (WP68)', () => {
	it(
		'three shards merged equal the whole; every cell carries its ordinal',
		{ timeout: 120_000 },
		async () => {
			const root = await tmp();
			const file = await campaignFile(root, 'injection', injectionBaseline([1, 2]));
			const whole = await run(file, join(root, 'whole'));
			expect(whole.shard).toBeUndefined();
			expect(whole.cells.map((cell) => cell.ordinal)).toEqual(whole.cells.map((_cell, i) => i));

			const shards: CampaignReport[] = [];
			for (let index = 1; index <= 3; index += 1) {
				const shard = await run(file, join(root, `shard-${index}`), {
					shard: { index, of: 3 },
					jobs: 2
				});
				expect(shard.shard).toEqual({ index, of: 3 });
				expect(shard.cells.every((cell) => (cell.ordinal as number) % 3 === index - 1)).toBe(true);
				shards.push(shard);
			}
			expect(shards.reduce((n, shard) => n + shard.cells.length, 0)).toBe(whole.cells.length);

			// The fold, in a different order than the shards ran, gives the whole back.
			const { report: merged, reportFile } = await mergeReports({
				file,
				reports: await Promise.all(
					[shards[2], shards[0], shards[1]].map(async (shard, i) => {
						const path = join(root, `report-${i}.json`);
						await writeFile(path, JSON.stringify(shard), 'utf8');
						return path;
					})
				),
				out: join(root, 'merged'),
				markdown: join(root, 'merged', 'scorecard.md'),
				config,
				now: clock(),
				newId: ids()
			});
			expect(merged.shard).toBeUndefined();
			expect(merged.cells).toEqual(whole.cells);
			expect(merged.gates).toEqual(whole.gates);
			expect(merged.summary).toEqual(whole.summary);
			expect(merged.budget).toEqual(whole.budget);
			expect(merged.passed).toBe(whole.passed);
			expect(parseCampaignReport(JSON.parse(await readFile(reportFile, 'utf8'))).id).toBe(
				merged.id
			);
			expect(await readFile(join(root, 'merged', 'scorecard.md'), 'utf8')).toContain(
				'Campaign scorecard'
			);
		}
	);

	it('refuses reports of different campaigns, overlapping shards, and a fold over the budget', async () => {
		const root = await tmp();
		const file = await campaignFile(root, 'injection', injectionBaseline([1]));
		const whole = await run(file, join(root, 'whole'));
		const semantics = () => undefined;
		const campaign = JSON.parse(await readFile(file, 'utf8')) as Parameters<
			typeof mergeCampaignReports
		>[0];
		const { parseCampaign } = await import('@craftabot/evals');
		const parsed = parseCampaign(campaign);
		const merge = (reports: CampaignReport[], over = parsed) =>
			mergeCampaignReports(over, reports, { semantics, packVersions: {} });

		expect(merge([whole]).cells).toEqual(whole.cells);
		expect(() => merge([whole, whole])).toThrow(/overlap/);
		expect(() => merge([{ ...whole, campaignId: 'someone-else' }])).toThrow(/of campaign/);
		expect(() => merge([{ ...whole, budget: { ...whole.budget, liveCells: 3 } }])).toThrow(
			/no budget/
		);
		const budgeted = parseCampaign({ ...campaign, budget: { maxLiveCells: 2 } });
		expect(() =>
			merge([{ ...whole, budget: { ...whole.budget, liveCells: 3 } }], budgeted)
		).toThrow(/allows 2/);
		expect(
			merge([{ ...whole, budget: { ...whole.budget, liveCells: 2 } }], budgeted).budget.liveCells
		).toBe(2);
		const noOrdinal = {
			...whole,
			cells: whole.cells.map((cell) =>
				Object.fromEntries(Object.entries(cell).filter(([key]) => key !== 'ordinal'))
			)
		};
		expect(() => merge([noOrdinal as CampaignReport])).toThrow(/no ordinal/);
	});

	it('the CLI: --shard marks the report, --seeds replaces the seeds, merge folds positional reports', async () => {
		const root = await tmp();
		const file = await campaignFile(root, 'injection', injectionBaseline([1]));
		const sink = {
			out: '',
			err: '',
			env: {},
			stdout: (t: string) => void (sink.out += t),
			stderr: (t: string) => void (sink.err += t)
		};
		expect(
			await main(
				[
					'campaign',
					'--file',
					file,
					'--out',
					join(root, 'a'),
					'--shard',
					'1/2',
					'--seeds',
					'3-4',
					'--no-keep-runs',
					'--egress',
					'none'
				],
				sink
			)
		).toBe(0);
		expect(sink.out).toContain('shard 1/2');
		expect(
			await main(
				[
					'campaign',
					'--file',
					file,
					'--out',
					join(root, 'b'),
					'--shard',
					'2/2',
					'--seeds',
					'3-4',
					'--no-keep-runs',
					'--egress',
					'none'
				],
				sink
			)
		).toBe(0);
		const { readdir } = await import('node:fs/promises');
		const reports = await Promise.all(
			['a', 'b'].map(async (dir) => {
				const name =
					(await readdir(join(root, dir))).find((entry) =>
						entry.endsWith('.campaign-report.json')
					) ?? '';
				return join(root, dir, name);
			})
		);
		const merged = {
			out: '',
			err: '',
			env: {},
			stdout: (t: string) => void (merged.out += t),
			stderr: (t: string) => void (merged.err += t)
		};
		expect(
			await main(['merge', '--file', file, '--out', join(root, 'm'), ...reports], merged)
		).toBe(0);
		expect(merged.out).toContain('merged 2 reports');
		// Two seeds, 32 cells a seed on this baseline.
		expect(merged.out).toContain('64 cells');
		expect(await main(['merge', '--out', join(root, 'm')], merged)).toBe(1);
		expect(merged.err).toContain('--file');
	});
});
