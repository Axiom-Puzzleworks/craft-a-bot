import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { makeRun } from '@craftabot/core/testing';
import { otelTraceFor } from '@craftabot/telemetry';
import { main } from '../cli.js';
import { credentialsFromEnv } from '../credentials.js';
import { createFileStorage } from '../storage/file-storage.js';
import { snackbotKit } from '../testing/kit-fixture.js';
import { exportRun } from './export.js';

/**
 * **`craftabot export`, `run --sink`, and a campaign's sinks** (`35-…` §6
 * stage B DoD): the collector is an in-process `node:http` server that
 * records every body it is sent; the spans it receives match the mapping
 * the Audit Centre downloads.
 */

const roots: string[] = [];
async function tmp(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'craftabot-export-'));
	roots.push(root);
	return root;
}
const servers: Server[] = [];
afterAll(async () => {
	for (const server of servers) server.close();
	for (const root of roots) await rm(root, { recursive: true, force: true });
});

function collector(status = 200): Promise<{ url: string; bodies: unknown[]; auth: string[] }> {
	const bodies: unknown[] = [];
	const auth: string[] = [];
	return new Promise((resolve) => {
		const server = createServer((request, response) => {
			let text = '';
			request.on('data', (chunk) => (text += chunk));
			request.on('end', () => {
				if (request.url === '/v1/traces') {
					bodies.push(JSON.parse(text));
					auth.push(request.headers.authorization ?? '');
				}
				response.statusCode = status;
				response.end('{}');
			});
		});
		servers.push(server);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			const port = typeof address === 'object' && address ? address.port : 0;
			resolve({ url: `http://127.0.0.1:${port}`, bodies, auth });
		});
	});
}

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

describe('craftabot export (WP47)', () => {
	it('sends a stored run to an OTLP collector, and the received spans are the mapping', async () => {
		const root = await tmp();
		const storage = await createFileStorage(join(root, 'runs'));
		const run = makeRun();
		await storage.putRun(run);
		const { url, bodies, auth } = await collector();
		const result = await exportRun({
			storage,
			runId: run.id,
			sinkId: 'telemetry/otlp-http',
			sinkConfig: JSON.stringify({ url }),
			credentials: credentialsFromEnv({ CRAFTABOT_CREDENTIAL_TELEMETRY_OTLP_HTTP: 'tok' })
		});
		expect(result).toEqual({ ok: true, sent: 1 });
		expect(bodies).toEqual([otelTraceFor(run, [])]);
		expect(auth).toEqual(['Bearer tok']);
	});

	it('a collector that refuses is { ok: false }, and the CLI exits 1 with the reason', async () => {
		const root = await tmp();
		const out = join(root, 'runs');
		const storage = await createFileStorage(out);
		const run = makeRun();
		await storage.putRun(run);
		const { url } = await collector(503);
		const sink = io();
		expect(
			await main(
				[
					'export',
					'--run',
					run.id,
					'--sink',
					'telemetry/otlp-http',
					'--sink-config',
					JSON.stringify({ url }),
					'--out',
					out
				],
				sink
			)
		).toBe(1);
		expect(sink.err).toContain('collector answered 503');
		// A sink no one ships, and a config that is not JSON, are named.
		await expect(
			exportRun({
				storage,
				runId: run.id,
				sinkId: 'vendor/nope',
				credentials: credentialsFromEnv({})
			})
		).rejects.toThrow(/unknown sink/);
		await expect(
			exportRun({
				storage,
				runId: run.id,
				sinkId: 'telemetry/file',
				sinkConfig: 'not json',
				credentials: credentialsFromEnv({})
			})
		).rejects.toThrow(/not JSON/);
	});

	it('the file sink writes the run and its events as JSONL', async () => {
		const root = await tmp();
		const storage = await createFileStorage(join(root, 'runs'));
		const run = makeRun();
		await storage.putRun(run);
		const path = join(root, 'out', 'trace.jsonl');
		const sink = io();
		expect(
			await main(
				[
					'export',
					'--run',
					run.id,
					'--sink',
					'telemetry/file',
					'--sink-config',
					JSON.stringify({ path }),
					'--out',
					join(root, 'runs')
				],
				sink
			)
		).toBe(0);
		expect(sink.out).toContain('exported run');
		const lines = (await readFile(path, 'utf8')).trim().split('\n');
		expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({ kind: 'run', record: { id: run.id } });
	});
});

describe('a live run and a campaign with sinks (WP47)', () => {
	it('run --sink streams to the collector and reports what the sink counted; a dead collector never touches the run', async () => {
		const root = await tmp();
		const kit = join(root, 'bot.craftabot.json');
		const built = io();
		await writeFile(kit, JSON.stringify(snackbotKit(), null, '	'), 'utf8');
		const live = await collector();
		expect(
			await main(
				[
					'run',
					'--kit',
					kit,
					'--out',
					join(root, 'runs'),
					'--sink',
					'telemetry/otlp-http',
					'--sink-config',
					JSON.stringify({ url: live.url, batchSize: 3, flushAfterMs: 50 })
				],
				built
			)
		).toBe(0);
		expect(built.out).toMatch(/sink\s+telemetry\/otlp-http: sent \d+, failed 0/);
		expect(live.bodies.length).toBeGreaterThan(0);

		const dead = await collector(500);
		const second = io();
		expect(
			await main(
				[
					'run',
					'--kit',
					kit,
					'--out',
					join(root, 'runs2'),
					'--sink',
					'telemetry/otlp-http',
					'--sink-config',
					JSON.stringify({ url: dead.url })
				],
				second
			)
		).toBe(0);
		expect(second.out).toMatch(/outcome\s+SUCCESS/);
		expect(second.out).toMatch(/failed [1-9]/);
	});

	it('a campaign file names sinks, and every cell is exported to each', async () => {
		const root = await tmp();
		const path = join(root, 'cells.jsonl');
		const campaign = join(root, 'campaign.json');
		await writeFile(
			campaign,
			JSON.stringify({
				schemaVersion: 1,
				id: 'sinks',
				title: 'Sinks',
				scenarios: [{ id: 'hello', goalCardId: 'starter/say-hello' }],
				builds: [{ id: 'default', base: { kind: 'starter-default' } }],
				guards: [{ id: 'none' }],
				brains: [{ id: 'optimal', tier: 'scripted-optimal' }],
				seeds: [1, 2],
				sinks: [{ id: 'telemetry/file', config: { path } }],
				gates: [{ id: 'any', require: { kind: 'outcome-rate', outcome: 'SUCCESS', atMost: 1 } }]
			}),
			'utf8'
		);
		const sink = io();
		expect(
			await main(
				['campaign', '--file', campaign, '--out', join(root, 'out'), '--no-keep-runs'],
				sink
			)
		).toBe(0);
		const lines = (await readFile(path, 'utf8')).trim().split('\n');
		const runs = lines.map((line) => JSON.parse(line)).filter((row) => row.kind === 'run');
		expect(runs).toHaveLength(2);
	});
});
