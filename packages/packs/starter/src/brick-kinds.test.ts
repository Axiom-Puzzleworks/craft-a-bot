import { SLOT_IDS, createPackRegistry, type SlotId } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { starterBrickKinds } from './brick-kinds.js';
import { starterBricks } from './bricks.js';
import starterPack from './index.js';

/**
 * **The open brick contract, as the starter pack implements it** (`14-…` §2,
 * closing `12-…` D11).
 *
 * The point of these is not that the six V1 bricks work — they always have.
 * It is that they now work *through a contract a second pack could implement*,
 * which is the difference between "brick" being a taxonomy and an extension
 * point. Every assertion below is one a Planner or Monitor brick from an
 * expansion pack would have to satisfy identically.
 */

describe('the starter brick kinds', () => {
	it('registers through the pack manifest, like every other kind of content', () => {
		const registry = createPackRegistry();
		registry.registerPack(starterPack);

		expect(registry.getBrickKind('starter/llm')?.slot).toBe('brain');
		expect(registry.getBrickKind('starter/safety')?.slot).toBe('safety');
		expect(registry.getBrickKind('nobody/planner')).toBeUndefined();
	});

	it('fills every chassis socket — one kind each, except equipment and memory (WP31 stage F, WP32 stage A)', () => {
		const bySlot = new Map<SlotId, number>();
		for (const kind of starterBrickKinds) {
			bySlot.set(kind.slot, (bySlot.get(kind.slot) ?? 0) + 1);
		}
		expect([...bySlot.keys()].sort()).toEqual([...SLOT_IDS].sort());
		/*
		 * V1's one-brick-per-socket rule (`14-…` §2.3) applies to a socket
		 * regardless of which kind is in it — the contract permits more than
		 * one kind *registered* for a slot family (equipment: Radio + Tools;
		 * memory: Librarian + Scrapbook), which is a builder's choice of one
		 * or the other, never both fitted at once. If/Then (`14-…` §5.2)
		 * first tried to share `mobility` with Actions on exactly that
		 * mistaken reading and a failing build check caught it — it needs its
		 * own `'reflexes'` socket instead, since a bot needs Actions *and*
		 * If/Then at the same time, not a choice between them (`types/brick.ts`'s
		 * own dated amendment on `SLOT_IDS`). Librarian (`14-…` §5.5) is the
		 * opposite case: it genuinely *is* a choice — a Librarian-fitted bot
		 * gets the same turn-window memory the Scrapbook gives, plus a
		 * bookshelf, so there is nothing left for a second, separate memory
		 * brick to add.
		 */
		expect(bySlot.get('equipment')).toBe(2);
		expect(bySlot.get('memory')).toBe(2);
		const otherSlots = [...bySlot.entries()].filter(
			([slot]) => slot !== 'equipment' && slot !== 'memory'
		);
		expect(otherSlots.every(([, count]) => count === 1)).toBe(true);
	});

	it('can be listed by socket, which is what a parts tray needs', () => {
		const registry = createPackRegistry();
		registry.registerPack(starterPack);

		expect(registry.listBrickKinds('brain').map((kind) => kind.id)).toEqual(['starter/llm']);
		expect(registry.listBrickKinds('planner').map((kind) => kind.id)).toEqual(['starter/planner']);
		expect(
			registry
				.listBrickKinds('equipment')
				.map((kind) => kind.id)
				.sort()
		).toEqual(['starter/radio', 'starter/tools']);
		expect(
			registry
				.listBrickKinds('memory')
				.map((kind) => kind.id)
				.sort()
		).toEqual(['starter/librarian', 'starter/memory']);
		expect(registry.listBrickKinds('mobility').map((kind) => kind.id)).toEqual(['starter/actions']);
		expect(registry.listBrickKinds('reflexes').map((kind) => kind.id)).toEqual(['starter/if-then']);
		expect(registry.listBrickKinds()).toHaveLength(10);
	});

	it('gives every kind a toy face and a real face', () => {
		// `00-…` §6: the toy never hides the truth, it keeps it one click away.
		for (const kind of starterBrickKinds) {
			expect(kind.name.length, kind.id).toBeGreaterThan(0);
			expect(kind.realName.length, kind.id).toBeGreaterThan(0);
			expect(kind.realExplanation.length, kind.id).toBeGreaterThan(20);
		}
	});

	it('says the same thing as the presentation data it came from', () => {
		// Two sources for one brick's name is how they drift apart — checked for
		// the six bricks old enough to have a separate `bricks.ts` entry at all.
		// A brick that joined after the open contract (Radio, WP31 stage F)
		// carries its presentation straight on the kind and has no second copy
		// to drift from (`bricks.ts`'s own note on why).
		for (const brick of starterBricks) {
			const kind = starterBrickKinds.find((candidate) => candidate.id === brick.id);
			expect(kind?.name, brick.id).toBe(brick.name);
			expect(kind?.realName, brick.id).toBe(brick.realName);
		}
	});

	/**
	 * The assertion that makes `defaults` usable: a freshly-snapped brick must
	 * be a *legal* brick. The workbench has been carrying its own copy of these
	 * in `BRICK_DEFAULTS` with nothing checking the two agreed.
	 */
	it('gives every kind defaults that parse against its own schema', () => {
		for (const kind of starterBrickKinds) {
			const result = kind.configSchema.safeParse(kind.defaults);
			expect(result.success, `${kind.id}: ${JSON.stringify(result.error?.issues ?? [])}`).toBe(
				true
			);
		}
	});

	it('rejects a config its schema does not recognise', () => {
		const brain = starterBrickKinds.find((kind) => kind.id === 'starter/llm');
		expect(brain?.configSchema.safeParse({ cartridgeId: 'x', temperature: 99 }).success).toBe(
			false
		);
	});

	it('qualifies every kind id, and versions every config', () => {
		for (const kind of starterBrickKinds) {
			expect(kind.id.startsWith('starter/'), kind.id).toBe(true);
			// A config with no version cannot be migrated later, and every one of
			// these will need to be one day (`14-…` §2.1).
			expect(kind.configVersion, kind.id).toBeGreaterThanOrEqual(1);
		}
	});

	it('names world content the qualified way in its defaults', () => {
		// E6 again: a default that ships bare ids would quietly make the
		// compatibility path the normal one.
		const sense = starterBrickKinds.find((kind) => kind.id === 'starter/sense');
		const channels = (sense?.defaults as { channels: string[] }).channels;
		expect(channels.every((id) => id.startsWith('starter/playroom/'))).toBe(true);
	});
});

