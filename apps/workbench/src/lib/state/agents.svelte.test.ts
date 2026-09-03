import { describe, expect, it } from 'vitest';
import { migrateAgentSpec, type AgentCard, type KitFile } from '@craftabot/core';
import { createAgentsStore } from './agents.svelte.js';
import { createMemoryStorage } from './storage-memory.js';
import type { Storage } from './storage.js';

/**
 * **The shelf** (03-UI-UX-DESIGN.md §3) — new, duplicate, bin, export, import.
 *
 * Written at WP14, when the shelf started storing spec v2 and identity moved
 * from the storage row onto the bot itself. That move fixed a real bug (a bot
 * you exported arrived somewhere else wearing a different box), and a bug fixed
 * with nothing asserting it is a bug waiting to come back.
 */

let counter = 0;
const nextId = () => `00000000-0000-4000-8000-${(counter++).toString(16).padStart(12, '0')}`;

function openShelf(storage: Storage = createMemoryStorage()) {
	const agents = createAgentsStore({
		storage: () => Promise.resolve(storage),
		newId: nextId,
		now: () => '2026-08-13T09:00:00Z'
	});
	return { agents, storage };
}

describe('making a bot', () => {
	it('writes spec v2, with the bot carrying its own box art', async () => {
		const { agents } = openShelf();
		const record = await agents.create();

		expect(record.schemaVersion).toBe(2);
		expect(record.spec.schemaVersion).toBe(2);
		expect(record.spec.bricks).toEqual([]);
		expect(record.spec.identity.boxArtSeed).toBe(record.spec.id);
		expect(record.spec.identity.displayName).toBe(record.spec.name);
	});

	it('takes a name for both the bot and its identity', async () => {
		const { agents } = openShelf();
		const record = await agents.create('Bartholomew');
		expect(record.spec.name).toBe('Bartholomew');
		expect(record.spec.identity.displayName).toBe('Bartholomew');
	});

	it('validates a new bot, which needs a brain before it can go', async () => {
		const { agents } = openShelf();
		const record = await agents.create();
		expect(record.lastValidation.map((problem) => problem.code)).toContain('missing-brain');
	});

	it('gives a copy its own box, so two lids on one shelf are told apart', async () => {
		const { agents } = openShelf();
		const original = await agents.create('Original');
		const copy = await agents.duplicate(original.id);

		expect(copy?.spec.name).toBe('Original (copy)');
		expect(copy?.spec.identity.boxArtSeed).toBe(copy?.spec.id);
		expect(copy?.spec.identity.boxArtSeed).not.toBe(original.spec.identity.boxArtSeed);
	});

	it('returns nothing when asked to copy a bot that is not there', async () => {
		const { agents } = openShelf();
		expect(await agents.duplicate('00000000-0000-4000-8000-ffffffffffff')).toBeUndefined();
	});
});

describe('renaming from the Shelf', () => {
	/*
	 * `bench.svelte.ts`'s own `rename()` (mid-edit-session, with undo) is
	 * covered in `bench.svelte.test.ts`. This is the other path: a bot that is
	 * not currently open, renamed straight from the Shelf.
	 */
	it('updates both name and identity.displayName, the same pair the bench keeps in sync', async () => {
		const { agents } = openShelf();
		const original = await agents.create('Before');

		const renamed = await agents.rename(original.id, 'After');

		expect(renamed?.spec.name).toBe('After');
		expect(renamed?.spec.identity.displayName).toBe('After');
	});

	it('persists, so the Shelf list reflects it without a manual reload', async () => {
		const { agents } = openShelf();
		const original = await agents.create('Before');

		await agents.rename(original.id, 'After');

		expect(agents.agents.map((agent) => agent.spec.name)).toEqual(['After']);
	});

	it('trims stray whitespace around a real name', async () => {
		const { agents } = openShelf();
		const original = await agents.create('Before');

		const renamed = await agents.rename(original.id, '  Spacey Name  ');

		expect(renamed?.spec.name).toBe('Spacey Name');
	});

	it('refuses a blank name rather than leaving a bot with none', async () => {
		const { agents } = openShelf();
		const original = await agents.create('Keep Me');

		const result = await agents.rename(original.id, '   ');

		expect(result).toBeUndefined();
		expect(agents.agents[0]?.spec.name).toBe('Keep Me');
	});

	it('returns nothing for a bot that is not there', async () => {
		const { agents } = openShelf();
		expect(await agents.rename('00000000-0000-4000-8000-ffffffffffff', 'Nope')).toBeUndefined();
	});
});

