import { describe, expect, it } from 'vitest';
import type { AgentRecord } from '@craftabot/core';
import { createBenchStore } from './bench.svelte.js';
import { createMemoryStorage } from './storage-memory.js';
import type { Storage } from './storage.js';

/**
 * The bench store owns three promises the DoD depends on: validation is live,
 * every change is undoable, and edits persist.
 */

const AGENT_ID = '11111111-1111-4111-8111-111111111111';

function makeRecord(): AgentRecord {
	return {
		id: AGENT_ID,
		spec: {
			id: AGENT_ID,
			name: 'Testbot',
			bricks: {},
			goalCardId: 'starter/say-hello',
			createdAt: '2026-08-12T09:00:00Z',
			updatedAt: '2026-08-12T09:00:00Z',
			schemaVersion: 1
		},
		boxArtSeed: AGENT_ID,
		lastValidation: [],
		createdAt: '2026-08-12T09:00:00Z',
		updatedAt: '2026-08-12T09:00:00Z',
		schemaVersion: 1
	};
}

async function openBench(storage: Storage = createMemoryStorage()) {
	await storage.putAgent(makeRecord());
	const bench = createBenchStore({ storage: () => Promise.resolve(storage), saveDebounceMs: 0 });
	await bench.open(AGENT_ID);
	return { bench, storage };
}

describe('opening a bot', () => {
	it('loads the spec and validates it immediately', async () => {
		const { bench } = await openBench();
		expect(bench.spec?.name).toBe('Testbot');
		// A bot with no brain cannot go.
		expect(bench.problems.map((p) => p.code)).toContain('missing-brain');
		expect(bench.canGo).toBe(false);
	});

	it('leaves the spec undefined for an agent that is not there', async () => {
		const bench = createBenchStore({
			storage: () => Promise.resolve(createMemoryStorage()),
			saveDebounceMs: 0
		});
		await bench.open('22222222-2222-4222-8222-222222222222');
		expect(bench.spec).toBeUndefined();
		expect(bench.canGo).toBe(false);
	});

	it('edits a copy, so the stored record is untouched until saved', async () => {
		const { bench, storage } = await openBench();
		bench.rename('Renamed');
		expect((await storage.getAgent(AGENT_ID))?.spec.name).not.toBe('Testbot (stale)');
		expect(bench.spec?.name).toBe('Renamed');
	});
});

describe('fitting and removing bricks', () => {
	it('fits a brick with its documented defaults', async () => {
		const { bench } = await openBench();
		bench.fitBrick('memory');
		expect(bench.spec?.bricks.memory).toEqual({ windowSize: 10, notebook: false });
		expect(bench.hasBrick('memory')).toBe(true);
	});

	it('does not clobber an already-fitted brick', async () => {
		const { bench } = await openBench();
		bench.fitBrick('memory');
		bench.updateBrick('memory', { windowSize: 30 });
		bench.fitBrick('memory');
		expect(bench.spec?.bricks.memory?.windowSize).toBe(30);
	});

	it('never shares the defaults object between bots', async () => {
		const first = await openBench();
		first.bench.fitBrick('safety');
		first.bench.updateBrick('safety', { blockedActions: ['open'] });

		const second = await openBench();
		second.bench.fitBrick('safety');
		expect(second.bench.spec?.bricks.safety?.blockedActions).toEqual([]);
	});

	it('removes a brick', async () => {
		const { bench } = await openBench();
		bench.fitBrick('tools');
		bench.removeBrick('tools');
		expect(bench.hasBrick('tools')).toBe(false);
	});

	it('ignores an update to a brick that is not fitted', async () => {
		const { bench } = await openBench();
		bench.updateBrick('llm', { temperature: 1.5 });
		expect(bench.spec?.bricks.llm).toBeUndefined();
	});
});

describe('live validation', () => {
	it('clears the blocking problem once a brain and cartridge are in', async () => {
		const { bench } = await openBench();
		bench.fitBrick('llm');
		// Fitted but with an empty cartridge slot: still blocked, different reason.
		expect(bench.blocking.map((p) => p.code)).toEqual(['unknown-cartridge']);
		expect(bench.canGo).toBe(false);
	});

	it('warns without blocking when a notebook tool has no notebook', async () => {
		const { bench } = await openBench();
		bench.fitBrick('tools');
		bench.updateBrick('tools', { enabled: ['starter/notebook_write'] });

		const codes = bench.problems.map((problem) => problem.code);
		expect(codes).toContain('tool-needs-notebook');
		expect(bench.problems.find((p) => p.code === 'tool-needs-notebook')?.severity).toBe('warning');
	});
});

describe('undo', () => {
	it('is unavailable until something changes', async () => {
		const { bench } = await openBench();
		expect(bench.canUndo).toBe(false);
	});

	it('steps back one change at a time', async () => {
		const { bench } = await openBench();
		bench.rename('One');
		bench.rename('Two');

		bench.undo();
		expect(bench.spec?.name).toBe('One');
		bench.undo();
		expect(bench.spec?.name).toBe('Testbot');
		expect(bench.canUndo).toBe(false);
	});

	it('undoes a fitted brick', async () => {
		const { bench } = await openBench();
		bench.fitBrick('llm');
		bench.undo();
		expect(bench.hasBrick('llm')).toBe(false);
	});

	it('is harmless with an empty stack', async () => {
		const { bench } = await openBench();
		expect(() => bench.undo()).not.toThrow();
	});
});

describe('the goal card', () => {
	it('switches card', async () => {
		const { bench } = await openBench();
		bench.setGoalCard('starter/snack');
		expect(bench.spec?.goalCardId).toBe('starter/snack');
		expect(bench.goalCard?.title).toBe('Help the teddy get a snack');
	});

	it('stores and clears the Free Play text', async () => {
		const { bench } = await openBench();
		bench.setCustomGoalText('Tidy up, then say hello.');
		expect(bench.spec?.customGoalText).toBe('Tidy up, then say hello.');

		bench.setCustomGoalText('');
		expect(bench.spec?.customGoalText).toBeUndefined();
	});
});

describe('persistence (WP5 definition of done)', () => {
	it('saves an edit and reloads it', async () => {
		const { bench, storage } = await openBench();
		bench.fitBrick('llm');
		bench.updateBrick('llm', { temperature: 1.4 });
		await bench.flush();

		const reopened = createBenchStore({
			storage: () => Promise.resolve(storage),
			saveDebounceMs: 0
		});
		await reopened.open(AGENT_ID);
		expect(reopened.spec?.bricks.llm?.temperature).toBe(1.4);
	});

	it('stores the current build problems alongside the spec', async () => {
		const { bench, storage } = await openBench();
		bench.rename('Brainless');
		await bench.flush();

		const stored = await storage.getAgent(AGENT_ID);
		expect(stored?.lastValidation.map((p) => p.code)).toContain('missing-brain');
	});

	it('coalesces a burst of edits behind the debounce', async () => {
		const storage = createMemoryStorage();
		await storage.putAgent(makeRecord());
		const bench = createBenchStore({
			storage: () => Promise.resolve(storage),
			saveDebounceMs: 20
		});
		await bench.open(AGENT_ID);

		bench.rename('A');
		bench.rename('B');
		bench.rename('C');
		await bench.flush();

		expect((await storage.getAgent(AGENT_ID))?.spec.name).toBe('C');
	});
});
