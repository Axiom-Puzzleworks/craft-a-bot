import { describe, expect, it } from 'vitest';
import type { Storage } from '../storage/storage.js';
import {
	makeAgent,
	makeEvent,
	makeGroupRun,
	makeRun,
	makeRunSummary,
	makeSpec,
	uuid
} from './storage-fixtures.js';

/**
 * One suite, run against every `Storage` implementation.
 *
 * The in-memory store is not just a test double — it is what the app actually
 * uses when IndexedDB is unavailable (07-DATA-MODEL-PERSISTENCE.md §8). Any
 * behavioural difference between it and the IndexedDB store is therefore a real
 * bug that would only ever bite users in private browsing, which is precisely
 * the audience least likely to report it. So both must pass the same tests.
 */
export function describeStorageContract(name: string, open: () => Promise<Storage>): void {
	describe(`${name} — Storage contract`, () => {
		describe('agents', () => {
			it('round-trips an agent record', async () => {
				const storage = await open();
				const agent = makeAgent();
				await storage.putAgent(agent);

				expect(await storage.getAgent(agent.id)).toEqual(agent);
				expect(await storage.listAgents()).toEqual([agent]);
			});

			it('returns undefined for an agent that is not there', async () => {
				const storage = await open();
				expect(await storage.getAgent(uuid(999))).toBeUndefined();
			});

			it('overwrites an agent with the same id', async () => {
				const storage = await open();
				await storage.putAgent(makeAgent());
				await storage.putAgent(makeAgent({ spec: makeSpec({ name: 'Snackbot 4000' }) }));

				const agents = await storage.listAgents();
				expect(agents).toHaveLength(1);
				expect(agents[0]?.spec.name).toBe('Snackbot 4000');
			});

			it('deletes an agent', async () => {
				const storage = await open();
				const agent = makeAgent();
				await storage.putAgent(agent);
				await storage.deleteAgent(agent.id);
				expect(await storage.listAgents()).toEqual([]);
			});

			it('refuses to store a record that fails its schema', async () => {
				const storage = await open();
				const broken = { ...makeAgent(), id: 'not-a-uuid' };
				await expect(storage.putAgent(broken)).rejects.toThrow();
			});

			it('stores a record carrying build problems', async () => {
				const storage = await open();
				const agent = makeAgent({
					lastValidation: [
						{ code: 'missing-brain', severity: 'blocking', message: 'Your bot needs a brain!' }
					]
				});
				await storage.putAgent(agent);
				expect((await storage.getAgent(agent.id))?.lastValidation).toHaveLength(1);
			});
		});

		describe('runs', () => {
			it('round-trips a run record', async () => {
				const storage = await open();
				const run = makeRun();
				await storage.putRun(run);
				expect(await storage.getRun(run.id)).toEqual(run);
			});

			it('lists runs newest first', async () => {
				const storage = await open();
				await storage.putRun(makeRun({ id: uuid(101), startedAt: '2026-08-12T10:00:00Z' }));
				await storage.putRun(makeRun({ id: uuid(102), startedAt: '2026-08-12T12:00:00Z' }));
				await storage.putRun(makeRun({ id: uuid(103), startedAt: '2026-08-12T11:00:00Z' }));

				expect((await storage.listRuns()).map((run) => run.id)).toEqual([
					uuid(102),
					uuid(103),
					uuid(101)
				]);
			});

			it('pins and unpins a run', async () => {
				const storage = await open();
				const run = makeRun();
				await storage.putRun(run);

				await storage.setRunPinned(run.id, true);
				expect((await storage.getRun(run.id))?.pinned).toBe(true);
				await storage.setRunPinned(run.id, false);
				expect((await storage.getRun(run.id))?.pinned).toBe(false);
			});

			it('ignores pinning a run that does not exist', async () => {
				const storage = await open();
				await expect(storage.setRunPinned(uuid(999), true)).resolves.toBeUndefined();
			});

			it('deleting a run takes its events with it', async () => {
				const storage = await open();
				const run = makeRun();
				await storage.putRun(run);
				await storage.appendEvents(run.id, [makeEvent(run.id, 1, 200)]);

				await storage.deleteRun(run.id);
				expect(await storage.getEvents(run.id)).toEqual([]);
			});
		});

		/** WP29 (`23-…` §4.7, §10 stage F) — the same shape of round-trip as `runs`, on its own store. */
		describe('group runs', () => {
			it('round-trips a group run record', async () => {
				const storage = await open();
				const groupRun = makeGroupRun();
				await storage.putGroupRun(groupRun);
				expect(await storage.getGroupRun(groupRun.id)).toEqual(groupRun);
			});

			it('returns undefined for a group run that is not there', async () => {
				const storage = await open();
				expect(await storage.getGroupRun(uuid(999))).toBeUndefined();
			});

			it('lists group runs newest first', async () => {
				const storage = await open();
				await storage.putGroupRun(
					makeGroupRun({ id: uuid(201), startedAt: '2026-08-19T10:00:00Z' })
				);
				await storage.putGroupRun(
					makeGroupRun({ id: uuid(202), startedAt: '2026-08-19T12:00:00Z' })
				);
				await storage.putGroupRun(
					makeGroupRun({ id: uuid(203), startedAt: '2026-08-19T11:00:00Z' })
				);

				expect((await storage.listGroupRuns()).map((run) => run.id)).toEqual([
					uuid(202),
					uuid(203),
					uuid(201)
				]);
			});

			it('pins and unpins a group run', async () => {
				const storage = await open();
				const groupRun = makeGroupRun();
				await storage.putGroupRun(groupRun);

				await storage.setGroupRunPinned(groupRun.id, true);
				expect((await storage.getGroupRun(groupRun.id))?.pinned).toBe(true);
				await storage.setGroupRunPinned(groupRun.id, false);
				expect((await storage.getGroupRun(groupRun.id))?.pinned).toBe(false);
			});

			it('ignores pinning a group run that does not exist', async () => {
				const storage = await open();
				await expect(storage.setGroupRunPinned(uuid(999), true)).resolves.toBeUndefined();
			});

			it('deleting a group run takes its merged events with it', async () => {
				const storage = await open();
				const groupRun = makeGroupRun();
				await storage.putGroupRun(groupRun);
				await storage.appendEvents(groupRun.id, [makeEvent(groupRun.id, 1, 250)]);

				await storage.deleteGroupRun(groupRun.id);
				expect(await storage.getEvents(groupRun.id)).toEqual([]);
			});

			it('clear() forgets group runs too', async () => {
				const storage = await open();
				await storage.putGroupRun(makeGroupRun());
				await storage.clear();
				expect(await storage.listGroupRuns()).toEqual([]);
			});
		});

		/** WP36 stage C — a finished run's summary, kept beside its record and gone with it. */
		describe('run summaries', () => {
			it('round-trips a run summary', async () => {
				const storage = await open();
				const summary = makeRunSummary();
				await storage.putRunSummary(summary);
				expect(await storage.getRunSummary(summary.runId)).toEqual(summary);
				expect(await storage.listRunSummaries()).toEqual([summary]);
			});

			it('returns undefined for a run that has no summary yet', async () => {
				const storage = await open();
				expect(await storage.getRunSummary(uuid(999))).toBeUndefined();
			});

			it('overwrites a summary for the same run', async () => {
				const storage = await open();
				await storage.putRunSummary(makeRunSummary({ saves: 1 }));
				await storage.putRunSummary(makeRunSummary({ saves: 4 }));
				expect((await storage.listRunSummaries()).map((s) => s.saves)).toEqual([4]);
			});

			it('refuses to store a summary that fails its schema', async () => {
				const storage = await open();
				await expect(storage.putRunSummary({ ...makeRunSummary(), checks: -1 })).rejects.toThrow();
			});

			it('deleting a run takes its summary with it', async () => {
				const storage = await open();
				const run = makeRun();
				await storage.putRun(run);
				await storage.putRunSummary(makeRunSummary({ runId: run.id }));
				await storage.deleteRun(run.id);
				expect(await storage.getRunSummary(run.id)).toBeUndefined();
			});

			it('evicting a run takes its summary with it', async () => {
				const storage = await open();
				await storage.putRun(makeRun({ id: uuid(1000), startedAt: '2026-08-10T10:00:00Z' }));
				await storage.putRun(makeRun({ id: uuid(1001), startedAt: '2026-08-11T10:00:00Z' }));
				await storage.putRunSummary(makeRunSummary({ runId: uuid(1000) }));
				await storage.putRunSummary(makeRunSummary({ runId: uuid(1001) }));

				await storage.evictOldRuns(1);
				expect(await storage.getRunSummary(uuid(1000))).toBeUndefined();
				expect(await storage.getRunSummary(uuid(1001))).toBeDefined();
			});

			it('clear() forgets summaries too', async () => {
				const storage = await open();
				await storage.putRunSummary(makeRunSummary());
				await storage.clear();
				expect(await storage.listRunSummaries()).toEqual([]);
			});

			it('does not hand out live references to a summary', async () => {
				const storage = await open();
				const summary = makeRunSummary();
				await storage.putRunSummary(summary);
				const fetched = await storage.getRunSummary(summary.runId);
				if (fetched) fetched.findings.length = 0;
				expect((await storage.getRunSummary(summary.runId))?.findings).toHaveLength(1);
			});
		});

		describe('events', () => {
			it('appends events with monotonic seq, across separate calls', async () => {
				const storage = await open();
				const runId = uuid(100);
				await storage.appendEvents(runId, [makeEvent(runId, 1, 201), makeEvent(runId, 1, 202)]);
				await storage.appendEvents(runId, [makeEvent(runId, 2, 203)]);

				const stored = await storage.getEvents(runId);
				expect(stored.map((row) => row.seq)).toEqual([0, 1, 2]);
				expect(stored.map((row) => row.event.id)).toEqual([uuid(201), uuid(202), uuid(203)]);
			});

			it('keeps each run’s events separate', async () => {
				const storage = await open();
				await storage.appendEvents(uuid(100), [makeEvent(uuid(100), 1, 201)]);
				await storage.appendEvents(uuid(101), [makeEvent(uuid(101), 1, 202)]);

				expect(await storage.getEvents(uuid(100))).toHaveLength(1);
				expect(await storage.getEvents(uuid(101))).toHaveLength(1);
			});

			it('returns an empty list for a run with no events', async () => {
				const storage = await open();
				expect(await storage.getEvents(uuid(999))).toEqual([]);
			});

			it('appending nothing is harmless', async () => {
				const storage = await open();
				await storage.appendEvents(uuid(100), []);
				expect(await storage.getEvents(uuid(100))).toEqual([]);
			});

			it('deletes a run’s events on request', async () => {
				const storage = await open();
				await storage.appendEvents(uuid(100), [makeEvent(uuid(100), 1, 201)]);
				await storage.deleteEvents(uuid(100));
				expect(await storage.getEvents(uuid(100))).toEqual([]);
			});
		});

		describe('eviction (07 §2)', () => {
			async function seedRuns(storage: Storage, count: number, pinned: number[] = []) {
				for (let index = 0; index < count; index++) {
					await storage.putRun(
						makeRun({
							id: uuid(1000 + index),
							// Older index ⇒ older run.
							startedAt: `2026-08-${String(10 + index).padStart(2, '0')}T10:00:00Z`,
							pinned: pinned.includes(index)
						})
					);
					await storage.appendEvents(uuid(1000 + index), [
						makeEvent(uuid(1000 + index), 1, 500 + index)
					]);
				}
			}

			it('does nothing while under the cap', async () => {
				const storage = await open();
				await seedRuns(storage, 3);
				expect(await storage.evictOldRuns(5)).toEqual([]);
				expect(await storage.listRuns()).toHaveLength(3);
			});

			it('drops the oldest runs to get back to the cap', async () => {
				const storage = await open();
				await seedRuns(storage, 5);

				const evicted = await storage.evictOldRuns(3);
				expect(evicted).toEqual([uuid(1000), uuid(1001)]);
				expect(await storage.listRuns()).toHaveLength(3);
			});

			it('never evicts a pinned run, even when it is the oldest', async () => {
				const storage = await open();
				await seedRuns(storage, 5, [0]);

				const evicted = await storage.evictOldRuns(3);
				expect(evicted).not.toContain(uuid(1000));
				const remaining = (await storage.listRuns()).map((run) => run.id);
				expect(remaining).toContain(uuid(1000));
				expect(remaining).toHaveLength(3);
			});

			it('keeps pinned runs even when they alone exceed the cap', async () => {
				const storage = await open();
				await seedRuns(storage, 4, [0, 1, 2, 3]);
				expect(await storage.evictOldRuns(2)).toEqual([]);
				expect(await storage.listRuns()).toHaveLength(4);
			});

			it('takes the evicted runs’ events with them', async () => {
				const storage = await open();
				await seedRuns(storage, 3);
				await storage.evictOldRuns(1);
				expect(await storage.getEvents(uuid(1000))).toEqual([]);
				expect(await storage.getEvents(uuid(1002))).toHaveLength(1);
			});

			/**
			 * WP31, `24-ROBOT-FRIENDS-DESIGN.md` §4.5: a run carrying a
			 * `groupRunId` is never evicted on its own — doing so would corrupt
			 * its still-live `GroupRunRecord`, whose `memberRunIds` would then
			 * point at a run that 404s. Deliberately conservative rather than a
			 * group-aware retention scheme (`23-…` §8's own "worth getting right
			 * against real usage" reasoning, now that WP31 is the live producer
			 * it was waiting on) — a grouped run sits outside the cap entirely.
			 */
			it('never evicts a run that belongs to a group episode, even as the oldest', async () => {
				const storage = await open();
				const groupRunId = uuid(3999);
				await storage.putRun(
					// Older than every `seedRuns` run below, and its own id kept out
					// of that helper's `1000..` range so the two cannot collide.
					makeRun({ id: uuid(3998), startedAt: '2026-08-09T10:00:00Z', groupRunId })
				);
				await seedRuns(storage, 4);

				const evicted = await storage.evictOldRuns(3);
				expect(evicted).not.toContain(uuid(3998));
				const remaining = (await storage.listRuns()).map((run) => run.id);
				expect(remaining).toContain(uuid(3998));
			});
		});

		describe('clear', () => {
			it('forgets everything', async () => {
				const storage = await open();
				await storage.putAgent(makeAgent());
				await storage.putRun(makeRun());
				await storage.appendEvents(uuid(100), [makeEvent(uuid(100), 1, 201)]);

				await storage.clear();

				expect(await storage.listAgents()).toEqual([]);
				expect(await storage.listRuns()).toEqual([]);
				expect(await storage.getEvents(uuid(100))).toEqual([]);
			});
		});

		describe('isolation', () => {
			it('does not hand out live references into its own state', async () => {
				const storage = await open();
				const agent = makeAgent({ spec: makeSpec({ name: 'Original' }) });
				await storage.putAgent(agent);

				const fetched = await storage.getAgent(agent.id);
				if (fetched) fetched.spec.name = 'Tampered';

				expect((await storage.getAgent(agent.id))?.spec.name).toBe('Original');
			});
		});
	});
}
