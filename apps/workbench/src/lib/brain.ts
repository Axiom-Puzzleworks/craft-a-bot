import type { CartridgeDefinition, LLMProvider, PackRegistry } from '@craftabot/core';
import type { BotCapabilities } from './bot-capabilities.js';
import { createDemoBrain } from './demo-brain.js';
import { createBrowserKeyVault } from './state/keys.js';
import { preferences } from './state/preferences.svelte.js';

/**
 * Choosing a brain for a run.
 *
 * This is the seam the whole provider abstraction exists for: the session takes
 * an `LLMProvider` and does not care which one. A cartridge names its provider,
 * and that is the only thing consulted here — by looking the provider up in the
 * registry rather than naming it (WP26).
 *
 * **This used to be `if (cartridge?.providerId === OPENAI_PROVIDER_ID)`.**
 * Everything else — any cartridge from any provider this build had not
 * hard-coded — fell through to the *demo brain* silently. A persona or
 * provider pack could ship a cartridge that looked real and ran the mock
 * brain instead, with nothing in the UI saying so. Looking the provider up
 * by id in the registry (the same `PackRegistry.getProviderFactory` every
 * other kind of pack content already goes through) closes that: an
 * unrecognised `providerId` is now impossible by construction, because every
 * provider a cartridge could possibly name is one this build has registered.
 *
 * The key is read out of the vault at this moment and passed straight into the
 * provider's closure — it is never stored anywhere else, never returned, and
 * never reaches the spec or an event (hard rule 2, 06 §6).
 */

export type BrainChoice =
	| { ok: true; provider: LLMProvider; keyless: boolean }
	| { ok: false; reason: 'no-key'; providerId: string };

/**
 * `spec` is passed to the demo brain so its scripted runs can fail the way the
 * bot's missing bricks predict (`demo-brain.ts`, 02 §9). A real provider never
 * receives it — the model learns what it is built from through the prompt.
 */
export function chooseBrain(
	cartridge: CartridgeDefinition | undefined,
	goalCardId: string,
	registry: PackRegistry,
	can?: BotCapabilities
): BrainChoice {
	const factory = cartridge ? registry.getProviderFactory(cartridge.providerId) : undefined;

	if (factory) {
		if (factory.keyRequirement === 'none') {
			// A local provider is told where to listen (WP52, `40-DEBTS.md` §4.3); the factory holds it to loopback again.
			return {
				ok: true,
				provider: factory.create({ apiKey: '', endpoint: preferences.ollamaEndpoint }),
				keyless: true
			};
		}
		const apiKey = createBrowserKeyVault().get(factory.id);
		if (apiKey === undefined) return { ok: false, reason: 'no-key', providerId: factory.id };
		return { ok: true, provider: factory.create({ apiKey }), keyless: false };
	}

	// A cartridge from a provider this build genuinely does not have — a kit
	// file from a build with more packs installed, say — runs on the scripted
	// mock rather than crashing the bench. Everything else runs it too: no
	// cartridge fitted at all, or the Demo Brain cartridge itself.
	return { ok: true, provider: createDemoBrain(goalCardId, can), keyless: true };
}

/** Does this cartridge need a battery before GO will light? (03 §9) */
export function needsBattery(
	cartridge: CartridgeDefinition | undefined,
	registry: PackRegistry
): boolean {
	const factory = cartridge ? registry.getProviderFactory(cartridge.providerId) : undefined;
	if (!factory || factory.keyRequirement === 'none') return false;
	return createBrowserKeyVault().get(factory.id) === undefined;
}

/** The message shown when a bot is ready except for its battery (03 §9). */
export function noBatteryMessage(
	cartridge: CartridgeDefinition | undefined,
	registry: PackRegistry
): string {
	const factory = cartridge ? registry.getProviderFactory(cartridge.providerId) : undefined;
	const name = factory?.name ?? 'that provider';
	return `Batteries not included! Pop your ${name} key into the battery compartment.`;
}
