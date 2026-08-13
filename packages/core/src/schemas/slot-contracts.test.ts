import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createPackRegistry } from '../pack-registry.js';
import type { BrickKindDefinition } from '../types/brick.js';
import type { AgentSpecV2 } from './agent-spec-v2.js';
import { brainSlotSchema, memorySlotSchema, slotConfig } from './slot-contracts.js';

/**
 * **Slot contracts** (WP14 slice 3c).
 *
 * The two sockets core reads rather than is contributed to. The distinction
 * that matters, and what these tests are really pinning: core knows what the
 * *brain socket* means, not what `starter/llm` is. Every kind below is invented
 * here, and a brain from a pack core has never heard of works exactly as well.
 */

function registryWith(...kinds: BrickKindDefinition[]) {
	const registry = createPackRegistry();
	registry.registerPack({
		id: 'somebody-else',
		name: 'Somebody Else',
		version: '1.0.0',
		requiresCore: '>=1.0.0',
		brickKinds: kinds
	});
	return registry;
}

const kind = (id: string, slot: BrickKindDefinition['slot']): BrickKindDefinition =>
	({
		id,
		slot,
		name: id,
		description: id,
		realName: id,
		realExplanation: id,
		configSchema: z.record(z.string(), z.unknown()),
		configVersion: 1,
		defaults: {}
	}) as BrickKindDefinition;

function spec(bricks: AgentSpecV2['bricks']): AgentSpecV2 {
	return {
		id: '11111111-1111-4111-8111-111111111111',
		name: 'Testbot',
		schemaVersion: 2,
		bricks,
		goalCardId: 'test/card',
		identity: { displayName: 'Testbot', boxArtSeed: 'seed' },
		createdAt: '2026-08-13T09:00:00Z',
		updatedAt: '2026-08-13T09:00:00Z'
	};
}

const BRAIN = { cartridgeId: 'elsewhere/big-thinker', temperature: 0.7, maxTokens: 300 };

describe('reading a socket through its contract', () => {
	it('reads a brain from a pack core has never heard of', () => {
		const config = slotConfig(
			spec([{ slot: 'brain', kind: 'somebody-else/oracle', configVersion: 1, config: BRAIN }]),
			registryWith(kind('somebody-else/oracle', 'brain')),
			'brain',
			brainSlotSchema
		);
		expect(config).toEqual(BRAIN);
	});

	it('ignores fields the contract does not ask about', () => {
		// The brick's own config is richer than what core reads; core takes what
		// it needs and leaves the rest to the brick.
		const config = slotConfig(
			spec([
				{
					slot: 'brain',
					kind: 'somebody-else/oracle',
					configVersion: 1,
					config: { ...BRAIN, personality: 'Terse.', entrails: 'goat' }
				}
			]),
			registryWith(kind('somebody-else/oracle', 'brain')),
			'brain',
			brainSlotSchema
		);
		expect(config).toEqual(BRAIN);
	});

	it('reads the memory socket, whatever window size it names', () => {
		// Core's contract is any positive integer; the starter brick offers 3, 10
		// or 30. Which sizes a brick offers is that brick's business.
		const config = slotConfig(
			spec([
				{
					slot: 'memory',
					kind: 'somebody-else/ledger',
					configVersion: 1,
					config: { windowSize: 7, notebook: true }
				}
			]),
			registryWith(kind('somebody-else/ledger', 'memory')),
			'memory',
			memorySlotSchema
		);
		expect(config).toEqual({ windowSize: 7, notebook: true });
	});

	it('finds nothing in an empty socket', () => {
		expect(slotConfig(spec([]), registryWith(), 'brain', brainSlotSchema)).toBeUndefined();
	});

	it('finds nothing when the kind is not installed', () => {
		const found = slotConfig(
			spec([{ slot: 'brain', kind: 'nobody/nothing', configVersion: 1, config: BRAIN }]),
			registryWith(),
			'brain',
			brainSlotSchema
		);
		expect(found).toBeUndefined();
	});

	it('finds nothing when the kind belongs in a different socket', () => {
		const found = slotConfig(
			spec([{ slot: 'brain', kind: 'somebody-else/wheels', configVersion: 1, config: BRAIN }]),
			registryWith(kind('somebody-else/wheels', 'mobility')),
			'brain',
			brainSlotSchema
		);
		expect(found).toBeUndefined();
	});

	/**
	 * The documented limit. A brick shaped differently is fitted, validated, and
	 * then simply not read — so the loop falls back to its defaults rather than
	 * half-configuring itself from something it does not understand.
	 */
	it('finds nothing when what is fitted does not answer the contract', () => {
		const found = slotConfig(
			spec([
				{
					slot: 'memory',
					kind: 'somebody-else/vector',
					configVersion: 1,
					config: { embeddings: 'text-3', topK: 5 }
				}
			]),
			registryWith(kind('somebody-else/vector', 'memory')),
			'memory',
			memorySlotSchema
		);
		expect(found).toBeUndefined();
	});

	it('takes a v1 spec, because a bot on somebody’s shelf still has to run', () => {
		const found = slotConfig(
			{
				id: '11111111-1111-4111-8111-111111111111',
				name: 'Old Timer',
				bricks: { llm: { ...BRAIN, personality: '' } },
				goalCardId: 'test/card',
				createdAt: '2026-08-13T09:00:00Z',
				updatedAt: '2026-08-13T09:00:00Z',
				schemaVersion: 1
			},
			registryWith(kind('starter/llm', 'brain')),
			'brain',
			brainSlotSchema
		);
		expect(found).toEqual(BRAIN);
	});
});
