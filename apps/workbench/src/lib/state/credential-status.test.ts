import { describe, expect, it } from 'vitest';
import {
	CREDENTIAL_STATUS_KEY,
	clearRejection,
	credentialIdFor,
	isCredentialRejection,
	markRejected,
	rejectionOf
} from './credential-status.js';
import type { WebStorageLike } from './keys.js';

/**
 * The note a run leaves for the battery compartment (UX-2): a service that
 * refused the credential, when, and by whose call — never the credential.
 */
function memoryStore(): WebStorageLike & { dump(): string | null } {
	const map = new Map<string, string>();
	return {
		getItem: (key) => map.get(key) ?? null,
		setItem: (key, value) => void map.set(key, value),
		removeItem: (key) => void map.delete(key),
		dump: () => map.get(CREDENTIAL_STATUS_KEY) ?? null
	};
}

describe('credential status', () => {
	it('has nothing to say about a credential no service has refused', () => {
		expect(rejectionOf('geap', memoryStore())).toBeUndefined();
	});

	it('records a rejection and reads it back, and clears it', () => {
		const store = memoryStore();
		markRejected(
			'geap',
			{ kind: 'bad-token', at: '2026-09-07T10:00:00.000Z', by: 'geap/armor:observation' },
			store
		);
		expect(rejectionOf('geap', store)).toEqual({
			kind: 'bad-token',
			at: '2026-09-07T10:00:00.000Z',
			by: 'geap/armor:observation'
		});
		// Nothing key-shaped is written: the note is a verdict and a time (hard rule 2).
		expect(store.dump()).not.toMatch(/ya29|sk-/);

		clearRejection('geap', store);
		expect(rejectionOf('geap', store)).toBeUndefined();
	});

	it('names the credential slot after the pack that owns the guardrail', () => {
		expect(credentialIdFor('geap/armor:observation')).toBe('geap');
		expect(credentialIdFor('azure-content-safety/guard:pre-think')).toBe('azure-content-safety');
	});

	it('treats only the service refusing the credential as a rejection', () => {
		expect(isCredentialRejection('bad-token')).toBe(true);
		expect(isCredentialRejection('no-permission')).toBe(true);
		expect(isCredentialRejection('timeout')).toBe(false);
		expect(isCredentialRejection('ok')).toBe(false);
	});

	it('survives a store holding rubbish', () => {
		const store = memoryStore();
		store.setItem(CREDENTIAL_STATUS_KEY, '{not json');
		expect(rejectionOf('geap', store)).toBeUndefined();
		markRejected(
			'geap',
			{ kind: 'no-permission', at: '2026-09-07T10:00:00.000Z', by: 'x/y' },
			store
		);
		expect(rejectionOf('geap', store)?.kind).toBe('no-permission');
	});
});
