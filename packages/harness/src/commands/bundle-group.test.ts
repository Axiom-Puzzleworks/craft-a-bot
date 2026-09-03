import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseTraceBundle, verifyBundleDigest } from '@craftabot/core';
import { makeEvent, makeGroupRun, makeRun } from '@craftabot/core/testing';
import { main } from '../cli.js';
import { createFileStorage } from '../storage/file-storage.js';
import { bundleGroup } from './bundle.js';

const roots: string[] = [];
async function tmp(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'craftabot-bundle-group-'));
	roots.push(root);
	return root;
}
afterAll(async () => {
	for (const root of roots) await rm(root, { recursive: true, force: true });
});

function io() {
	const sink = {
		out: '',
		err: '',
		env: {} as NodeJS.ProcessEnv,
		stdout: (t: string) => void (sink.out += t),
		stderr: (t: string) => void (sink.err += t)
	};
	return sink;
}

describe('craftabot bundle --group (WP48)', () => {
	it('writes a group episode as one bundle that verifies, and names an episode it cannot find', async () => {
		const root = await tmp();
		const storage = await createFileStorage(join(root, 'runs'));
		const group = makeGroupRun();
		const [aId, bId] = group.memberRunIds as [string, string];
		await storage.putGroupRun(group);
		await storage.putRun(makeRun({ id: aId, agentName: 'Robo', groupRunId: group.id }));
		await storage.putRun(makeRun({ id: bId, agentName: 'Bolt', groupRunId: group.id }));
		await storage.appendEvents(aId, [makeEvent(aId, 1, 1)]);
		await storage.appendEvents(bId, [makeEvent(bId, 1, 2)]);
		await storage.appendEvents(group.id, [makeEvent(aId, 1, 1), makeEvent(bId, 1, 2)]);

		const bundle = await bundleGroup(storage, group.id, []);
		expect(bundle.runs.map((trace) => trace.run.agentName)).toEqual(['Robo', 'Bolt']);
		expect(await verifyBundleDigest(bundle)).toBe(true);

		const file = join(root, 'episode.craftabot-bundle.json');
		const sink = io();
		expect(
			await main(['bundle', '--group', group.id, '--out', join(root, 'runs'), '--file', file], sink)
		).toBe(0);
		const written = parseTraceBundle(JSON.parse(await readFile(file, 'utf8')));
		expect(await verifyBundleDigest(written)).toBe(true);
		expect(written.group?.record.id).toBe(group.id);

		await expect(bundleGroup(storage, 'nope', [])).rejects.toThrow(/no group episode/);
		const neither = io();
		await expect(main(['bundle'], neither)).resolves.not.toBe(0);
		expect(neither.err).toContain('--run <runId> or --group');
	});
});