describe('the shelf itself', () => {
	it('lists what has been made, newest first, and forgets what is binned', async () => {
		const { agents } = openShelf();
		await agents.create('One');
		const second = await agents.create('Two');
		await agents.load();
		expect(agents.agents).toHaveLength(2);

		await agents.remove(second.id);
		expect(agents.agents.map((agent) => agent.spec.name)).toEqual(['One']);
	});

	// Reading a shelf that V1.0 wrote is tested where a v1 row can actually be
	// planted — `storage-idb.test.ts`, which has raw database access. `putAgent`
	// takes v2 and nothing should be able to get a v1 row past it.
});

describe('exporting a kit', () => {
	async function exported() {
		const { agents } = openShelf();
		const record = await agents.create('Exportable');
		const json = await agents.exportKit(record.id);
		if (json === undefined) throw new Error('nothing exported');
		return { record, kit: JSON.parse(json) as KitFile };
	}

	it('writes kit format v2, carrying the bot as v2', async () => {
		const { kit } = await exported();
		expect(kit.formatVersion).toBe(2);
		expect(kit.agent.schemaVersion).toBe(2);
	});

	it('names the pack each brick came from, so a reader missing one is told which', async () => {
		const storage = createMemoryStorage();
		const { agents } = openShelf(storage);
		const bot = await agents.create();
		// A bot with a brick fitted, written the way the bench writes one.
		await storage.putAgent({
			...bot,
			spec: {
				...bot.spec,
				bricks: [
					{
						slot: 'memory',
						kind: 'starter/memory',
						configVersion: 1,
						config: { windowSize: 10, notebook: false }
					}
				]
			}
		});

		const kit = JSON.parse((await agents.exportKit(bot.id)) ?? '{}') as KitFile;
		expect(kit.requires.brickKinds).toEqual({ 'starter/memory': 'starter' });
	});

	it('returns nothing for a bot that is not there', async () => {
		const { agents } = openShelf();
		expect(await agents.exportKit('00000000-0000-4000-8000-ffffffffffff')).toBeUndefined();
	});
});

describe('exporting an Agent Card', () => {
	it('carries the bot’s own name and every fitted brick, described', async () => {
		const storage = createMemoryStorage();
		const { agents } = openShelf(storage);
		const bot = await agents.create('Passport Bot');
		await storage.putAgent({
			...bot,
			spec: {
				...bot.spec,
				bricks: [
					{
						slot: 'memory',
						kind: 'starter/memory',
						configVersion: 1,
						config: { windowSize: 10, notebook: false }
					}
				]
			}
		});

		const json = await agents.exportAgentCard(bot.id);
		if (json === undefined) throw new Error('nothing exported');
		const card = JSON.parse(json) as AgentCard;

		expect(card.name).toBe('Passport Bot');
		expect(card.bricks).toEqual([
			{
				slot: 'memory',
				kind: 'starter/memory',
				name: 'Scrapbook Brick',
				description: 'memory of your last 10 turns'
			}
		]);
		expect(card.provenance.brickKinds).toEqual({ 'starter/memory': 'starter' });
	});

	/**
	 * Unlike a kit file, an Agent Card carries no raw config at all — only
	 * derived description strings — so there is nothing here for `redactSecrets`
	 * to need to catch (`agent-card.ts`'s own reasoning).
	 */
	it('never carries a raw config value, personality strings included', async () => {
		const storage = createMemoryStorage();
		const { agents } = openShelf(storage);
		const bot = await agents.create();
		await storage.putAgent({
			...bot,
			spec: {
				...bot.spec,
				bricks: [
					{
						slot: 'brain',
						kind: 'starter/llm',
						configVersion: 1,
						config: {
							cartridgeId: 'openai/quick-thinker',
							temperature: 0.5,
							maxTokens: 200,
							personality: 'sk-should-never-appear'
						}
					}
				]
			}
		});

		const json = await agents.exportAgentCard(bot.id);
		expect(json).not.toContain('sk-should-never-appear');
	});

	it('returns nothing for a bot that is not there', async () => {
		const { agents } = openShelf();
		expect(await agents.exportAgentCard('00000000-0000-4000-8000-ffffffffffff')).toBeUndefined();
	});
});

