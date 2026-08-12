import { createIdbStorage } from './storage-idb.js';
import { createMemoryStorage } from './storage-memory.js';
import type { Storage } from './storage.js';

/**
 * Open the best store this browser will give us.
 *
 * IndexedDB is unavailable in some private-browsing modes and locked-down
 * corporate profiles. Rather than fail, the app runs fully in memory and the
 * shelf explains that nothing will survive a reload (07-DATA-MODEL-PERSISTENCE.md
 * §8) — export becomes the hero path. Callers check `storage.kind` to decide
 * whether to show that banner.
 */

export interface OpenStorageResult {
	storage: Storage;
	/** Why we fell back, when we did — worth showing in the settings "about" panel. */
	fallbackReason?: string;
}

export async function openStorage(name?: string): Promise<OpenStorageResult> {
	if (typeof indexedDB === 'undefined') {
		return {
			storage: createMemoryStorage(),
			fallbackReason: 'This browser has no IndexedDB, so nothing can be saved.'
		};
	}
	try {
		return { storage: await createIdbStorage(name) };
	} catch (error) {
		return {
			storage: createMemoryStorage(),
			fallbackReason:
				error instanceof Error
					? `IndexedDB would not open (${error.message}), so nothing can be saved.`
					: 'IndexedDB would not open, so nothing can be saved.'
		};
	}
}
