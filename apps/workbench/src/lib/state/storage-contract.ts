import { describe, expect, it } from 'vitest';
import type { Storage } from './storage.js';
import { makeAgent, makeEvent, makeRun, makeSpec, uuid } from './storage-fixtures.js';

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
