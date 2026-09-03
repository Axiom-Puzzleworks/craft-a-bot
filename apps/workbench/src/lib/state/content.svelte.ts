import {
	localPackFrom,
	type ContentKind,
	type ContentRecord,
	type PackManifest,
	type Storage
} from '@craftabot/core';
import { appStorage } from './app-storage.svelte.js';

/**
 * **Authored content** (`34-CONTENT-STORE.md` §4.4, WP46): every record the
 * person has saved — policy cards, assertion cards, scenarios, campaigns —
 * loaded once at start and after every save, and turned into the synthetic
 * `local` pack `createRegistry()` registers beside the shipped ones. The
 * store is the truth; this is its shadow for synchronous readers.
 */

export interface ContentStore {
	readonly records: readonly ContentRecord[];
	readonly loaded: boolean;
	/** The `local` pack as it stands — rebuilt whenever the records change. */
	readonly localPack: PackManifest;
	of(kind: ContentKind): ContentRecord[];
	load(): Promise<void>;
	save(record: ContentRecord): Promise<void>;
	saveAll(records: readonly ContentRecord[]): Promise<void>;
	remove(id: string): Promise<void>;
}

export function createContentStore(storage: () => Promise<Storage> = appStorage): ContentStore {
	let records = $state<ContentRecord[]>([]);
	let loaded = $state(false);
	const localPack = $derived(localPackFrom(records));

	async function refresh(): Promise<void> {
		records = await (await storage()).listContent();
		loaded = true;
	}

	return {
		get records() {
			return records;
		},
		get loaded() {
			return loaded;
		},
		get localPack() {
			return localPack;
		},
		of: (kind) => records.filter((record) => record.kind === kind),
		load: refresh,
		async save(record) {
			await (await storage()).putContent($state.snapshot(record) as ContentRecord);
			await refresh();
		},
		async saveAll(all) {
			const store = await storage();
			for (const record of all) await store.putContent($state.snapshot(record) as ContentRecord);
			await refresh();
		},
		async remove(id) {
			await (await storage()).deleteContent(id);
			await refresh();
		}
	};
}

/** The app-wide store. Components import this; tests build their own. */
export const contentStore = createContentStore();
