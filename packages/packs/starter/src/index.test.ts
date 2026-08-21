import {
	DEFAULT_TICK_BUDGET,
	createPackRegistry,
	validateSpec,
	type AgentSpec
} from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import starterPack, { starterGoalCards } from './index.js';
import { playroom } from './world/playroom.js';
import { playroomPredicates } from './world/predicates.js';

/**
 * The seam test: WP1 built the registry and the build-checks, WP2 built the
 * content. These assertions are what catch the two drifting apart.
 */

function registryWithStarter() {
	const registry = createPackRegistry();
	registry.registerPack(starterPack);
	return registry;
}

describe('the starter pack manifest', () => {
	it('registers without conflicts and exposes its content', () => {
		const registry = registryWithStarter();
		expect(registry.listPacks().map((pack) => pack.id)).toEqual(['starter']);
		expect(registry.listWorlds()).toHaveLength(1);
		expect(registry.listGoalCards()).toHaveLength(13);
	});

	it('namespaces every goal card id under the pack (01-ARCHITECTURE.md §4)', () => {
		for (const card of starterGoalCards) {
			expect(card.id.startsWith('starter/')).toBe(true);
		}
	});

	/**
	 * `16-…` §1.1: a card that can be won states about how long winning takes,
	 * and a card that cannot be won inside the default budget says so on its
	 * face. V1.0 shipped two cards that failed both halves (`12-…` C6).
	 */
	it('gives every winnable card a par inside the default step budget', () => {
		for (const card of starterGoalCards) {
			if (card.successCondition === 'free-play-manual') {
				expect(card.par).toBeUndefined();
				continue;
			}
			expect(card.par).toBeGreaterThan(0);
			if (card.expert) {
				expect(card.par).toBeGreaterThan(DEFAULT_TICK_BUDGET);
			} else {
				expect(card.par).toBeLessThanOrEqual(DEFAULT_TICK_BUDGET);
			}
		}
	});

	it('ships exactly one expert card, so the step dial has a reason to exist', () => {
		expect(starterGoalCards.filter((card) => card.expert)).toHaveLength(1);
	});

	it('resolves the world, layout, and predicate behind every goal card', () => {
		const registry = registryWithStarter();
		for (const card of starterGoalCards) {
			const world = registry.getWorld(card.worldId);
			expect(world, `world for ${card.id}`).toBeDefined();
			expect(
				world?.layouts.some((layout) => layout.id === card.layoutId),
				`layout ${card.layoutId} for ${card.id}`
			).toBe(true);
			expect(world?.predicates[card.successCondition], `predicate for ${card.id}`).toBeDefined();
			expect(
				playroomPredicates[card.successCondition],
				`predicate impl for ${card.id}`
			).toBeDefined();
		}
	});

	it('gives every goal card the copy the Goal Card rack needs', () => {
		for (const card of starterGoalCards) {
			expect(card.title.length).toBeGreaterThan(0);
			expect(card.goalText.length).toBeGreaterThan(0);
			expect(card.hints.length).toBeGreaterThan(0);
			expect(card.teachesConcepts.length).toBeGreaterThan(0);
		}
	});

	it('exposes every world action and sense channel through the registry', () => {
		const registry = registryWithStarter();
		for (const action of playroom.actions) {
			expect(registry.getAction(action.id)?.id, action.id).toBe(action.id);
		}
		for (const sense of playroom.senses) {
			expect(registry.getSenseChannel(sense.id)?.id, sense.id).toBe(sense.id);
		}
	});

	it('describes every predicate the world implements, and implements every one it describes', () => {
		expect(Object.keys(playroom.predicates).sort()).toEqual(Object.keys(playroomPredicates).sort());
	});
});

describe('validateSpec against real starter content', () => {
	function spec(overrides: Partial<AgentSpec> = {}): AgentSpec {
		return {
			id: '11111111-1111-4111-8111-111111111111',
			name: 'Snackbot 3000',
			bricks: {
				llm: {
					cartridgeId: 'test/cartridge',
					temperature: 0.7,
					maxTokens: 300,
					personality: 'Cheerful.'
				},
				sense: { channels: ['sight', 'compass'] },
				actions: { enabled: ['move', 'pick_up', 'give', 'say'] }
			},
			goalCardId: 'starter/snack',
			createdAt: '2026-08-12T09:00:00Z',
			updatedAt: '2026-08-12T09:30:00Z',
			schemaVersion: 1,
			...overrides
		};
	}

	/** The starter pack ships no cartridges, so a fake provider pack stands in for the LLM brick. */
	function registryWithCartridge() {
		const registry = registryWithStarter();
		registry.registerPack({
			id: 'test',
			name: 'Test cartridges',
			version: '1.0.0',
			requiresCore: '>=0.0.1',
			cartridges: [
				{
					id: 'test/cartridge',
					providerId: 'test',
					model: 'test-model',
					displayName: 'Test',
					blurb: 'For tests.',
					stats: { words: 1, reasoning: 1, speed: 1 },
					costHint: 'low',
					defaults: { temperature: 0.7, maxTokens: 300 }
				}
			]
		});
		return registry;
	}

	it('passes a bot built entirely from real starter ids', () => {
		expect(validateSpec(spec(), registryWithCartridge())).toEqual([]);
	});

	it('flags a sense channel and an action the Playroom does not have', () => {
		const broken = spec();
		broken.bricks.sense = { channels: ['x-ray-vision'] };
		broken.bricks.actions = { enabled: ['teleport'] };
		const codes = validateSpec(broken, registryWithCartridge()).map((problem) => problem.code);
		expect(codes).toContain('unknown-sense-channel');
		expect(codes).toContain('unknown-action');
	});

	it('blocks GO for a goal card that is not in the box', () => {
		const problems = validateSpec(
			spec({ goalCardId: 'starter/moon-landing' }),
			registryWithCartridge()
		);
		expect(problems).toContainEqual(
			expect.objectContaining({ code: 'unknown-goal-card', severity: 'blocking' })
		);
	});
});
