import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { evalFixtures } from '@craftabot/pack-geap';
import { main } from '../cli.js';
import { createRegistry, defaultConfig } from '../config.js';
import { credentialsFromEnv } from '../credentials.js';
import { createFileStorage } from '../storage/file-storage.js';
import { snackbotKit } from '../testing/kit-fixture.js';
import { evaluateRun } from './evaluate.js';

/**
 * A hosted evaluator from the harness (WP51, `39-…` §4.3): live with the
 * battery, a project and a network; offline — and saying so on the record —
 * without any one of the three.
 */
const roots: string[] = [];
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

async function storedRun() {
	const root = await mkdtemp(join(tmpdir(), 'craftabot-evaluate-hosted-'));
	roots.push(root);
	const kitPath = join(root, 'bot.craftabot.json');
	await writeFile(kitPath, JSON.stringify(snackbotKit()), 'utf8');
	const out = join(root, 'runs');
	expect(await main(['run', '--kit', kitPath, '--out', out], io())).toBe(0);
	const storage = await createFileStorage(out);
	const [run] = await storage.listRuns();
	if (!run) throw new Error('no run stored');
	return { out, storage, runId: run.id };
}

const TOKEN = 'ya29.harness-test-token';
const config = { projectId: 'proj-1', location: 'europe-west2' };

function answering(seen: { url?: string; authorization?: string | undefined; calls: number }) {
	return (async (url: string | URL | Request, init?: RequestInit) => {
		seen.calls += 1;
		seen.url = String(url);
		seen.authorization = (init?.headers as Record<string, string>)['authorization'];
		return new Response(JSON.stringify(evalFixtures['safety-safe']), {
			status: 200,
			headers: { 'content-type': 'application/json' }
		});
	}) as typeof globalThis.fetch;
}

describe('craftabot evaluate with geap/eval/*', () => {
	it('scores a stored run live with the battery and a project, recording the call', async () => {
		const { storage, runId } = await storedRun();
		const seen = { calls: 0 } as {
			url?: string;
			authorization?: string | undefined;
			calls: number;
		};
		const report = await evaluateRun(storage, createRegistry(defaultConfig()), runId, {
			credentials: credentialsFromEnv({ CRAFTABOT_CREDENTIAL_GEAP: TOKEN }),
			evaluatorIds: ['geap/eval/safety'],
			configs: { 'geap/eval/safety': config },
			fetch: answering(seen)
		});
		expect(seen.calls).toBe(1);
		expect(seen.url).toBe(
			'https://europe-west2-aiplatform.googleapis.com/v1/projects/proj-1/locations/europe-west2:evaluateInstances'
		);
		expect(seen.authorization).toBe(`Bearer ${TOKEN}`);
		const [record] = report.records;
		expect(record?.result).toMatchObject({
			verdict: 'pass',
			score: 1,
			external: { service: 'geap/evaluation', outcome: 'ok', policyRef: 'safety' }
		});
		expect(JSON.stringify(record)).not.toContain(TOKEN);
		expect((await storage.listEvaluations(runId)).map((row) => row.evaluatorId)).toEqual([
			'geap/eval/safety'
		]);
	});

	it('runs offline without the battery, without a project, or under --egress none', async () => {
		const { out, storage, runId } = await storedRun();
		const seen = { calls: 0 } as { calls: number };
		const registry = createRegistry(defaultConfig());
		const noBattery = await evaluateRun(storage, registry, runId, {
			credentials: credentialsFromEnv({}),
			evaluatorIds: ['geap/eval/fulfillment'],
			configs: { 'geap/eval/fulfillment': config },
			fetch: answering(seen)
		});
		expect(noBattery.records[0]?.result).toMatchObject({
			verdict: 'inconclusive',
			external: { outcome: 'offline' }
		});
		const noProject = await evaluateRun(storage, registry, runId, {
			credentials: credentialsFromEnv({ CRAFTABOT_CREDENTIAL_GEAP: TOKEN }),
			evaluatorIds: ['geap/eval/fulfillment'],
			fetch: answering(seen)
		});
		expect(noProject.records[0]?.result.external?.outcome).toBe('offline');
		expect(seen.calls).toBe(0);

		// The CLI: --project and the credential, but --egress none — nothing leaves.
		const sink = io({ CRAFTABOT_CREDENTIAL_GEAP: TOKEN });
		expect(
			await main(
				[
					'evaluate',
					'--run',
					runId,
					'--out',
					out,
					'--evaluators',
					'geap/eval/safety',
					'--project',
					'proj-1',
					'--egress',
					'none'
				],
				sink
			)
		).toBe(0);
		expect(sink.out).toContain('inconclusive');
		expect(sink.out).toContain('geap/eval/safety');
	});
});
