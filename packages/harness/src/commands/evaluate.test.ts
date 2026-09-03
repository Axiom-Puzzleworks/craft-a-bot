import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseTraceFile } from '@craftabot/core';
import { main } from '../cli.js';
import { createFileStorage } from '../storage/file-storage.js';
import { snackbotKit } from '../testing/kit-fixture.js';

/**
 * `craftabot evaluate` (`31-EVALUATORS.md` §4.4, WP43 stage D): evaluators
 * over a stored run, records beside it, carried by `bundle`.
 */

const roots: string[] = [];
async function tmp(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'craftabot-evaluate-'));
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

async function storedRun(root: string): Promise<string> {
	const kitPath = join(root, 'bot.craftabot.json');
	await writeFile(kitPath, JSON.stringify(snackbotKit(), null, '\t'), 'utf8');
	const out = join(root, 'runs');
	expect(await main(['run', '--kit', kitPath, '--out', out], io())).toBe(0);
	const storage = await createFileStorage(out);
	const [run] = await storage.listRuns();
	if (!run) throw new Error('no run stored');
	return run.id;
}

describe('craftabot evaluate', () => {
	it('runs every deterministic evaluator by default, writes the records, and bundle carries them', async () => {
		const root = await tmp();
		const runId = await storedRun(root);
		const out = join(root, 'runs');
		const sink = io();
		expect(await main(['evaluate', '--run', runId, '--out', out], sink)).toBe(0);
		expect(sink.out).toContain(`evaluated ${runId}`);
		expect(sink.out).toContain('starter/testbench/no-secrets-out-loud');

		const storage = await createFileStorage(out);
		const records = await storage.listEvaluations(runId);
		expect(records.length).toBeGreaterThanOrEqual(5);
		expect(records.every((record) => record.result.verdict !== undefined)).toBe(true);

		const file = join(root, 'bundle.json');
		expect(await main(['bundle', '--run', runId, '--out', out, '--file', file], io())).toBe(0);
		const trace = parseTraceFile(JSON.parse(await readFile(file, 'utf8')));
		expect(trace.evaluations?.map((record) => record.evaluatorId)).toEqual(
			records.map((record) => record.evaluatorId)
		);
	});

	it('runs named evaluators, the judge offline without a key, and exits 1 on an unknown id', async () => {
		const root = await tmp();
		const runId = await storedRun(root);
		const out = join(root, 'runs');
		const sink = io();
		expect(
			await main(
				[
					'evaluate',
					'--run',
					runId,
					'--out',
					out,
					'--evaluators',
					'evals/judge/rubric,nobody/knows',
					'--rubric',
					'Was it good?'
				],
				sink
			)
		).toBe(1);
		expect(sink.out).toContain('inconclusive  evals/judge/rubric');
		expect(sink.out).toContain('unknown evaluators: nobody/knows');
		const storage = await createFileStorage(out);
		expect((await storage.listEvaluations(runId)).map((r) => r.evaluatorId)).toEqual([
			'evals/judge/rubric'
		]);
	});

	it('refuses without --run', async () => {
		const sink = io();
		expect(await main(['evaluate'], sink)).toBe(1);
		expect(sink.err).toContain('evaluate needs --run');
	});
});
