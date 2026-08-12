import { describe, expect, it, vi } from 'vitest';
import { createBatteryBay, hasBatteryFor } from './battery.svelte.js';
import { createKeyVault, type WebStorageLike } from './keys.js';

/**
 * The battery bay (03-UI-UX-DESIGN.md §7, 06-LLM-PROVIDERS.md §6). Validation
 * is injected, so nothing here touches the network.
 */

function fakeStore(): WebStorageLike {
	const map = new Map<string, string>();
	return {
		getItem: (key) => map.get(key) ?? null,
		setItem: (key, value) => void map.set(key, value),
		removeItem: (key) => void map.delete(key)
	};
}

function bayWith(validate: (key: string) => Promise<{ ok: boolean; message: string }>) {
	const vault = createKeyVault(fakeStore());
	return { bay: createBatteryBay({ vault, validate }), vault };
}

const charged = () => Promise.resolve({ ok: true, message: 'Battery charged — this key works.' });
const flat = () => Promise.resolve({ ok: false, message: 'Incorrect API key provided.' });

describe('inserting a battery', () => {
	it('starts empty', () => {
		const { bay } = bayWith(charged);
		expect(bay.charge).toBe('empty');
		expect(bay.hasKey).toBe(false);
	});

	it('stores the key and lights the meter once the ping comes back', async () => {
		const { bay, vault } = bayWith(charged);
		await bay.insert('sk-a-real-looking-key');

		expect(bay.hasKey).toBe(true);
		expect(bay.charge).toBe('charged');
		expect(vault.get('openai')).toBe('sk-a-real-looking-key');
	});

	it('reports a flat battery rather than pretending', async () => {
		const { bay } = bayWith(flat);
		await bay.insert('sk-wrong');

		expect(bay.charge).toBe('flat');
		expect(bay.message).toContain('Incorrect API key');
	});

	it('trims a pasted key, which usually arrives with whitespace', async () => {
		const { bay, vault } = bayWith(charged);
		await bay.insert('  sk-padded\n');
		expect(vault.get('openai')).toBe('sk-padded');
	});

	it('ignores an empty paste', async () => {
		const { bay } = bayWith(charged);
		await bay.insert('   ');
		expect(bay.hasKey).toBe(false);
		expect(bay.charge).toBe('empty');
	});
});

describe('ejecting a battery', () => {
	it('forgets the key and the cached charge (06 §6)', async () => {
		const { bay, vault } = bayWith(charged);
		await bay.insert('sk-a-key');
		bay.eject();

		expect(bay.hasKey).toBe(false);
		expect(bay.charge).toBe('empty');
		expect(bay.message).toBe('');
		expect(vault.get('openai')).toBeUndefined();
	});
});

describe('re-checking', () => {
	it('pings again for the stored key', async () => {
		const validate = vi.fn(charged);
		const { bay } = bayWith(validate);
		await bay.insert('sk-a-key');
		await bay.check();

		expect(validate).toHaveBeenCalledTimes(2);
		expect(bay.charge).toBe('charged');
	});

	it('does nothing when the bay is empty', async () => {
		const validate = vi.fn(charged);
		const { bay } = bayWith(validate);
		await bay.check();

		expect(validate).not.toHaveBeenCalled();
		expect(bay.charge).toBe('empty');
	});
});

describe('a bay opened over an existing key', () => {
	it('knows a battery is fitted but has not checked it yet', async () => {
		const vault = createKeyVault(fakeStore());
		vault.set('openai', 'sk-from-a-previous-session');

		const bay = createBatteryBay({ vault, validate: charged });
		expect(bay.hasKey).toBe(true);
		expect(bay.charge).toBe('unchecked');
	});
});

describe('hasBatteryFor', () => {
	it('answers the bench GO-time question', () => {
		const vault = createKeyVault(fakeStore());
		expect(hasBatteryFor('openai', vault)).toBe(false);
		vault.set('openai', 'sk-a-key');
		expect(hasBatteryFor('openai', vault)).toBe(true);
	});
});

describe('key containment', () => {
	it('never exposes the key through the bay', async () => {
		const { bay } = bayWith(charged);
		await bay.insert('sk-super-secret-value');

		// The bay reports *that* a battery is fitted, never what it is.
		expect(
			JSON.stringify({ charge: bay.charge, message: bay.message, hasKey: bay.hasKey })
		).not.toContain('sk-super-secret-value');
	});
});
