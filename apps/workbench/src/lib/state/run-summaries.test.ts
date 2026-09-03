import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from '@craftabot/core';
import { makeEvent, makeRun, makeRunSummary, uuid } from '@craftabot/core/testing';
import { summariseRun } from '@craftabot/governance/reports';
import { ensureRunSummaries, persistRunSummary } from './run-summaries.js';

/**
 * When a summary is folded, and whether the answer is kept (WP36 stage C).
 */
describe('ensureRunSummaries', () => {
	it('returns a stored summary without touching the events', async () => {
		const storage = createMemoryStorage();
		const run = makeRun();
		await storage.putRun(run);
		const stored = makeRunSummary({ runId: run.id, saves: 7 });
		await storage.putRunSummary(stored);
		// Events that would fold to something else, proving the stored row won.
		await storage.appendEvents(run.id, [makeEvent(run.id, 1, 300)]);

		const summaries = await ensureRunSummaries(storage, [run]);
		expect(summaries.get(run.id)).toEqual(stored);
	});

	it('folds a finished run with no summary yet, and writes it back', async () => {
		const storage = createMemoryStorage();
		const run = makeRun();
		await storage.putRun(run);
		await storage.appendEvents(run.id, [makeEvent(run.id, 1, 300)]);

		const summaries = await ensureRunSummaries(storage, [run]);
		const expected = summariseRun(
			run.id,
			(await storage.getEvents(run.id)).map((r) => r.event)
		);
		expect(summaries.get(run.id)).toEqual(expected);
		expect(await storage.getRunSummary(run.id)).toEqual(expected);
	});

	it('folds a run still in progress but never stores it', async () => {
		const storage = createMemoryStorage();
		const run = makeRun({ outcome: 'IN_PROGRESS' });
		await storage.putRun(run);

		const summaries = await ensureRunSummaries(storage, [run]);
		expect(summaries.get(run.id)?.runId).toBe(run.id);
		expect(await storage.getRunSummary(run.id)).toBeUndefined();
	});

	it('answers for every run asked about, stored or not', async () => {
		const storage = createMemoryStorage();
		const a = makeRun({ id: uuid(101) });
		const b = makeRun({ id: uuid(102) });
		await storage.putRun(a);
		await storage.putRun(b);
		await storage.putRunSummary(makeRunSummary({ runId: a.id }));

		const summaries = await ensureRunSummaries(storage, [a, b]);
		expect([...summaries.keys()].sort()).toEqual([a.id, b.id].sort());
	});
});

describe('persistRunSummary', () => {
	it('folds the events it is given and keeps the answer', async () => {
		const storage = createMemoryStorage();
		const run = makeRun();
		const events = [makeEvent(run.id, 1, 300)];
		await persistRunSummary(storage, run.id, events);
		expect(await storage.getRunSummary(run.id)).toEqual(summariseRun(run.id, events));
	});
});