describe('importing a kit', () => {
	it('takes back a bot it exported, box art and all', async () => {
		// The bug this slice fixes: the seed used to live on the storage row, so
		// it never travelled, and a bot you sent a friend arrived looking like a
		// different bot.
		const source = openShelf();
		const original = await source.agents.create('Travelling Bot');
		const json = await source.agents.exportKit(original.id);

		const destination = openShelf();
		const result = await destination.agents.importKit(json ?? '');

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.agent.spec.identity.boxArtSeed).toBe(original.spec.identity.boxArtSeed);
		expect(result.agent.spec.name).toBe('Travelling Bot');
	});

	it('reads a kit file from V1.0, and mints the box art it never carried', async () => {
		const v1Kit = {
			format: 'craftabot-kit',
			formatVersion: 1,
			exportedAt: '2026-08-12T10:00:00Z',
			exportedBy: 'craftabot-workbench/1.0.0',
			requires: { core: '>=0.0.1', packs: { starter: '>=0.0.1' } },
			agent: {
				id: '11111111-1111-4111-8111-111111111111',
				name: 'Old Timer',
				bricks: { memory: { windowSize: 10, notebook: false } },
				goalCardId: 'starter/say-hello',
				createdAt: '2026-08-12T09:00:00Z',
				updatedAt: '2026-08-12T09:30:00Z',
				schemaVersion: 1
			}
		};

		const { agents } = openShelf();
		const result = await agents.importKit(JSON.stringify(v1Kit));

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.agent.spec.schemaVersion).toBe(2);
		expect(result.agent.spec.bricks[0]?.kind).toBe('starter/memory');
		// v1 had no seed to carry, so one is minted rather than left empty —
		// an empty seed would render as no box art at all.
		expect(result.agent.spec.identity.boxArtSeed).toBe(result.agent.spec.id);
	});

	it('names the brick when a kit needs one this workbench has not got', async () => {
		const { agents } = openShelf();
		const record = await agents.create();
		const migrated = migrateAgentSpec(record.spec);
		if ('kind' in migrated) throw new Error(migrated.message);

		const kit = {
			format: 'craftabot-kit',
			formatVersion: 2,
			exportedAt: '2026-08-13T09:00:00Z',
			exportedBy: 'craftabot-workbench/9.9.9',
			requires: {
				core: '>=0.0.1',
				packs: { starter: '>=0.0.1' },
				// Genuinely fictional — `starter/planner` used to serve this role
				// until WP30 stage B shipped it for real, which is exactly the
				// staleness this comment now guards the next such swap against.
				brickKinds: { 'starter/gizmo': 'starter' }
			},
			agent: migrated
		};

		const result = await agents.importKit(JSON.stringify(kit));
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problem.kind).toBe('missing-bricks');
		expect(result.problem.message).toContain('starter/gizmo');
	});

	it('says so plainly when the file is not JSON at all', async () => {
		const { agents } = openShelf();
		const result = await agents.importKit('{ not json');
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problem.kind).toBe('invalid-file');
	});
});
