import { describe, expect, it } from 'vitest';
import { createPackRegistry } from './pack-registry.js';
import type { PackManifest } from './schemas/pack-manifest.js';
import type { WorldDefinition } from './types/world.js';

const playroom: WorldDefinition = {
	id: 'starter/playroom',
	name: 'The Playroom',
	layouts: [{ id: 'default', name: 'Default', initialState: {} }],
	actions: [
		{ id: 'move', name: 'Move', description: 'Move one step.', parameters: {} },
		{ id: 'say', name: 'Say', description: 'Speak.', parameters: {} }
	],
	senses: [{ id: 'sight', name: 'Sight', description: 'See adjacent cells.' }],
	predicates: { 'said-hello': 'said hello near teddy' },
	create: () => {
		throw new Error('not implemented — WP2');
	}
};

function starterManifest(): PackManifest {
	return {
		id: 'starter',
		name: 'My Very First Agent — Starter Parts',
		version: '1.0.0',
		requiresCore: '>=1.0.0',
		bricks: [{ id: 'core/llm', kind: 'llm', name: 'LLM Brick', description: 'The brain.' }],
		tools: [
			{
				id: 'starter/calculator',
				name: 'Calculator',
				description: 'Evaluate arithmetic.',
				parameters: {}
			}
		],
		goalCards: [
			{
				id: 'starter/say-hello',
				title: 'Say Hello!',
				goalText: 'Introduce yourself to Teddy.',
				worldId: 'starter/playroom',
				layoutId: 'default',
				successCondition: 'said-hello',
				hints: [],
				teachesConcepts: ['loop']
			}
		],
		worlds: [playroom]
	};
}

function openaiManifest(): PackManifest {
	return {
		id: 'openai',
		name: 'OpenAI Cartridges',
		version: '1.0.0',
		requiresCore: '>=1.0.0',
		cartridges: [
			{
				id: 'openai/quick-thinker',
				providerId: 'openai',
				model: 'gpt-5-mini',
				displayName: 'Quick Thinker',
				blurb: 'Fast and cheerful.',
				stats: { words: 2, reasoning: 2, speed: 3 },
				costHint: 'low',
				defaults: { temperature: 0.7, maxTokens: 300 }
			}
		]
	};
}

describe('PackRegistry', () => {
	it('resolves content ids across registered packs', () => {
		const registry = createPackRegistry();
		registry.registerPack(starterManifest());
		registry.registerPack(openaiManifest());

		expect(registry.getTool('starter/calculator')?.name).toBe('Calculator');
		expect(registry.getGoalCard('starter/say-hello')?.title).toBe('Say Hello!');
		expect(registry.getCartridge('openai/quick-thinker')?.providerId).toBe('openai');
		expect(registry.getWorld('starter/playroom')?.name).toBe('The Playroom');
		expect(registry.getBrick('core/llm')?.kind).toBe('llm');
	});

	it('resolves sense channels and actions by searching registered worlds', () => {
		const registry = createPackRegistry();
		registry.registerPack(starterManifest());

		expect(registry.getSenseChannel('sight')?.name).toBe('Sight');
		expect(registry.getAction('move')?.name).toBe('Move');
		expect(registry.getAction('unknown-action')).toBeUndefined();
	});

	it('returns undefined for unknown ids rather than throwing', () => {
		const registry = createPackRegistry();
		expect(registry.getTool('nope')).toBeUndefined();
		expect(registry.getCartridge('nope')).toBeUndefined();
		expect(registry.getGoalCard('nope')).toBeUndefined();
	});

	it('lists registered packs and content', () => {
		const registry = createPackRegistry();
		registry.registerPack(starterManifest());
		registry.registerPack(openaiManifest());

		expect(
			registry
				.listPacks()
				.map((p) => p.id)
				.sort()
		).toEqual(['openai', 'starter']);
		expect(registry.listTools()).toHaveLength(1);
		expect(registry.listCartridges()).toHaveLength(1);
		expect(registry.listGoalCards()).toHaveLength(1);
		expect(registry.listWorlds()).toHaveLength(1);
	});

	it('registers guardrails a pack contributes, without any engine change (08 §7.3)', () => {
		const registry = createPackRegistry();
		registry.registerPack({
			id: 'test-guardrails',
			name: 'Test guardrails',
			version: '1.0.0',
			requiresCore: '>=0.0.1',
			guardrails: [
				{
					id: 'test/always-allow',
					name: 'Always Allow',
					description: 'A do-nothing guardrail, proving packs can contribute them.',
					hooks: ['pre-act'],
					create: () => ({
						id: 'test/always-allow',
						name: 'Always Allow',
						description: 'A do-nothing guardrail.',
						hooks: ['pre-act'],
						check: () => ({ allow: true })
					})
				}
			]
		});

		const definition = registry.getGuardrail('test/always-allow');
		expect(definition?.name).toBe('Always Allow');
		expect(definition?.create().check({} as never)).toEqual({ allow: true });
		expect(registry.getGuardrail('test/nope')).toBeUndefined();
	});

	it('rejects registering the same pack id twice', () => {
		const registry = createPackRegistry();
		registry.registerPack(starterManifest());
		expect(() => registry.registerPack(starterManifest())).toThrow(/already registered/);
	});

	it('rejects a colliding content id across two different packs', () => {
		const registry = createPackRegistry();
		registry.registerPack(starterManifest());

		const collidingPack: PackManifest = {
			id: 'evil-pack',
			name: 'Evil Pack',
			version: '1.0.0',
			requiresCore: '>=1.0.0',
			tools: [
				{
					id: 'starter/calculator', // same id as starter's tool
					name: 'Fake Calculator',
					description: 'Not the real one.',
					parameters: {}
				}
			]
		};

		expect(() => registry.registerPack(collidingPack)).toThrow(/conflict/);
	});
});
