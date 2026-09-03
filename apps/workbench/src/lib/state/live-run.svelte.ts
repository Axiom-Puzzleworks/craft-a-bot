import type { SessionView } from './session.svelte.js';

/**
 * **The live bus** (`37-DRIFT-SAFETY-CASE-RUN-LAB.md` §4.3, WP49): the one
 * solo session running in this app right now, held where the Run Lab can
 * find it. The Playroom attaches the view it built and releases it when the
 * page is left or the world reset; the Run Lab, opened on the same run id,
 * trails the view's own `events` instead of the store's copy and can pause
 * or resume it.
 *
 * A module-level singleton is safe here for the same reason `appStorage` is:
 * the app is client-rendered (`routes/+layout.ts` sets `ssr = false`), so
 * there is no server request to leak state between. On a server this would
 * be a bug.
 *
 * Solo only — the duo page keeps its own group view (`37-…` §5).
 */

export interface LiveRun {
	view: SessionView;
	agentId: string;
	agentName: string;
}

const state = $state<{ current: LiveRun | undefined }>({ current: undefined });

export const liveRun = {
	get current(): LiveRun | undefined {
		return state.current;
	},
	attach(run: LiveRun): void {
		state.current = run;
	},
	/** Let go — only of the view that was attached, so a stale release cannot drop a newer run. */
	release(view: SessionView): void {
		if (state.current?.view === view) state.current = undefined;
	}
};
