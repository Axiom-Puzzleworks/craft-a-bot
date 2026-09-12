import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseExperimentResult } from '@craftabot/core';
import { afterAll, describe, expect, it } from 'vitest';
import { defaultConfig } from '../config.js';
import { credentialsFromEnv } from '../credentials.js';
import { main } from '../cli.js';
import { experimentAnalyse, experimentRender, experimentRun } from './experiment.js';

/**
 * WP89 stage B: `craftabot experiment run | analyse | render` — a tiny
 * two-configuration design over a small lending book, end to end: two
 * campaigns written and run, the reports kept under their campaign ids, the
 * result with its digest and its markdown, re-folded by `analyse` from the
 * files alone and rendered by `render`.
 */
const roots: string[] = [];
async function tempDir(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'craftabot-experiment-'));
	roots.push(root);
	return root;
}
afterAll(async () => {
	await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

const DESIGN = {
	schemaVersion: 1,
	id: 'human-oversight-tiny',
	title: 'Level 3 against Level 5 on a small loan book',
	hypothesis: 'Moving the journey from rules-only to bot-everywhere changes the success rate.',
	controls: ['fs-lending/four-eyes'],
	obligations: ['fca:conc:affordability'],
	design: {
		template: {
			scenarios: [],
			source: { kind: 'book', workflowId: 'fs-lending/lending', population: { seed: 1, size: 40 } },
			builds: [
				{
					id: 'bot',
					base: { kind: 'starter-default' },
					overrides: {
						senses: ['read-case-file', 'read-transcript'],
						actions: [
							'decide',
							'explain',
							'say',
							'run-affordability-check',
							'ask-for-document',
							'refer'
						]
					}
				}
			],
			guards: [{ id: 'none', fit: [] }],
			brains: [{ id: 'scripted-optimal', tier: 'scripted-optimal' }]
		},
		factors: [{ axis: 'executors', levels: ['rules-only', 'bot-everywhere'] }],
		baseline: { executors: 'rules-only' },
		metrics: [
			{ kind: 'outcome-rate', id: 'success', outcome: 'SUCCESS', direction: 'higher-is-better' },
			{ kind: 'cost', id: 'tokens', of: 'tokens', direction: 'lower-is-better' }
		],
		seeds: [1]
	}
};

describe('craftabot experiment', { timeout: 300_000 }, () => {
	it('runs a two-level design end to end, analyses the files again, and renders the result', async () => {
		const root = await tempDir();
		const file = join(root, 'design.json');
		await writeFile(file, JSON.stringify(DESIGN), 'utf8');
		const out = join(root, 'out');
		const ran = await experimentRun({
			file,
			out,
			config: defaultConfig(),
			credentials: credentialsFromEnv({}),
			egress: 'none',
			now: () => '2026-09-11T09:00:00.000Z'
		});
		expect(ran.experiment.campaigns).toEqual([
			'human-oversight-tiny--executors=rules-only',
			'human-oversight-tiny--executors=bot-everywhere'
		]);
		expect(ran.campaignFiles).toHaveLength(2);
		expect(ran.cells).toBeGreaterThan(0);
		expect(ran.result.effects.map((effect) => effect.metricId)).toEqual(['success', 'tokens']);
		expect(ran.result.effects[0]?.factor).toEqual({
			axis: 'executors',
			baseline: 'rules-only',
			treatment: 'bot-everywhere'
		});
		expect(ran.result.effects[0]?.baseline.n).toBe(ran.cells / 2);
		expect(['supported', 'not-supported', 'inconclusive']).toContain(ran.result.verdict);
		const stored = parseExperimentResult(JSON.parse(await readFile(ran.resultFile, 'utf8')));
		expect(stored.digest).toBe(ran.result.digest);
		expect(await readFile(ran.markdownFile, 'utf8')).toContain('## success');

		const folded = await experimentAnalyse({ file, out, now: () => '2026-09-11T10:00:00.000Z' });
		expect(folded.reportFiles).toHaveLength(2);
		expect(folded.result.effects).toEqual(ran.result.effects);
		expect(folded.result.id).toBe('human-oversight-tiny@2026-09-11T10:00:00.000Z');

		expect(await experimentRender(ran.resultFile)).toContain('**Verdict:');

		const lines: string[] = [];
		const code = await main(['experiment', 'render', '--result', ran.resultFile], {
			stdout: (line) => lines.push(line),
			stderr: () => undefined,
			env: {}
		});
		expect(code).toBe(0);
		expect(lines.join('\n')).toContain('Level 3 against Level 5');
	});

	it('refuses a missing verb and a missing file', async () => {
		const errors: string[] = [];
		const code = await main(['experiment', 'run'], {
			stdout: () => undefined,
			stderr: (line) => errors.push(line),
			env: {}
		});
		expect(code).not.toBe(0);
		expect(errors.join('\n')).toContain('experiment needs run --file');
	});
});
