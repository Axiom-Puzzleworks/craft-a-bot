import { createMemoryStorage, verifyBundleDigest } from '@craftabot/core';
import { makeEvaluation, makeEvent, makeGroupRun, makeRun } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { bundleForGroup, bundleForRun, exportForGroup } from './bundles.js';

describe('bundles from the store (WP48)', () => {
	async function seeded() {
		const storage = createMemoryStorage();
		const group = makeGroupRun();
		const [aId, bId] = group.memberRunIds as [string, string];
		const a = makeRun({ id: aId, agentName: 'Robo', groupRunId: group.id });
		const b = makeRun({ id: bId, agentName: 'Bolt', groupRunId: group.id });
		await storage.putGroupRun(group);
		await storage.putRun(a);
		await storage.putRun(b);
		await storage.appendEvents(a.id, [makeEvent(a.id, 1, 1)]);
		await storage.appendEvents(b.id, [makeEvent(b.id, 1, 2)]);
		await storage.appendEvents(group.id, [makeEvent(a.id, 1, 1), makeEvent(b.id, 1, 2)]);
		await storage.putEvaluation(makeEvaluation({ id: 'e-a', runId: a.id }));
		return { storage, group, a, b };
	}

	it('gathers every member, the merged stream and the evaluations, and the bundle verifies', async () => {
		const { storage, group } = await seeded();
		const input = await exportForGroup(storage, group);
		expect(input.group?.members.map((member) => member.run.agentName)).toEqual(['Robo', 'Bolt']);
		expect(input.group?.events).toHaveLength(2);
		expect(input.evaluations?.map((record) => record.id)).toEqual(['e-a']);
		const bundle = await bundleForGroup(storage, group, []);
		expect(bundle.runs).toHaveLength(2);
		expect(await verifyBundleDigest(bundle)).toBe(true);
	});

	it('a solo run bundles on its own; an episode with no members left is refused', async () => {
		const { storage, a, group } = await seeded();
		const solo = await bundleForRun(storage, a, []);
		expect(solo.group).toBeUndefined();
		expect(solo.evaluations).toHaveLength(1);
		expect(await verifyBundleDigest(solo)).toBe(true);
		await storage.deleteRun(a.id);
		await storage.deleteRun(group.memberRunIds[1] ?? '');
		await expect(exportForGroup(storage, group)).rejects.toThrow(/member runs/);
	});
});
