import { appStorage } from './app-storage.svelte.js';
import { recordGroupEpisode, type GroupEpisode } from './group-recorder.js';

/**
 * The Workshop's one way in for a group episode nothing in the UI can create
 * yet (WP29, `23-MULTI-AGENT-DESIGN.md` §10 stage F: "driven through a test
 * entry point, since no Kit UI exists").
 *
 * `recordGroupEpisode` already does the real work — this only makes it
 * reachable from outside the app's own module graph, which a static SvelteKit
 * build otherwise has no seam for (no server route to post to). It is
 * installed once, from the Workshop shell, and is genuinely small: one
 * function, calling the same storage-writing path a live WP31 recorder will
 * use. This stage's own e2e proof is its first caller; it is written to
 * outlive that — the natural seam a future live recorder attaches to, not
 * scaffolding torn out once the test passes.
 */
declare global {
	interface Window {
		craftabot?: {
			recordGroupEpisode(episode: GroupEpisode): Promise<unknown>;
		};
	}
}

export function installGroupEpisodeEntryPoint(): void {
	window.craftabot = {
		recordGroupEpisode: async (episode) => {
			const storage = await appStorage();
			return recordGroupEpisode(storage, episode);
		}
	};
}
