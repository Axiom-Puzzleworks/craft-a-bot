import { afterEach, describe, expect, it } from 'vitest';
import { createPackRegistry, type CartridgeDefinition, type PackManifest } from '@craftabot/core';
import { chooseBrain, needsBattery, noBatteryMessage } from './brain.js';
import { createBrowserKeyVault } from './state/keys.js';

/**
 * **The provider-selection seam** (`06-…` §8, WP26).
 *
 * This used to be `if (cartridge?.providerId === OPENAI_PROVIDER_ID)`, with
 * everything else falling through to the mock brain *silently* — a cartridge
 * from a provider this build had never heard of would run the demo brain and
 * say nothing about it. These tests are written against that specific
 * failure mode as much as against the happy path.
 */

function providerPack(id: string, keyRequirement: 'required' | 'none' = 'required'): PackManifest {
	return {
		id,
		name: id,
		version: '1.0.0',
		requiresCore: '>=0.0.1',
		providers: [
			{
				id,
				name: id,
				keyRequirement,
				keysUrl: `https://example.com/${id}/keys`,
				create: () => ({
					id,
					name: id,
					keyRequirement,
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
	};
}

const cartridge = (providerId: string): CartridgeDefinition => ({
	id: `${providerId}/test`,
	providerId,
	model: 'test-model',
	displayName: 'Test cartridge',
	blurb: '',
	stats: { words: 1, reasoning: 1, speed: 1 },
	costHint: 'low',
	defaults: { temperature: 1, maxTokens: 100 }
});

function registryWith(...packs: PackManifest[]) {
	const registry = createPackRegistry();
	for (const pack of packs) registry.registerPack(pack);
	return registry;
}

describe('chooseBrain', () => {
	afterEach(() => {
		localStorage.clear();
	});

	it('runs the demo brain when no cartridge is fitted', () => {
		const registry = registryWith(providerPack('acme'));
		const brain = chooseBrain(undefined, 'starter/say-hello', registry);
		expect(brain.ok).toBe(true);
		expect(brain.ok && brain.keyless).toBe(true);
	});

	it('runs the demo brain for a provider this build has never registered, rather than erroring or guessing', () => {
		const registry = registryWith(providerPack('acme'));
		const brain = chooseBrain(cartridge('nobody-registered-this'), 'starter/say-hello', registry);
		expect(brain.ok).toBe(true);
		expect(brain.ok && brain.keyless).toBe(true);
	});

	it('reports no-key for a registered provider with no battery fitted', () => {
		const registry = registryWith(providerPack('acme'));
		const brain = chooseBrain(cartridge('acme'), 'starter/say-hello', registry);
		expect(brain).toEqual({ ok: false, reason: 'no-key', providerId: 'acme' });
	});

	it('builds the real provider once a battery is fitted', () => {
		const registry = registryWith(providerPack('acme'));
		createBrowserKeyVault().set('acme', 'sk-acme-key');
		const brain = chooseBrain(cartridge('acme'), 'starter/say-hello', registry);
		expect(brain.ok).toBe(true);
		expect(brain.ok && brain.provider.id).toBe('acme');
		expect(brain.ok && brain.keyless).toBe(false);
	});

	it('never asks for a battery from a keyless provider (Ollama-shaped)', () => {
		const registry = registryWith(providerPack('local', 'none'));
		const brain = chooseBrain(cartridge('local'), 'starter/say-hello', registry);
		expect(brain.ok).toBe(true);
		expect(brain.ok && brain.keyless).toBe(true);
	});
});

describe('needsBattery', () => {
	afterEach(() => {
		localStorage.clear();
	});

	it('is false with no cartridge fitted', () => {
		const registry = registryWith(providerPack('acme'));
		expect(needsBattery(undefined, registry)).toBe(false);
	});

	it('is false for a keyless provider', () => {
		const registry = registryWith(providerPack('local', 'none'));
		expect(needsBattery(cartridge('local'), registry)).toBe(false);
	});

	it('is true for a required-key provider with no battery yet', () => {
		const registry = registryWith(providerPack('acme'));
		expect(needsBattery(cartridge('acme'), registry)).toBe(true);
	});

	it('is false once a battery is fitted', () => {
		const registry = registryWith(providerPack('acme'));
		createBrowserKeyVault().set('acme', 'sk-acme-key');
		expect(needsBattery(cartridge('acme'), registry)).toBe(false);
	});
});

describe('noBatteryMessage', () => {
	it('names the actual provider, not a hardcoded one', () => {
		const registry = registryWith(providerPack('acme'));
		expect(noBatteryMessage(cartridge('acme'), registry)).toBe(
			'Batteries not included! Pop your acme key into the battery compartment.'
		);
	});
});
