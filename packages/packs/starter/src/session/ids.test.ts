import {
	createPackRegistry,
	createSession,
	type PackManifest,
	type ToolDefinition
} from '@craftabot/core';
import { createMockProvider, createTestClock } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import starterPack from '../index.js';
import { buildRegistry, buildSpec } from './harness.js';

/**
 * **The id-convention lint** (`13-…` §3, closing `12-…` D4).
 *
 * Content ids are `{packId}/{localId}` (`01-…` §4) and are stable forever once
 * shipped, because they live in users' kit files — renaming one is a breaking
 * change that needs a migration. Two things follow, and neither was tested:
 *
 *  1. every id a pack registers must actually be qualified;
 *  2. the short name a tool goes on the wire under must be unique, because the
 *     provider's function-calling API has no namespaces to save us.
 *
 * Both are pinned here rather than left to review, because both fail silently:
 * an unqualified id works fine until a second pack arrives, and a colliding
 * wire name works fine until it picks the wrong tool.
 */

const QUALIFIED = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:[-_/][a-z0-9]+)*$/;

describe('registered content ids', () => {
	it('qualifies every tool, cartridge, goal card, world and brick', () => {
		const unqualified: string[] = [];
		const check = (ids: string[]) => {
			for (const id of ids) if (!QUALIFIED.test(id)) unqualified.push(id);
		};

		check((starterPack.tools ?? []).map((tool) => tool.id));
		check((starterPack.cartridges ?? []).map((cartridge) => cartridge.id));
		check((starterPack.goalCards ?? []).map((card) => card.id));
		check((starterPack.worlds ?? []).map((world) => world.id));
		check((starterPack.bricks ?? []).map((brick) => brick.id));
		check((starterPack.guardrails ?? []).map((guardrail) => guardrail.id));

		expect(unqualified).toEqual([]);
	});

	it('starts every id with the pack that ships it', () => {
		for (const tool of starterPack.tools ?? []) {
			expect(tool.id.startsWith(`${starterPack.id}/`), tool.id).toBe(true);
		}
		for (const card of starterPack.goalCards ?? []) {
			expect(card.id.startsWith(`${starterPack.id}/`), card.id).toBe(true);
		}
	});

	/**
	 * D4, test-first. World actions and sense channels are registered bare —
	 * `move`, `sight` — so a second world shipping its own `move` would collide
	 * with the Playroom's, and the registry's `getAction` returns whichever
	 * world it meets first.
	 *
	 * The fix is E6 (`14-…` §3): qualified world content ids with a kit-file
	 * migration, in WP13. `it.fails` until then — when E6 lands this test starts
	 * passing, which makes `it.fails` fail, which is the prompt to un-mark it.
	 */
	it.fails('qualifies world action and sense ids too — not until E6 (D4)', () => {
		const world = (starterPack.worlds ?? [])[0];
		if (!world) throw new Error('the starter pack has lost its world');

		const bare = [
			...world.actions.map((action) => action.id),
			...world.senses.map((sense) => sense.id)
		].filter((id) => !QUALIFIED.test(id));

		expect(bare).toEqual([]);
	});
});

/**
 * Wire names: what a qualified tool id collapses to for the provider's
 * function-calling API, which only accepts plain identifiers.
 */
describe('wire-name collisions', () => {
	function packWithTool(packId: string, tool: ToolDefinition): PackManifest {
		return {
			id: packId,
			name: packId,
			version: '1.0.0',
			requiresCore: '>=0.0.1',
			tools: [tool]
		};
	}

	const rivalCalculator: ToolDefinition = {
		id: 'rival/calculator',
		name: 'Rival calculator',
		description: 'Answers every sum with 42.',
		parameters: { type: 'object', properties: { expression: { type: 'string' } } },
		execute: () => ({ ok: true, output: '42' })
	};

	function sessionOfferingBoth() {
		const registry = buildRegistry();
		registry.registerPack(packWithTool('rival', rivalCalculator));
		const clock = createTestClock();
		return createSession({
			spec: buildSpec({ tools: ['starter/calculator', 'rival/calculator'] }),
			registry,
			provider: createMockProvider({ script: [] }),
			guardrails: [],
			options: { now: clock.now, newId: clock.newId, random: clock.random }
		});
	}

	it('registers both tools happily — the ids themselves do not collide', () => {
		const registry = createPackRegistry();
		registry.registerPack(starterPack);
		expect(() => registry.registerPack(packWithTool('rival', rivalCalculator))).not.toThrow();
		expect(registry.getTool('rival/calculator')).toBeDefined();
		expect(registry.getTool('starter/calculator')).toBeDefined();
	});

	/**
	 * D4, test-first. `starter/calculator` and `rival/calculator` both go on the
	 * wire as `calculator`; the second overwrites the first in the wire-name map
	 * and the model is offered one `calculator` that is not the one the builder
	 * ticked. Nothing anywhere says so.
	 *
	 * The fix belongs with E6's global collision check (`14-…` §3) in WP13:
	 * building a session that cannot name its own tools unambiguously should be
	 * an explicit error, not a silent last-one-wins.
	 */
	it.fails('refuses to build a session whose tools share a wire name (D4)', () => {
		expect(() => sessionOfferingBoth()).toThrow(/wire name|collision|calculator/i);
	});

	it('meanwhile, silently offers only one of them — this is the bug, pinned', () => {
		// Pins the *current* behaviour so the day it changes is a deliberate day.
		// Delete this test when the one above starts passing.
		const session = sessionOfferingBoth();
		expect(session).toBeDefined();
	});
});
