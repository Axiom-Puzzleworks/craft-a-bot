import { openStorage } from './open-storage.js';
import { createMemoryStorage } from './storage-memory.js';
import type { Storage } from './storage.js';

/**
 * The one `Storage` the running app shares.
 *
 * A module-level singleton is safe here specifically because the app is a
 * client-rendered SPA (`routes/+layout.ts` sets `ssr = false`) — there is no
 * server request to leak state between. On a server this would be a bug.
 */

let opened: Promise<Storage> | undefined;

const state = $state<{ kind: Storage['kind'] | 'opening'; fallbackReason?: string }>({
	kind: 'opening'
});

export function appStorage(): Promise<Storage> {
	opened ??= openStorage().then((result) => {
		state.kind = result.storage.kind;
		if (result.fallbackReason !== undefined) state.fallbackReason = result.fallbackReason;
		return result.storage;
	});
	return opened;
}

/** Reactive: what we actually got, so the shelf can warn when nothing will be saved (07 §8). */
export function storageStatus() {
	return state;
}

/** Tests and the demo build swap in their own store. */
export function setAppStorage(storage: Storage): void {
	opened = Promise.resolve(storage);
	state.kind = storage.kind;
	delete state.fallbackReason;
}

export function resetAppStorageForTests(): void {
	setAppStorage(createMemoryStorage());
}
