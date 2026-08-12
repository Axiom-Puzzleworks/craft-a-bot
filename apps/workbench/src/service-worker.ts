/// <reference types="@sveltejs/kit" />
import { build, files, prerendered, version } from '$service-worker';

/**
 * The offline app shell (`01-ARCHITECTURE.md` §8: "App shell loads offline
 * (static PWA-ready); running a bot obviously needs the network for the LLM").
 *
 * Scope is deliberately narrow. This caches the built shell — the JS, CSS and
 * static files SvelteKit hands us — and nothing else. It never caches an API
 * response: `api.openai.com` is not in `build` or `files`, so a request to a
 * provider always goes to the network, and a cached *answer* from a model would
 * be a lie about what the bot just did. Bots, runs and traces already live in
 * IndexedDB, so an offline reload finds the user's work where it left it.
 *
 * Cache-first for the shell is safe because every built asset is content-hashed
 * and the cache name carries the build `version`: a new deploy writes a new
 * cache and the activate step deletes the old ones.
 */

// The service worker global, typed without pulling in the full WebWorker lib.
const worker = self as unknown as ServiceWorkerGlobalScope;

/*
 * **Never in development.**
 *
 * SvelteKit registers this file on the dev server too, not only in production
 * builds. With cache-first handling that is quietly disastrous: Vite serves
 * modules from un-hashed URLs like `/src/lib/thing.svelte`, so the first load
 * pins a copy of every module in the cache and subsequent edits never reach the
 * browser. The app then runs a frozen mix of old and new code, which looks like
 * a feature simply not working.
 *
 * The worker also removes itself, so a dev machine that already registered the
 * broken version recovers on the next load instead of needing the reader to go
 * digging in DevTools.
 */
if (import.meta.env.DEV) {
	void worker.registration
		.unregister()
		.then(() => caches.keys())
		.then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
}

const CACHE = `craftabot-shell-${version}`;

/*
 * `build` and `files` are the hashed assets and the static directory — they do
 * **not** include the HTML the browser actually navigates to. Caching only
 * those produced a worker that held every script and stylesheet and still could
 * not answer a reload, because the document itself was never stored.
 * `prerendered` carries the rendered routes, and `/` is listed explicitly as
 * the SPA fallback for deep links.
 */
const SHELL = [...build, ...files, ...prerendered, '/'];

worker.addEventListener('install', (event) => {
	if (import.meta.env.DEV) return;
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			await cache.addAll(SHELL);
			// Take over as soon as the new shell is stored, rather than waiting for
			// every tab to close — the app is single-page and self-contained.
			await worker.skipWaiting();
		})()
	);
});

worker.addEventListener('activate', (event) => {
	if (import.meta.env.DEV) return;
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key !== CACHE) await caches.delete(key);
			}
			await worker.clients.claim();
		})()
	);
});

/** Everything precached at install, for deciding what this worker may answer. */
const shellUrls = new Set(SHELL.map((path) => new URL(path, location.origin).href));

worker.addEventListener('fetch', (event) => {
	if (import.meta.env.DEV) return;

	const request = event.request;
	// Only ever GETs, and only ever this origin. Anything else — most obviously
	// a provider call — is none of our business.
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== location.origin) return;

	/*
	 * Only answer for things that were precached, plus navigations.
	 *
	 * The first version cached *any* successful same-origin GET it happened to
	 * see, which meant the cache could fill with whatever the app fetched and
	 * then serve it forever. Everything the shell needs is already in `SHELL`;
	 * anything else can go to the network and stay there.
	 */
	const isNavigation = request.mode === 'navigate';
	if (!isNavigation && !shellUrls.has(url.href)) return;

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);

			const cached = await cache.match(request);
			if (cached) return cached;

			try {
				return await fetch(request);
			} catch {
				// Offline and not in the cache: fall back to the shell entry point so
				// a deep link still boots the SPA, which then routes client-side.
				const fallback = await cache.match('/');
				if (fallback) return fallback;
				throw new Error('offline, and this is not in the shell cache');
			}
		})()
	);
});
