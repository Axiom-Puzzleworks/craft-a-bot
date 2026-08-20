import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createPackRegistry, type PackRegistry } from '../pack-registry.js';
import { toSpecV2, type AgentSpecV2 } from '../schemas/agent-spec-v2.js';
import type { AgentSpec } from '../schemas/agent-spec.js';
import type { BrickKindDefinition } from '../types/brick.js';
import { buildAgentCard } from './agent-card.js';

/**
 * `buildAgentCard` (WP33 stage A, `14-…` §5.8): a bot's own passport, derived
 * entirely from its spec and the registry. Tested here the same way
 * `kit-export.test.ts` tests `buildKitFile` — against hand-built fixture
 * brick kinds, never the real starter pack, because `core` cannot depend on a
 * pack. The real proof, against real starter content, lives in
 * `pack-starter/src/brick-runtimes.test.ts` alongside `describeFittedBricks`'s
 * own — the same "phrases are starter content, ordering is core's job" split
 * that file's own header comment already draws.
 */

function llmKind(overrides: Partial<BrickKindDefinition> = {}): BrickKindDefinition {
	return {
		id: 'test/llm',
		slot: 'brain',
		name: 'Brain Brick',
		description: 'A brain.',
		realName: 'LLM',
		realExplanation: 'A large language model.',
		configSchema: z.object({}).passthrough(),
		configVersion: 1,
		defaults: {},
		...overrides
	};
}

function registryWith(kinds: BrickKindDefinition[]): PackRegistry {
	const registry = createPackRegistry();
	registry.registerPack({
		id: 'test',
		name: 'Test pack',
		version: '1.2.3',
		requiresCore: '>=0.0.1',
		brickKinds: kinds
	});
	return registry;
}

function makeSpecV1(overrides: Partial<AgentSpec> = {}): AgentSpec {
	return {
		id: '11111111-1111-4111-8111-111111111111',
		name: 'Snackbot 3000',
		bricks: {
			llm: { cartridgeId: 'test/cartridge', temperature: 0.7, maxTokens: 300, personality: '' }
		},
		goalCardId: 'starter/snack',
		createdAt: '2026-08-12T09:00:00Z',
		updatedAt: '2026-08-12T09:30:00Z',
		schemaVersion: 1,
		...overrides
	};
}

function makeSpec(overrides: Partial<AgentSpecV2> = {}): AgentSpecV2 {
	return { ...toSpecV2(makeSpecV1()), ...overrides };
}

describe('buildAgentCard', () => {
	it('carries the bot’s own name and goal card id', () => {
		const card = buildAgentCard(makeSpec({ name: 'Rusty' }), registryWith([llmKind()]));
		expect(card.name).toBe('Rusty');
		expect(card.goalCardId).toBe('starter/snack');
	});

	it('describes a fitted brick with its own describeFitted, config and all', () => {
		const kind = llmKind({
			configSchema: z.object({ personality: z.string() }),
			describeFitted: (config: { personality: string }) =>
				`a brain that says: ${config.personality}`
		});
		const spec = makeSpec({
			bricks: [
				{ slot: 'brain', kind: 'test/llm', configVersion: 1, config: { personality: 'hello!' } }
			]
		});

		const card = buildAgentCard(spec, registryWith([kind]));
		expect(card.bricks).toEqual([
			{
				slot: 'brain',
				kind: 'test/llm',
				name: 'Brain Brick',
				description: 'a brain that says: hello!'
			}
		]);
	});

	it('falls back to the kind’s own name when it has no describeFitted', () => {
		const spec = makeSpec({
			bricks: [{ slot: 'brain', kind: 'test/llm', configVersion: 1, config: {} }]
		});
		const card = buildAgentCard(spec, registryWith([llmKind()]));
		expect(card.bricks[0]?.description).toBe('Brain Brick');
	});

	it('migrates a brick’s config before describing it, the same as the system prompt does', () => {
		const kind = llmKind({
			configVersion: 2,
			migrateConfig: { 1: (raw) => ({ ...raw, tone: raw['personality'] }) },
			configSchema: z.object({ tone: z.string() }),
			describeFitted: (config: { tone: string }) => `sounds ${config.tone}`
		});
		const spec = makeSpec({
			bricks: [
				{
					slot: 'brain',
					kind: 'test/llm',
					configVersion: 1,
					config: { personality: 'cheerful' }
				}
			]
		});

		const card = buildAgentCard(spec, registryWith([kind]));
		expect(card.bricks[0]?.description).toBe('sounds cheerful');
	});

	/**
	 * Deliberately unlike `describeFittedBricks` (`session/prompt.ts`), which
	 * silently drops a brick whose config no longer validates — fine for a
	 * system prompt a model reads once, wrong for a transparency artefact
	 * whose whole job is to say what a bot actually carries. The card keeps
	 * the brick and falls back to the kind's own name instead of hiding it.
	 */
	it('keeps a brick whose config fails to validate, rather than dropping it', () => {
		const kind = llmKind({ configSchema: z.object({ required: z.string() }) });
		const spec = makeSpec({
			bricks: [{ slot: 'brain', kind: 'test/llm', configVersion: 1, config: {} }]
		});

		const card = buildAgentCard(spec, registryWith([kind]));
		expect(card.bricks).toHaveLength(1);
		expect(card.bricks[0]?.description).toBe('Brain Brick');
	});

	it('keeps a brick from a pack that is no longer installed, naming the raw kind id honestly', () => {
		const spec = makeSpec({
			bricks: [{ slot: 'equipment', kind: 'gone/tool', configVersion: 1, config: {} }]
		});

		const card = buildAgentCard(spec, registryWith([]));
		expect(card.bricks).toEqual([
			{ slot: 'equipment', kind: 'gone/tool', name: 'gone/tool', description: 'gone/tool' }
		]);
		// Provenance cannot name a pack it does not know about either.
		expect(card.provenance.brickKinds).toEqual({});
		expect(card.provenance.packs).toEqual({});
	});

	it('names only the packs actually used, not every pack installed', () => {
		const used = llmKind();
		const unused = llmKind({ id: 'test/unused', slot: 'equipment' });
		const registry = createPackRegistry();
		registry.registerPack({
			id: 'used-pack',
			name: 'Used',
			version: '1.0.0',
			requiresCore: '>=0.0.1',
			brickKinds: [used]
		});
		registry.registerPack({
			id: 'unused-pack',
			name: 'Unused',
			version: '2.0.0',
			requiresCore: '>=0.0.1',
			brickKinds: [unused]
		});

		const spec = makeSpec({
			bricks: [{ slot: 'brain', kind: 'test/llm', configVersion: 1, config: {} }]
		});
		const card = buildAgentCard(spec, registry);

		expect(card.provenance.packs).toEqual({ 'used-pack': '1.0.0' });
		expect(card.provenance.brickKinds).toEqual({ 'test/llm': 'used-pack' });
	});

	it('accepts a v1 spec, the same as buildKitFile does', () => {
		const card = buildAgentCard(makeSpecV1(), registryWith([llmKind()]));
		expect(card.name).toBe('Snackbot 3000');
		expect(card.bricks).toHaveLength(1);
	});

	it('never contains run history, keys or user identity — safe to share, like a kit file', () => {
		const spec = makeSpec({
			bricks: [
				{ slot: 'brain', kind: 'test/llm', configVersion: 1, config: { personality: 'sk-secret' } }
			]
		});
		const serialised = JSON.stringify(buildAgentCard(spec, registryWith([llmKind()])));
		expect(serialised).not.toMatch(/runId|lastRunId|events|usage|apiKey/i);
	});
});
