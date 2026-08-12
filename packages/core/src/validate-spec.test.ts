import { describe, expect, it } from 'vitest';
import { validateSpec } from './validate-spec.js';
import { createPackRegistry, type PackRegistry } from './pack-registry.js';
import type { AgentSpec } from './schemas/agent-spec.js';
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

function buildRegistry(): PackRegistry {
	const registry = createPackRegistry();
	const starter: PackManifest = {
		id: 'starter',
		name: 'Starter',
		version: '1.0.0',
		requiresCore: '>=1.0.0',
		tools: [
			{ id: 'starter/calculator', name: 'Calculator', description: 'Maths.', parameters: {} },
			{
				id: 'starter/notebook_write',
				name: 'Notebook Write',
				description: 'Write to the scratchpad.',
				parameters: {},
				requiresNotebook: true
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
	const openai: PackManifest = {
		id: 'openai',
		name: 'OpenAI',
		version: '1.0.0',
		requiresCore: '>=1.0.0',
		cartridges: [
			{
				id: 'openai/quick-thinker',
				providerId: 'openai',
				model: 'gpt-5-mini',
				displayName: 'Quick Thinker',
				blurb: 'Fast.',
				stats: { words: 2, reasoning: 2, speed: 3 },
				costHint: 'low',
				defaults: { temperature: 0.7, maxTokens: 300 }
			}
		]
	};
	registry.registerPack(starter);
	registry.registerPack(openai);
	return registry;
}

function validSpec(overrides: Partial<AgentSpec> = {}): AgentSpec {
	return {
		id: '11111111-1111-4111-8111-111111111111',
		name: 'Test Bot',
		bricks: {
			llm: {
				cartridgeId: 'openai/quick-thinker',
				temperature: 0.7,
				maxTokens: 300,
				personality: 'Cheerful.'
			},
			memory: { windowSize: 10, notebook: true },
			tools: { enabled: ['starter/calculator'] },
			sense: { channels: ['sight'] },
			actions: { enabled: ['move'] },
			safety: { maxTicks: 30, blockedActions: ['say'], approvalMode: false }
		},
		goalCardId: 'starter/say-hello',
		createdAt: '2026-08-12T09:00:00Z',
		updatedAt: '2026-08-12T09:30:00Z',
		schemaVersion: 1,
		...overrides
	};
}

describe('validateSpec', () => {
	it('returns no problems for a fully valid spec', () => {
		expect(validateSpec(validSpec(), buildRegistry())).toEqual([]);
	});

	it('accepts a bare-minimum bot — a brain and a card, no other bricks fitted', () => {
		const spec = validSpec({
			bricks: {
				llm: {
					cartridgeId: 'openai/quick-thinker',
					temperature: 0.7,
					maxTokens: 300,
					personality: ''
				}
			}
		});
		expect(validateSpec(spec, buildRegistry())).toEqual([]);
	});

	it('reports missing-brain (blocking) when there is no LLM brick', () => {
		const spec = validSpec();
		delete spec.bricks.llm;
		const problems = validateSpec(spec, buildRegistry());
		expect(problems).toContainEqual(
			expect.objectContaining({ code: 'missing-brain', severity: 'blocking' })
		);
	});

	it('reports unknown-cartridge (blocking) for an unresolvable cartridge id', () => {
		const spec = validSpec({
			bricks: {
				...validSpec().bricks,
				llm: { cartridgeId: 'bogus', temperature: 0.7, maxTokens: 300, personality: '' }
			}
		});
		const problems = validateSpec(spec, buildRegistry());
		expect(problems).toContainEqual(
			expect.objectContaining({ code: 'unknown-cartridge', severity: 'blocking' })
		);
	});

	it('reports unknown-goal-card (blocking) for an unresolvable goal card id', () => {
		const spec = validSpec({ goalCardId: 'bogus' });
		const problems = validateSpec(spec, buildRegistry());
		expect(problems).toContainEqual(
			expect.objectContaining({ code: 'unknown-goal-card', severity: 'blocking' })
		);
	});

	it('reports unknown-tool (warning) for an unresolvable tool id', () => {
		const spec = validSpec();
		spec.bricks.tools = { enabled: ['bogus-tool'] };
		const problems = validateSpec(spec, buildRegistry());
		expect(problems).toContainEqual(
			expect.objectContaining({ code: 'unknown-tool', severity: 'warning' })
		);
	});

	it('reports tool-needs-notebook (warning) when a notebook tool is on but the notebook is off', () => {
		const spec = validSpec();
		spec.bricks.tools = { enabled: ['starter/notebook_write'] };
		spec.bricks.memory = { windowSize: 10, notebook: false };
		const problems = validateSpec(spec, buildRegistry());
		expect(problems).toContainEqual(
			expect.objectContaining({ code: 'tool-needs-notebook', severity: 'warning' })
		);
	});

	it('reports tool-needs-notebook (warning) when the Memory brick is entirely absent', () => {
		const spec = validSpec();
		spec.bricks.tools = { enabled: ['starter/notebook_write'] };
		delete spec.bricks.memory;
		const problems = validateSpec(spec, buildRegistry());
		expect(problems).toContainEqual(
			expect.objectContaining({ code: 'tool-needs-notebook', severity: 'warning' })
		);
	});

	it('reports unknown-sense-channel (warning) for an unresolvable sense channel', () => {
		const spec = validSpec();
		spec.bricks.sense = { channels: ['bogus-channel'] };
		const problems = validateSpec(spec, buildRegistry());
		expect(problems).toContainEqual(
			expect.objectContaining({ code: 'unknown-sense-channel', severity: 'warning' })
		);
	});

	it('reports unknown-action (warning) for an unresolvable enabled action', () => {
		const spec = validSpec();
		spec.bricks.actions = { enabled: ['bogus-action'] };
		const problems = validateSpec(spec, buildRegistry());
		expect(problems).toContainEqual(
			expect.objectContaining({ code: 'unknown-action', severity: 'warning' })
		);
	});

	it('reports unknown-blocked-action (warning) for an unresolvable safety blocklist entry', () => {
		const spec = validSpec();
		spec.bricks.safety = { maxTicks: 30, blockedActions: ['bogus-action'], approvalMode: false };
		const problems = validateSpec(spec, buildRegistry());
		expect(problems).toContainEqual(
			expect.objectContaining({ code: 'unknown-blocked-action', severity: 'warning' })
		);
	});

	it('reports every dangling id at once for a badly broken spec', () => {
		const spec = validSpec({ goalCardId: 'bogus' });
		spec.bricks.tools = { enabled: ['bogus-tool'] };
		spec.bricks.sense = { channels: ['bogus-channel'] };
		spec.bricks.actions = { enabled: ['bogus-action'] };
		delete spec.bricks.llm;
		const problems = validateSpec(spec, buildRegistry());
		const codes = problems.map((p) => p.code).sort();
		expect(codes).toEqual(
			[
				'missing-brain',
				'unknown-action',
				'unknown-goal-card',
				'unknown-sense-channel',
				'unknown-tool'
			].sort()
		);
	});
});
