import { describe, expect, it } from 'vitest';
import { stubService } from './types/guardrail-service.test.js';
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
		bricks: [
			{
				id: 'core/llm',
				kind: 'llm',
				name: 'LLM Brick',
				description: 'The brain.',
				realName: 'LLM',
				realExplanation: 'The chat-completions call at the heart of every tick.'
			}
		],
		tools: [
			{
				id: 'starter/calculator',
				name: 'Calculator',
				description: 'Evaluate arithmetic.',
				parameters: {},
				execute: () => ({ ok: true, output: '4' })
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

	it('registers guardrail services a pack ships (29-… §4.3, WP39), and refuses a broken one', () => {
		const registry = createPackRegistry();
		const service = stubService({ id: 'test-guard/stub' });
		registry.registerPack({
			id: 'test-guard',
			name: 'Test guard',
			version: '1.0.0',
			requiresCore: '>=0.0.1',
			guardrailServices: [service]
		});
		expect(registry.getGuardrailService('test-guard/stub')).toBe(service);
		expect(registry.listGuardrailServices()).toEqual([service]);
		expect(registry.getGuardrailService('test-guard/nope')).toBeUndefined();

		expect(() =>
			registry.registerPack({
				id: 'test-guard-2',
				name: 'Again',
				version: '1.0.0',
				requiresCore: '>=0.0.1',
				guardrailServices: [stubService({ id: 'test-guard/stub' })]
			})
		).toThrow(/guardrail service/);

		expect(() =>
			registry.registerPack({
				id: 'test-guard-3',
				name: 'Broken',
				version: '1.0.0',
				requiresCore: '>=0.0.1',
				guardrailServices: [stubService({ id: 'test-guard-3/broken', hooks: [] })]
			})
		).toThrow(/declares no hooks/);
	});

	it('registers evaluators and assertion cards a pack ships (31-… §4.1, WP43), refusing a broken evaluator', () => {
		const registry = createPackRegistry();
		const evaluator = {
			id: 'test-eval/always-pass',
			name: 'Always pass',
			description: 'Passes.',
			kind: 'deterministic' as const,
			evaluate: () =>
				Promise.resolve({
					evaluatorId: 'test-eval/always-pass',
					verdict: 'pass' as const,
					explanation: 'ok',
					evidence: []
				})
		};
		const card = {
			id: 'test-eval/card',
			title: 'A card',
			schemaVersion: 1 as const,
			quantifier: 'never' as const,
			when: { kind: 'call-name-is' as const, value: 'move' }
		};
		registry.registerPack({
			id: 'test-eval',
			name: 'Test eval',
			version: '1.0.0',
			requiresCore: '>=0.0.1',
			evaluators: [evaluator],
			assertionCards: [card]
		});
		expect(registry.getEvaluator('test-eval/always-pass')).toBe(evaluator);
		expect(registry.listEvaluators()).toEqual([evaluator]);
		expect(registry.getAssertionCard('test-eval/card')).toBe(card);
		expect(registry.listAssertionCards()).toEqual([card]);
		expect(() =>
			registry.registerPack({
				id: 'test-eval-2',
				name: 'Broken',
				version: '1.0.0',
				requiresCore: '>=0.0.1',
				evaluators: [{ ...evaluator, id: 'test-eval-2/judge', kind: 'model' }]
			})
		).toThrow(/is model but has no createOffline/);
	});

	it('registers policy cards a pack ships (14-… §4.6, WP22)', () => {
		const registry = createPackRegistry();
		registry.registerPack({
			id: 'test-policy',
			name: 'Test policy',
			version: '1.0.0',
			requiresCore: '>=0.0.1',
			policyCards: [
				{
					id: 'test-policy/no-move',
					title: 'No moving',
					schemaVersion: 1,
					rules: [
						{
							hook: 'pre-act',
							when: { kind: 'call-name-is', value: 'move' },
							then: 'block-action',
							reason: 'Standing still today.'
						}
					]
				}
			]
		});

		expect(registry.getPolicyCard('test-policy/no-move')?.title).toBe('No moving');
		expect(registry.getPolicyCard('nope')).toBeUndefined();
		expect(registry.listPolicyCards()).toHaveLength(1);
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

	it('registers providers a pack contributes (06-… §8, WP26)', () => {
		const registry = createPackRegistry();
		registry.registerPack({
			id: 'test-provider',
			name: 'Test provider',
			version: '1.0.0',
			requiresCore: '>=0.0.1',
			providers: [
				{
					id: 'test-llm',
					name: 'Test LLM',
					keyRequirement: 'none',
					create: () => ({
						id: 'test-llm',
						name: 'Test LLM',
						keyRequirement: 'none',
						validateKey: async () => ({ ok: true, message: 'fine' }),
						chat: async () => ({
							text: '',
							toolCall: null,
							usage: { inputTokens: 0, outputTokens: 0 },
							raw: null,
							finishReason: 'stop'
						})
					})
				}
			]
		});

		const factory = registry.getProviderFactory('test-llm');
		expect(factory?.name).toBe('Test LLM');
		expect(factory?.create({ apiKey: '' }).id).toBe('test-llm');
		expect(registry.getProviderFactory('nope')).toBeUndefined();
		expect(registry.listProviderFactories()).toHaveLength(1);
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
					parameters: {},
					execute: () => ({ ok: true, output: 'nope' })
				}
			]
		};

		expect(() => registry.registerPack(collidingPack)).toThrow(/conflict/);
	});
});

