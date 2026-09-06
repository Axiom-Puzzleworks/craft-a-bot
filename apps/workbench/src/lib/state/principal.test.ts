import { describe, expect, it } from 'vitest';
import { browserPrincipal, browserPrincipalId, PRINCIPAL_STORAGE_KEY } from './principal.js';
import type { WebStorageLike } from './keys.js';

/**
 * The browser's principal (WP65, `55-…` §4.2): one id per browser, minted
 * once and kept; the Settings name when given; a store that cannot be read
 * or written still yields a principal.
 */
function memoryStore(): WebStorageLike & { map: Map<string, string> } {
	const map = new Map<string, string>();
	return {
		map,
		getItem: (key) => map.get(key) ?? null,
		setItem: (key, value) => void map.set(key, value),
		removeItem: (key) => void map.delete(key)
	};
}

describe('browserPrincipal', () => {
	it('mints an id once and keeps it', () => {
		const store = memoryStore();
		let n = 0;
		const mint = () => `id-${++n}`;
		expect(browserPrincipalId(store, mint)).toBe('id-1');
		expect(browserPrincipalId(store, mint)).toBe('id-1');
		expect(JSON.parse(store.map.get(PRINCIPAL_STORAGE_KEY) ?? '{}')).toEqual({
			id: 'id-1',
			schemaVersion: 1
		});
	});

	it('is a person with the Settings name when one is given, and no name field when blank', () => {
		const store = memoryStore();
		const mint = () => 'id-9';
		expect(browserPrincipal('Sam', { store, mint })).toEqual({
			kind: 'person',
			id: 'id-9',
			name: 'Sam'
		});
		expect(browserPrincipal('   ', { store, mint })).toEqual({ kind: 'person', id: 'id-9' });
	});

	it('survives a store that holds rubbish or refuses to write', () => {
		const store = memoryStore();
		store.map.set(PRINCIPAL_STORAGE_KEY, 'not json');
		expect(browserPrincipalId(store, () => 'fresh')).toBe('fresh');
		const refusing: WebStorageLike = {
			getItem: () => null,
			setItem: () => {
				throw new Error('quota');
			},
			removeItem: () => undefined
		};
		expect(browserPrincipalId(refusing, () => 'again')).toBe('again');
		expect(browserPrincipalId(undefined, () => 'none')).toBe('none');
	});
});
