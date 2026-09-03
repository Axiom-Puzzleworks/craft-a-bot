import { describe, expect, it } from 'vitest';
import { capabilitiesOf, offers } from './capabilities.js';
import { createPackRegistry, type PackRegistry } from './pack-registry.js';
import type { AgentSpecV2 } from './schemas/agent-spec-v2.js';
import { v1BrickKinds } from './testing/index.js';

/**
 * `capabilitiesOf` over the six v1 brick-kind stubs (WP36 stage B). The
 * leaflet's own lessons — "can this bot see yet?" — are proved against the
 * real starter pack in the workbench; what is held here is the contract the
 * module itself promises: it reads a bot through `buildRuntimes` and the slot
 * contracts and nothing else, and its fingerprint changes only when what the
 * bot *can do* changes.
 */

function registry(): PackRegistry {
	const registry = createPackRegistry();
	registry.registerPack({
		id: 'tiny',
		name: 'Tiny pack',
		version: '1.0.0',
		requiresCore: '>=0.0.1',
		brickKinds: v1BrickKinds()
	});
	return registry;
}

function spec(bricks: AgentSpecV2['bricks']): AgentSpecV2 {
	return {
		id: '11111111-1111-4111-8111-111111111111',
		name: 'Snackbot 3000',
		schemaVersion: 2,
		bricks,
		goalCardId: 'starter/say-hello',
		identity: { displayName: 'Snackbot 3000', boxArtSeed: 'seed-1' },
		createdAt: '2026-09-02T09:00:00Z',
		updatedAt: '2026-09-02T09:00:00Z'
	};
}

const brain = {
	slot: 'brain' as const,
	kind: 'starter/llm',
	configVersion: 1,
	config: { cartridgeId: 'tiny/brain', temperature: 0.7, maxTokens: 300, personality: 'Cheerful.' }
};
const tools = {
	slot: 'equipment' as const,
	kind: 'starter/tools',
	configVersion: 1,
	config: { enabled: ['tiny/echo', 'tiny/secret'] }
};
const actions = {
	slot: 'mobility' as const,
	kind: 'starter/actions',
	configVersion: 1,
	config: { enabled: ['move', 'say'] }
};
const sense = {
	slot: 'perception' as const,
	kind: 'starter/sense',
	configVersion: 1,
	config: { channels: ['sight'] }
};
const memory = {
	slot: 'memory' as const,
	kind: 'starter/memory',
	configVersion: 1,
	config: { windowSize: 3, notebook: true }
};

describe('capabilitiesOf', () => {
	it('answers nothing at all for no bot', () => {
		const can = capabilitiesOf(undefined, registry());
		expect(can.filled.size).toBe(0);
		expect(can.toolIds).toEqual([]);
		expect(can.actionIds).toEqual([]);
		expect(can.channels).toEqual([]);
		expect(can.cartridgeId).toBe('');
		expect(can.notebook).toBe(false);
		expect(can.guardrailIds).toEqual([]);
	});

	it('reports what the fitted bricks offer, through the same hooks the loop reads', () => {
		const can = capabilitiesOf(spec([brain, tools, actions, sense, memory]), registry());

		expect([...can.filled].sort()).toEqual([
			'brain',
			'equipment',
			'memory',
			'mobility',
			'perception'
		]);
		expect(can.toolIds).toEqual(['tiny/echo', 'tiny/secret']);
		expect(can.actionIds).toEqual(['move', 'say']);
		expect(can.channels).toEqual(['sight']);
		expect(can.cartridgeId).toBe('tiny/brain');
		expect(can.notebook).toBe(true);
	});

	it('reads the brain and memory sockets through their slot contracts', () => {
		const can = capabilitiesOf(spec([brain]), registry());
		expect(can.cartridgeId).toBe('tiny/brain');
		expect(can.notebook).toBe(false);
	});

	it('fingerprints capabilities, not the spec', () => {
		const a = capabilitiesOf(spec([brain, actions]), registry());
		const hotter = capabilitiesOf(
			spec([{ ...brain, config: { ...brain.config, temperature: 1.5 } }, actions]),
			registry()
		);
		const handsOff = capabilitiesOf(spec([brain]), registry());

		expect(hotter.fingerprint).toBe(a.fingerprint);
		expect(handsOff.fingerprint).not.toBe(a.fingerprint);
	});

	it('is deterministic — a brick cannot answer differently on a second look', () => {
		const first = capabilitiesOf(spec([brain, tools, actions, sense, memory]), registry());
		const second = capabilitiesOf(spec([brain, tools, actions, sense, memory]), registry());
		expect(second).toEqual(first);
	});
});

describe('offers', () => {
	it('matches an id whether qualified or bare (E6)', () => {
		const ids = ['starter/playroom/sight', 'tiny/echo'];
		expect(offers(ids, 'sight')).toBe(true);
		expect(offers(ids, 'starter/playroom/sight')).toBe(true);
		expect(offers(ids, 'tiny/echo')).toBe(true);
		expect(offers(ids, 'echo')).toBe(true);
	});

	it('does not match a suffix that is not a whole segment', () => {
		expect(offers(['starter/playroom/insight'], 'sight')).toBe(false);
		expect(offers([], 'sight')).toBe(false);
	});
});