/**
 * **Bare local names** (E6, `14-…` §3). World content is qualified now, and
 * specs written before WP13 name it bare — so the registry answers to both,
 * but only while the bare name means one thing (`12-…` D4).
 */
describe('resolving world content by its bare name', () => {
	function worldWith(id: string, actionId: string) {
		return {
			id,
			name: id,
			layouts: [{ id: 'only', name: 'Only', initialState: {} }],
			actions: [
				{ id: actionId, name: 'Move', description: 'Move.', parameters: { type: 'object' } }
			],
			senses: [{ id: `${id}/sight`, name: 'Sight', description: 'See.' }],
			predicates: {},
			create: () => {
				throw new Error('not needed');
			}
		};
	}

	it('finds qualified content by its qualified id', () => {
		const registry = createPackRegistry();
		registry.registerPack({
			id: 'a',
			name: 'A',
			version: '1.0.0',
			requiresCore: '>=0.0.1',
			worlds: [worldWith('a/world', 'a/world/move')]
		});
		expect(registry.getAction('a/world/move')?.id).toBe('a/world/move');
	});

	it('finds it by its bare name too, so older specs keep working', () => {
		const registry = createPackRegistry();
		registry.registerPack({
			id: 'a',
			name: 'A',
			version: '1.0.0',
			requiresCore: '>=0.0.1',
			worlds: [worldWith('a/world', 'a/world/move')]
		});
		expect(registry.getAction('move')?.id).toBe('a/world/move');
		expect(registry.getSenseChannel('sight')?.id).toBe('a/world/sight');
	});

	it('refuses a bare name once two worlds answer to it', () => {
		// The failure D4 describes, made honest: previously whichever world was
		// met first won, silently.
		const registry = createPackRegistry();
		registry.registerPack({
			id: 'a',
			name: 'A',
			version: '1.0.0',
			requiresCore: '>=0.0.1',
			worlds: [worldWith('a/world', 'a/world/move')]
		});
		registry.registerPack({
			id: 'b',
			name: 'B',
			version: '1.0.0',
			requiresCore: '>=0.0.1',
			worlds: [worldWith('b/world', 'b/world/move')]
		});

		expect(registry.getAction('move')).toBeUndefined();
		// Each is still perfectly reachable by the name that identifies it.
		expect(registry.getAction('a/world/move')?.id).toBe('a/world/move');
		expect(registry.getAction('b/world/move')?.id).toBe('b/world/move');
	});
});
