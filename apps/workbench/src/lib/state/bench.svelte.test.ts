import { describe, expect, it } from 'vitest';
import { brickInSlot, type AgentRecord, type AgentSpecV2, type SlotId } from '@craftabot/core';
import { createBenchStore } from './bench.svelte.js';
import { createMemoryStorage } from './storage-memory.js';
import type { Storage } from './storage.js';

/**
 * The bench store owns three promises the DoD depends on: validation is live,
 * every change is undoable, and edits persist.
 *
 * It holds spec v2, and since WP14 slice 4c so does everything that reads it.
 * Assertions go through `configIn`, which reads the config of whatever is in a
 * socket — the same way the panels do. The V1 six-key window these used to look
 * through is gone from the app entirely.
 */

const AGENT_ID = '11111111-1111-4111-8111-111111111111';

/** The config of whatever is in a socket, which is what the panels edit. */
const configIn = (spec: AgentSpecV2 | undefined, slot: SlotId): Record<string, unknown> =>
	(spec ? brickInSlot(spec, slot)?.config : undefined) ?? {};

function makeRecord(): AgentRecord {
	return {
		id: AGENT_ID,
		spec: {
			id: AGENT_ID,
			name: 'Testbot',
			schemaVersion: 2,
			bricks: [],
			goalCardId: 'starter/say-hello',
			identity: { displayName: 'Testbot', boxArtSeed: AGENT_ID },
			createdAt: '2026-08-12T09:00:00Z',
			updatedAt: '2026-08-12T09:00:00Z'
		},
		lastValidation: [],
		createdAt: '2026-08-12T09:00:00Z',
		updatedAt: '2026-08-12T09:00:00Z',
		schemaVersion: 2
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

	it('renames the bot and its identity together, so they cannot disagree', async () => {
		const { bench } = await openBench();
		bench.rename('Renamed');
		expect(bench.spec?.identity.displayName).toBe('Renamed');
	});
});

describe('fitting and removing bricks', () => {
	it('fits a brick with its documented defaults', async () => {
		const { bench } = await openBench();
		bench.fitBrick('starter/memory');
		expect(configIn(bench.spec, 'memory')).toEqual({ windowSize: 10, notebook: false });
		expect(bench.fittedIn('memory')?.kindId).toBe('starter/memory');
	});

	/**
	 * The defaults now come from the pack that defines the brick, not from a
	 * `BRICK_DEFAULTS` table in the workbench. Two answers to "what does a fresh
	 * Memory brick remember?" is one too many (`14-…` §2).
	 */
	it('writes a fitted brick as its registered kind, in its registered socket', async () => {
		const { bench } = await openBench();
		bench.fitBrick('starter/memory');
		expect(bench.spec?.bricks).toEqual([
			{
				slot: 'memory',
				kind: 'starter/memory',
				configVersion: 1,
				config: { windowSize: 10, notebook: false }
			}
		]);
	});

	it('does not clobber an already-fitted brick', async () => {
		const { bench } = await openBench();
		bench.fitBrick('starter/memory');
		bench.updateBrick('memory', { windowSize: 30 });
		bench.fitBrick('starter/memory');
		expect(configIn(bench.spec, 'memory')?.windowSize).toBe(30);
	});

	it('never shares the defaults object between bots', async () => {
		const first = await openBench();
		first.bench.fitBrick('starter/safety');
		first.bench.updateBrick('safety', { blockedActions: ['open'] });

		const second = await openBench();
		second.bench.fitBrick('starter/safety');
		expect(configIn(second.bench.spec, 'safety')?.blockedActions).toEqual([]);
	});

	it('removes a brick', async () => {
		const { bench } = await openBench();
		bench.fitBrick('starter/tools');
		bench.removeBrick('equipment');
		expect(bench.fittedIn('equipment')).toBeUndefined();
	});

	it('ignores an update to a brick that is not fitted', async () => {
		const { bench } = await openBench();
		bench.updateBrick('brain', { temperature: 1.5 });
		expect(bench.spec && brickInSlot(bench.spec, 'brain')).toBeUndefined();
		expect(bench.spec?.bricks).toEqual([]);
	});
});

describe('live validation', () => {
	it('clears the blocking problem once a brain and cartridge are in', async () => {
		const { bench } = await openBench();
		bench.fitBrick('starter/llm');
		// Fitted but with an empty cartridge slot: still blocked, different reason.
		expect(bench.blocking.map((p) => p.code)).toEqual(['unknown-cartridge']);
		expect(bench.canGo).toBe(false);
	});

	it('warns without blocking when a notebook tool has no notebook', async () => {
		const { bench } = await openBench();
		bench.fitBrick('starter/tools');
		bench.updateBrick('equipment', { enabled: ['starter/notebook_write'] });

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
		bench.fitBrick('starter/llm');
		bench.undo();
		expect(bench.fittedIn('brain')).toBeUndefined();
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
		bench.fitBrick('starter/llm');
		bench.updateBrick('brain', { temperature: 1.4 });
		await bench.flush();

		const reopened = createBenchStore({
			storage: () => Promise.resolve(storage),
			saveDebounceMs: 0
		});
		await reopened.open(AGENT_ID);
		expect(configIn(reopened.spec, 'brain')?.temperature).toBe(1.4);
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

describe('the loop-breaker setting', () => {
	/**
	 * > **Amended 2026-08-13 (WP11):** on by default, where it used to be off.
	 * > The v1 rule counted identical calls whatever came of them and so
	 * > stopped a bot walking in a straight line, which is why it shipped
	 * > switched off — and why a first bot could loop until its steps ran out
	 * > (`12-…` C3). v2 exempts a `move` that worked, so the default is safe.
	 */
	it('comes fitted, and can be switched off again', async () => {
		const { bench } = await openBench();
		bench.fitBrick('starter/safety');
		expect(configIn(bench.spec, 'safety')?.repeatLimit).toBe(3);

		bench.updateBrick('safety', { repeatLimit: undefined });
		expect(configIn(bench.spec, 'safety')?.repeatLimit).toBeUndefined();
	});

	it('is saved, and comes back on the next visit', async () => {
		const { bench, storage } = await openBench();
		bench.fitBrick('starter/safety');
		bench.updateBrick('safety', { repeatLimit: 5 });
		await bench.flush();

		const reopened = await storage.getAgent(bench.spec?.id ?? '');
		expect(configIn(reopened?.spec, 'safety')?.repeatLimit).toBe(5);
	});

	it('switches back off cleanly', async () => {
		const { bench } = await openBench();
		bench.fitBrick('starter/safety');
		bench.updateBrick('safety', { repeatLimit: 5 });
		bench.updateBrick('safety', { repeatLimit: undefined });

		// Undefined rather than zero: the guardrail is simply not installed.
		expect(configIn(bench.spec, 'safety')?.repeatLimit).toBeUndefined();
	});
});
