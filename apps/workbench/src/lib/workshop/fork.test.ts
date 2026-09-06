import { describe, expect, it } from 'vitest';
import type { EngineEvent } from '@craftabot/core';
import { createMemoryStorage } from '@craftabot/core';
import { makeRun } from '@craftabot/core/testing';
import { buildSpec } from '@craftabot/pack-starter/testing';
import { capabilitiesOf } from '../bot-capabilities.js';
import { createDemoBrain } from '../demo-brain.js';
import { createRegistry } from '../packs.js';
import { createSessionView } from '../state/session.svelte.js';
import { completedTicks, forkStoredRun } from './fork.js';

/**
 * The Workshop's fork (WP66 stage C, `54-…` §4.5, §11 item 6): a stored
 * run forked from a completed tick through the app's own session view is
 * stored with `forkedFrom` on its record and its `run.started`, carries the
 * origin's rows through the tick and only its own after, and — on the demo
 * brain, resumed where the origin's was — decides and does the same again.
 */
const registry = createRegistry();

async function playOrigin() {
	const spec = buildSpec({ goalCardId: 'starter/snack' });
	const can = capabilitiesOf(spec, registry);
	const events: EngineEvent[] = [];
	const view = createSessionView({
		spec,
		provider: createDemoBrain('starter/snack', can),
		onEvent: (event) => events.push(event)
	});
	for (let step = 0; step < 40 && view.outcome === undefined; step += 1) await view.step();
	expect(view.outcome).toBeDefined();
	const storage = createMemoryStorage();
	const run = makeRun({
		id: view.runId ?? 'origin',
		goalCardId: spec.goalCardId,
		specSnapshot: spec,
		outcome: view.outcome ?? 'STOPPED_BY_USER',
		ticks: view.tick
	});
	await storage.putRun(run);
	await storage.appendEvents(run.id, events);
	return { storage, run, events };
}

const comparable = (event: EngineEvent) => ({
	type: event.type,
	tick: event.tick,
	payload:
		event.type === 'run.started'
			? Object.fromEntries(Object.entries(event.payload).filter(([key]) => key !== 'forkedFrom'))
			: event.type === 'tool.executed'
				? { ...event.payload, durationMs: 0 }
				: event.payload
});

describe('forkStoredRun', () => {
	it('stores a fork that names its origin and, on the demo brain, goes the same way again', async () => {
		const { storage, run, events } = await playOrigin();
		const ticks = completedTicks(events);
		expect(ticks.length).toBeGreaterThan(2);
		const tick = 1;

		const fork = await forkStoredRun(storage, run.id, tick, registry);
		expect(fork.forkedFrom).toEqual({ runId: run.id, tick });
		expect(fork.runId).not.toBe(run.id);
		expect(fork.outcome).toBe(run.outcome);

		const record = await storage.getRun(fork.runId);
		expect(record?.forkedFrom).toEqual({ runId: run.id, tick });
		expect(record?.outcome).toBe(run.outcome);
		expect(record?.finishedAt).toBeDefined();
		expect(await storage.getRunSummary(fork.runId)).toBeDefined();

		const stored = (await storage.getEvents(fork.runId)).map((row) => row.event);
		const started = stored[0];
		expect(started?.type === 'run.started' && started.payload.forkedFrom).toMatchObject({
			runId: run.id,
			tick
		});
		// Nothing of the origin's before the fork tick is the fork's own; after it, every row matches.
		expect(stored.every((event) => event.tick >= tick)).toBe(true);
		expect(stored.filter((event) => event.tick > tick).map(comparable)).toEqual(
			events.filter((event) => event.tick > tick).map(comparable)
		);
	});

	it('refuses a run it does not hold and a tick the origin never completed', async () => {
		const { storage, run } = await playOrigin();
		await expect(forkStoredRun(storage, 'nobody', 1, registry)).rejects.toThrow(/No run/);
		await expect(forkStoredRun(storage, run.id, 99, registry)).rejects.toThrow(/turn 99/);
	});
});