describe('a second pack contributing its own brick kind', () => {
	/**
	 * The whole reason the contract exists, checked at its smallest: a pack
	 * that is not the starter pack registers a kind into a slot the starter
	 * pack already occupies, and both survive. No core edit, no enum to widen.
	 */
	it('coexists with the starter kinds in the same slot family', () => {
		const registry = createPackRegistry();
		registry.registerPack(starterPack);
		registry.registerPack({
			id: 'expansion',
			name: 'An expansion pack',
			version: '1.0.0',
			requiresCore: '>=0.0.1',
			brickKinds: [
				{
					id: 'expansion/monitor',
					slot: 'safety',
					name: 'Teddy-cam Brick',
					description: 'Watches what the bot did and raises a flag.',
					realName: 'Monitor agent',
					realExplanation: 'A second, read-only observer over the live trace.',
					configSchema: starterBrickKinds[0]!.configSchema,
					configVersion: 1,
					defaults: starterBrickKinds[0]!.defaults
				}
			]
		});

		expect(
			registry
				.listBrickKinds('safety')
				.map((kind) => kind.id)
				.sort()
		).toEqual(['expansion/monitor', 'starter/safety']);
	});

	it('refuses two kinds claiming the same id', () => {
		const registry = createPackRegistry();
		registry.registerPack(starterPack);
		expect(() =>
			registry.registerPack({
				id: 'impostor',
				name: 'Impostor',
				version: '1.0.0',
				requiresCore: '>=0.0.1',
				brickKinds: [starterBrickKinds[0]!]
			})
		).toThrow(/already registered/);
	});
});
