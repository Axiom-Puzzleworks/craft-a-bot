import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { describeStorageContract, makeAgent, makeRun, uuid } from '@craftabot/core/testing';
import { createFileStorage, runExists } from './file-storage.js';

/**
 * The same contract as the browser's two stores — that is the point — plus
 * the things only a directory can get wrong.
 */
const roots: string[] = [];
async function open() {
	const root = await mkdtemp(join(tmpdir(), 'craftabot-file-storage-'));
	roots.push(root);
	return createFileStorage(root);
}

afterAll(async () => {
	for (const root of roots) await rm(root, { recursive: true, force: true });
});

describeStorageContract('file', open);

describe('the file store specifically', () => {
	it('identifies itself and says where it is', async () => {
		const storage = await open();
		expect(storage.kind).toBe('file');
		expect(storage.root).toBe(roots.at(-1));
	});

	it('lays a run out as one directory a person can read', async () => {
		const storage = await open();
		const run = makeRun();
		await storage.putRun(run);
		expect(await runExists(storage, run.id)).toBe(true);
		expect(await runExists(storage, uuid(999))).toBe(false);
	});

	it('quarantines a corrupt agent file rather than failing the shelf', async () => {
		const storage = await open();
		await storage.putAgent(makeAgent());
		await writeFile(join(storage.root, 'agents', `${uuid(77)}.json`), '{ not json', 'utf8');

		expect(await storage.listAgents()).toHaveLength(1);
		expect(storage.quarantined().agents).toBe(1);
		expect(await storage.getAgent(uuid(77))).toBeUndefined();
	});

	it('quarantines a corrupt event line and keeps the rest', async () => {
		const storage = await open();
		const runId = uuid(100);
		await storage.putRun(makeRun({ id: runId }));
		await writeFile(
			join(storage.root, 'runs', runId, 'events.jsonl'),
			`${JSON.stringify({ runId, seq: 0, event: { id: uuid(1), runId, tick: 1, timestamp: '2026-09-02T09:00:00Z', type: 'tick.started', payload: {} } })}\nnot json\n`,
			'utf8'
		);
		expect(await storage.getEvents(runId)).toHaveLength(1);
		expect(storage.quarantined().events).toBe(1);
	});

	it('survives being reopened on the same directory — the whole point of a file', async () => {
		const storage = await open();
		const run = makeRun();
		await storage.putRun(run);
		const reopened = await createFileStorage(storage.root);
		expect(await reopened.getRun(run.id)).toEqual(run);
	});

	it('quarantines a corrupt run.json and skips a corrupt summary or group row, never throwing', async () => {
		const storage = await open();
		const good = makeRun({ id: uuid(101) });
		await storage.putRun(good);
		await storage.putRun(makeRun({ id: uuid(102) }));
		await writeFile(join(storage.root, 'runs', uuid(102), 'run.json'), '{ not json', 'utf8');
		await writeFile(join(storage.root, 'runs', uuid(101), 'summary.json'), '{ not json', 'utf8');
		await writeFile(join(storage.root, 'group-runs', `${uuid(300)}.json`), '{ not json', 'utf8');

		expect((await storage.listRuns()).map((run) => run.id)).toEqual([good.id]);
		expect(storage.quarantined().runs).toBe(1);
		expect(await storage.getRun(uuid(102))).toBeUndefined();
		expect(await storage.getRunSummary(good.id)).toBeUndefined();
		expect(await storage.listRunSummaries()).toEqual([]);
		expect(await storage.listGroupRuns()).toEqual([]);
		expect(await storage.getGroupRun(uuid(300))).toBeUndefined();

		// Pinning something unreadable is a no-op, not a crash.
		await expect(storage.setRunPinned(uuid(102), true)).resolves.toBeUndefined();
		await expect(storage.setGroupRunPinned(uuid(300), true)).resolves.toBeUndefined();
	});

	it('leaves a group episode’s merged stream out of the run list', async () => {
		const storage = await open();
		const groupId = uuid(200);
		await storage.appendEvents(groupId, [
			{
				id: uuid(201),
				runId: groupId,
				tick: 1,
				timestamp: '2026-09-02T09:00:00Z',
				type: 'tick.started',
				payload: {}
			}
		]);
		expect(await storage.listRuns()).toEqual([]);
		expect(await storage.getEvents(groupId)).toHaveLength(1);
	});
});
