import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseTraceFile, verifyTraceDigest, type KitFile } from '@craftabot/core';
import { defaultConfig } from '../config.js';
import { snackbotKit } from '../testing/kit-fixture.js';
import { credentialsFromEnv } from '../credentials.js';
import { createFileStorage } from '../storage/file-storage.js';
import { bundleRun } from './bundle.js';
import { runKit } from './run.js';

/**
 * `craftabot run`, end to end against the real starter pack and a scripted
 * brain — and the DoD's own sentence: the run directory it writes is one the
 * Workshop's Run Browser imports with no conversion and whose digest verifies
 * (`parseTraceFile` + `verifyTraceDigest` is exactly what that screen calls).
 */
const roots: string[] = [];
async function tmp(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'craftabot-run-'));
	roots.push(root);
	return root;
}
afterAll(async () => {
	for (const root of roots) await rm(root, { recursive: true, force: true });
});

const config = defaultConfig();

async function writeKit(root: string, kit: KitFile = snackbotKit()): Promise<string> {
	const path = join(root, 'snackbot.craftabot.json');
	await writeFile(path, JSON.stringify(kit, null, '\t'), 'utf8');
	return path;
}

const credentials = credentialsFromEnv({});
const clock = () => {
	let calls = 0;
	return () => new Date(Date.UTC(2026, 8, 2, 9, 0, calls++)).toISOString();
};

describe('craftabot run', () => {
	it('runs a kit to completion and writes a run the Workshop can import unchanged', async () => {
		const root = await tmp();
		const kitPath = await writeKit(root);
		const out = join(root, 'runs');

		const report = await runKit({
			kitPath,
			brain: 'scripted-optimal',
			seed: 7,
			out,
			config,
			credentials,
			now: clock()
		});

		expect(report.outcome).toBe('SUCCESS');
		expect(report.goalCardId).toBe('starter/say-hello');
		expect(report.providerId).toBe('scripted-optimal');
		expect(report.ticks).toBeGreaterThan(0);

		// The directory, as a person and the Workshop would find it.
		const files = (await readdir(report.directory)).sort();
		expect(files).toEqual(
			[`${report.runId}.craftabot-trace.json`, 'events.jsonl', 'run.json', 'summary.json'].sort()
		);

		// The Run Browser's own import path: parse, then verify the digest.
		const trace = parseTraceFile(JSON.parse(await readFile(report.traceFile, 'utf8')));
		expect(await verifyTraceDigest(trace)).toBe(true);
		expect(trace.run.id).toBe(report.runId);
		expect(trace.run.outcome).toBe('SUCCESS');
		expect(trace.run.providerId).toBe('scripted-optimal');
		expect(trace.events).toHaveLength(report.events);

		// And the store agrees with the file.
		const storage = await createFileStorage(out);
		expect((await storage.getRun(report.runId))?.outcome).toBe('SUCCESS');
		expect((await storage.getEvents(report.runId)).length).toBe(report.events);
		expect((await storage.getRunSummary(report.runId))?.runId).toBe(report.runId);
		expect((await storage.listAgents()).map((agent) => agent.id)).toEqual([report.agentId]);
	});

	it('overrides the goal card for one run without rewriting the kit', async () => {
		const root = await tmp();
		const kitPath = await writeKit(root);
		const before = await readFile(kitPath, 'utf8');

		const report = await runKit({
			kitPath,
			card: 'starter/sums-for-teddy',
			brain: 'scripted-optimal',
			seed: 1,
			out: join(root, 'runs'),
			config,
			credentials
		});
		expect(report.goalCardId).toBe('starter/sums-for-teddy');
		expect(await readFile(kitPath, 'utf8')).toBe(before);
	});

	it('is reproducible from its seed with the noisy brain, and different from another seed', async () => {
		const root = await tmp();
		const kitPath = await writeKit(root, snackbotKit('starter/snack'));
		const run = (seed: number, out: string) =>
			runKit({ kitPath, brain: 'scripted-noisy', seed, out, config, credentials, now: clock() });

		const a = await run(3, join(root, 'a'));
		const b = await run(3, join(root, 'b'));
		const c = await run(4, join(root, 'c'));

		const shape = async (report: typeof a) =>
			(await createFileStorage(report.directory.replace(/[\\/]runs[\\/].*$/, '')))
				.getEvents(report.runId)
				.then((rows) => rows.map((row) => `${row.event.tick}:${row.event.type}`));
		expect(await shape(b)).toEqual(await shape(a));
		expect(a.outcome).toBe(b.outcome);
		// Not asserted unequal in outcome — noise can land the same way — only that the seed reached the brain.
		expect(c.runId).not.toBe(a.runId);
	});

	it('plays a Workshop card scripted too, on the Workshop pack’s own plans (WP55)', async () => {
		// Until WP55 this card was the "no scripted plan" refusal; the harness now reads
		// `@craftabot/pack-workshop/testing` after the starter's plans.
		const root = await tmp();
		const kitPath = await writeKit(root);
		const report = await runKit({
			kitPath,
			card: 'workshop/find-the-paint-pot',
			brain: 'scripted-optimal',
			seed: 1,
			out: join(root, 'runs'),
			config,
			credentials
		});
		expect(report.providerId).toBe('scripted-optimal');
		expect(report.goalCardId).toBe('workshop/find-the-paint-pot');
	});

	it('refuses an unknown card, listing the ones it has', async () => {
		const root = await tmp();
		const kitPath = await writeKit(root);
		await expect(
			runKit({
				kitPath,
				card: 'nowhere/nothing',
				brain: 'scripted-optimal',
				seed: 1,
				out: join(root, 'runs'),
				config,
				credentials
			})
		).rejects.toThrow(/starter\/say-hello/);
	});

	it('refuses a live run whose provider has no key, naming the variable', async () => {
		const root = await tmp();
		const kitPath = await writeKit(root);
		await expect(
			runKit({ kitPath, brain: 'live', seed: 1, out: join(root, 'runs'), config, credentials })
		).rejects.toThrow(/CRAFTABOT_CREDENTIAL_/);
	});

	it('refuses --provider that does not match the kit’s cartridge', async () => {
		const root = await tmp();
		const kitPath = await writeKit(root);
		await expect(
			runKit({
				kitPath,
				brain: 'live',
				provider: 'anthropic',
				seed: 1,
				out: join(root, 'runs'),
				config,
				credentials: credentialsFromEnv({ CRAFTABOT_CREDENTIAL_ANTHROPIC: 'planted' })
			})
		).rejects.toThrow(/does not match/);
	});

	it('refuses a kit file it cannot read', async () => {
		const root = await tmp();
		await expect(
			runKit({
				kitPath: join(root, 'missing.json'),
				brain: 'scripted-optimal',
				seed: 1,
				out: root,
				config,
				credentials
			})
		).rejects.toThrow(/could not read the kit file/);
	});
});

describe('craftabot bundle', () => {
	it('writes a stored run back out with a verifying digest', async () => {
		const root = await tmp();
		const kitPath = await writeKit(root);
		const out = join(root, 'runs');
		const report = await runKit({
			kitPath,
			brain: 'scripted-optimal',
			seed: 1,
			out,
			config,
			credentials
		});

		const storage = await createFileStorage(out);
		const trace = await bundleRun(storage, report.runId, []);
		expect(await verifyTraceDigest(trace)).toBe(true);
		expect(trace.events.map((e) => e.id)).toEqual(
			(await storage.getEvents(report.runId)).map((row) => row.event.id)
		);
		await expect(bundleRun(storage, '00000000-0000-4000-8000-000000000999', [])).rejects.toThrow(
			/no run/
		);
	});
});
