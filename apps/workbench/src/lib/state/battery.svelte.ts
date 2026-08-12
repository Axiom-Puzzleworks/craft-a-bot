import type { KeyCheck } from '@craftabot/core';
import { createOpenAIProvider, OPENAI_PROVIDER_ID } from '@craftabot/pack-openai';
import { createBrowserKeyVault, type KeyVault } from './keys.js';

/**
 * The battery bay's reactive state (03-UI-UX-DESIGN.md §7, 06 §6).
 *
 * The vault itself (WP4) stays deliberately dumb and non-reactive — it is the
 * one module allowed to hold a secret and should be trivial to audit. This adds
 * the UI's view on top: which providers have a battery, and whether the last
 * validation ping said it was charged.
 *
 * Note what is *not* here: the key value never enters reactive state, so it can
 * never be caught up in a snapshot, a log, or a component's debug output. The
 * only reader is `createOpenAIProvider`, at call time.
 */

export type ChargeState = 'empty' | 'unchecked' | 'checking' | 'charged' | 'flat';

export interface BatteryBay {
	readonly charge: ChargeState;
	readonly message: string;
	readonly hasKey: boolean;
	insert(key: string): Promise<void>;
	eject(): void;
	/** Re-run the validation ping for the stored key. */
	check(): Promise<void>;
}

export interface BatteryBayDeps {
	providerId?: string;
	vault?: KeyVault;
	/** Injected so tests never reach the network. */
	validate?: (key: string) => Promise<KeyCheck>;
}

export function createBatteryBay(deps: BatteryBayDeps = {}): BatteryBay {
	const providerId = deps.providerId ?? OPENAI_PROVIDER_ID;
	const vault = deps.vault ?? createBrowserKeyVault();

	const validate =
		deps.validate ?? ((key: string) => createOpenAIProvider({ apiKey: key }).validateKey(key));

	const state = $state<{ charge: ChargeState; message: string; hasKey: boolean }>({
		charge: vault.get(providerId) === undefined ? 'empty' : 'unchecked',
		message: '',
		hasKey: vault.get(providerId) !== undefined
	});

	async function runCheck(key: string): Promise<void> {
		state.charge = 'checking';
		state.message = 'Checking the battery…';
		const result = await validate(key);
		state.charge = result.ok ? 'charged' : 'flat';
		state.message = result.message;
	}

	return {
		get charge() {
			return state.charge;
		},
		get message() {
			return state.message;
		},
		get hasKey() {
			return state.hasKey;
		},

		async insert(key) {
			const trimmed = key.trim();
			if (trimmed === '') return;
			vault.set(providerId, trimmed);
			state.hasKey = true;
			await runCheck(trimmed);
		},

		eject() {
			// Ejecting clears the cached validation as well as the key (06 §6).
			vault.remove(providerId);
			state.hasKey = false;
			state.charge = 'empty';
			state.message = '';
		},

		async check() {
			const key = vault.get(providerId);
			if (key === undefined) {
				state.charge = 'empty';
				return;
			}
			await runCheck(key);
		}
	};
}

/** Whether any battery is fitted for a provider — the bench's GO-time check. */
export function hasBatteryFor(
	providerId: string,
	vault: KeyVault = createBrowserKeyVault()
): boolean {
	return vault.get(providerId) !== undefined;
}
