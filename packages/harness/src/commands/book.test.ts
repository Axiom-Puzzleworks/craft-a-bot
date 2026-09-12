import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCampaign } from '@craftabot/evals';
import { afterAll, describe, expect, it } from 'vitest';
import { defaultConfig } from '../config.js';
import { credentialsFromEnv } from '../credentials.js';
import { main } from '../cli.js';
import { bookRun, knobValue, sweepRun, sweptCampaign } from './book.js';

/**
 * WP80 stage C: `craftabot book run` and `craftabot sweep` — a book through
 * two of the lending workflow's configurations, the campaign file written
 * beside the report and runnable again; a knob swept over the builds.
 */
const roots: string[] = [];
async function tempDir(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'craftabot-book-'));
	roots.push(root);
	return root;
}
afterAll(async () => {
	await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe('craftabot book run', { timeout: 300_000 }, () => {
	it('draws the book, runs the configurations named, and writes the campaign beside the report', async () => {
		const root = await tempDir();
		const result = await bookRun({
			workflowId: 'fs-lending/lending',
			seed: 1,
			size: 80,
			configurations: ['rules-only', 'bot-everywhere'],
			brain: 'scripted-optimal',
			out: join(root, 'out'),
			config: defaultConfig(),
			credentials: credentialsFromEnv({}),
			egress: 'none',
			now: () => '2026-09-11T09:00:00.000Z'
		});
		expect(result.report.passed).toBe(true);
		expect(result.report.builds.map((build) => build.configuration)).toEqual([
			'rules-only',
			'bot-everywhere'
		]);
		expect(result.cells).toBeGreaterThan(0);
		expect(result.cells % 2).toBe(0);
		expect(result.report.cells.every((cell) => cell.item?.kind === 'application')).toBe(true);
		expect(result.report.summary?.humanLoad.map((row) => row.build)).toEqual([
			'bot-everywhere',
			'rules-only'
		]);
		const written = parseCampaign(JSON.parse(await readFile(result.campaignFile, 'utf8')));
		expect(written.source).toMatchObject({
			kind: 'book',
			workflowId: 'fs-lending/lending',
			population: { seed: 1, size: 80 }
		});
		expect(written.builds[0]?.overrides?.senses?.length).toBeGreaterThan(0);

		// The sweep, over the campaign the book run wrote.
		const swept = await sweepRun({
			file: result.campaignFile,
			knob: 'referRatioPercent',
			values: ['60', '999'],
			out: join(root, 'sweep'),
			config: defaultConfig(),
			credentials: credentialsFromEnv({}),
			egress: 'none',
			now: () => '2026-09-11T09:00:00.000Z'
		});
		expect(swept.report.builds.map((build) => build.id)).toEqual([
			'rules-only@referRatioPercent=60',
			'rules-only@referRatioPercent=999',
			'bot-everywhere@referRatioPercent=60',
			'bot-everywhere@referRatioPercent=999'
		]);
		expect(swept.report.builds[1]?.knobs).toEqual({ referRatioPercent: 999 });
		expect(swept.cells).toBe(result.cells * 2);
	});

	it('refuses an unknown workflow or configuration', async () => {
		const root = await tempDir();
		const base = {
			seed: 1,
			size: 10,
			brain: 'scripted-optimal' as const,
			out: join(root, 'out'),
			config: defaultConfig(),
			credentials: credentialsFromEnv({})
		};
		await expect(bookRun({ ...base, workflowId: 'fs-lending/none' })).rejects.toThrow(
			"no workflow 'fs-lending/none'"
		);
		await expect(
			bookRun({ ...base, workflowId: 'fs-lending/lending', configurations: ['bot-on-holiday'] })
		).rejects.toThrow("has no configuration 'bot-on-holiday'");
	});

	it('the CLI wants its flags; a knob value reads as a number or a boolean when it is one', async () => {
		const err: string[] = [];
		const io = { stdout: () => {}, stderr: (text: string) => void err.push(text), env: {} };
		expect(await main(['book', 'run', '--workflow', 'x'], io)).toBe(1);
		expect(err.join('')).toContain('book needs run --workflow <id> --population <seed> --size <n>');
		expect(await main(['sweep', '--file', 'x.json'], io)).toBe(1);
		expect(err.join('')).toContain('sweep needs --file');
		expect(knobValue('60')).toBe(60);
		expect(knobValue('true')).toBe(true);
		expect(knobValue('approve')).toBe('approve');
		const campaign = parseCampaign({
			schemaVersion: 1,
			id: 'c',
			title: 'c',
			scenarios: [{ id: 's', goalCardId: 'starter/say-hello' }],
			builds: [{ id: 'b', base: { kind: 'starter-default' } }],
			guards: [{ id: 'none', fit: [] }],
			brains: [{ id: 'scripted-optimal', tier: 'scripted-optimal' }],
			seeds: [1],
			gates: [{ id: 'g', require: { kind: 'outcome-rate', outcome: 'SUCCESS', atLeast: 0 } }]
		});
		expect(
			sweptCampaign(campaign, 'k', ['1', 'x']).builds.map((build) => [
				build.id,
				build.overrides?.knobs
			])
		).toEqual([
			['b@k=1', { k: 1 }],
			['b@k=x', { k: 'x' }]
		]);
	});
});
