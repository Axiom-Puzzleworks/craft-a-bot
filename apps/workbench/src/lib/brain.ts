import type { CartridgeDefinition, LLMProvider } from '@craftabot/core';
import { createOpenAIProvider, OPENAI_PROVIDER_ID } from '@craftabot/pack-openai';
import type { BotCapabilities } from './bot-capabilities.js';
import { createDemoBrain } from './demo-brain.js';
import { createBrowserKeyVault } from './state/keys.js';

/**
 * Choosing a brain for a run.
 *
 * This is the seam the whole provider abstraction exists for: the session takes
 * an `LLMProvider` and does not care which one. A cartridge names its provider,
 * and that is the only thing consulted here.
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
	can?: BotCapabilities
): BrainChoice {
	if (cartridge?.providerId === OPENAI_PROVIDER_ID) {
		const apiKey = createBrowserKeyVault().get(OPENAI_PROVIDER_ID);
		if (apiKey === undefined)
			return { ok: false, reason: 'no-key', providerId: OPENAI_PROVIDER_ID };
		return { ok: true, provider: createOpenAIProvider({ apiKey }), keyless: false };
	}

	// The Demo Brain, and anything unrecognised, runs on the scripted mock.
	return { ok: true, provider: createDemoBrain(goalCardId, can), keyless: true };
}

/** Does this cartridge need a battery before GO will light? (03 §9) */
export function needsBattery(cartridge: CartridgeDefinition | undefined): boolean {
	if (cartridge?.providerId !== OPENAI_PROVIDER_ID) return false;
	return createBrowserKeyVault().get(OPENAI_PROVIDER_ID) === undefined;
}

/** The message shown when a bot is ready except for its battery (03 §9). */
export const NO_BATTERY_MESSAGE =
	'Batteries not included! Pop your OpenAI key into the battery compartment.';
