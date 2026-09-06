import type { Principal } from '@craftabot/core';
import type { WebStorageLike } from './keys.js';

/**
 * **The browser's principal** (WP65, `55-PRINCIPAL.md` §4.2): who is at this
 * keyboard, as far as the trace can say — a person, with an id minted once
 * per browser and kept in `localStorage`, and the display name Settings
 * holds when the person typed one. Never derived from anything real (hard
 * rule 9): the id is a random UUID, the name is theirs to leave blank. The
 * Play route names it on every run it starts and every approval it answers;
 * the duo names it as the group's; the Workshop's fork names it as the
 * forker's. The Kit's copy does not change — its principal is "you".
 */
export const PRINCIPAL_STORAGE_KEY = 'cab.principal.v1';

interface StoredPrincipal {
	id: string;
	schemaVersion: 1;
}

const isStored = (value: unknown): value is StoredPrincipal =>
	typeof value === 'object' &&
	value !== null &&
	typeof (value as { id?: unknown }).id === 'string' &&
	(value as { id: string }).id !== '';

/** The per-browser id, minted on first read and kept; a store that cannot be read yields a fresh id each time. */
export function browserPrincipalId(
	store: WebStorageLike | undefined = typeof localStorage === 'undefined'
		? undefined
		: localStorage,
	mint: () => string = () => crypto.randomUUID()
): string {
	let held: unknown;
	try {
		const raw = store?.getItem(PRINCIPAL_STORAGE_KEY);
		held = raw === null || raw === undefined ? undefined : JSON.parse(raw);
	} catch {
		held = undefined;
	}
	if (isStored(held)) return held.id;
	const id = mint();
	try {
		store?.setItem(
			PRINCIPAL_STORAGE_KEY,
			JSON.stringify({ id, schemaVersion: 1 } satisfies StoredPrincipal)
		);
	} catch {
		// A store that refuses the write (private mode, quota) still gets a principal for this run.
	}
	return id;
}

/** The person at this browser: the stored id, and the Settings name when there is one. */
export function browserPrincipal(
	displayName: string,
	options: { store?: WebStorageLike; mint?: () => string } = {}
): Principal {
	const name = displayName.trim();
	return {
		kind: 'person',
		id: browserPrincipalId(options.store, options.mint),
		...(name !== '' ? { name } : {})
	};
}
