import { loadDesks, routePath } from '$lib/edition.js';

// Local-first SPA: dynamic per-agent routes (/bench/[agentId], /play/[agentId], WP5/WP6)
// can't be prerendered, so the whole app renders client-side against the static build.
export const ssr = false;

/**
 * The desks load on demand (WP112): each desk pack is its own chunk, so the
 * Kit's first page starts fetching them and does not wait; every other route
 * waits for them before it renders, so everything it builds a registry from
 * — a run record's pack versions, a kit file's `requires`, the Workshop's
 * screens — sees the whole box.
 */
export const load = async ({ url }: { url: URL }) => {
	if (routePath(url.pathname) === '/') void loadDesks();
	else await loadDesks();
	return {};
};
