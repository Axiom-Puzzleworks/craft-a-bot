<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import Leaflet from '$lib/components/leaflet/Leaflet.svelte';
	import NavHeader from '$lib/components/kit/NavHeader.svelte';
	import { leafletStore } from '$lib/leaflet/leaflet.svelte.js';
	import type { LeafletRoute } from '$lib/leaflet/chapters.js';
	import { preferences } from '$lib/state/preferences.svelte.js';
	import { contentStore } from '$lib/state/content.svelte.js';

	/**
	 * The leaflet lives here rather than in any one screen: half its chapters run
	 * from the bench into the Playroom and back, and a tutorial that reset itself
	 * on navigation would be no tutorial at all (03-UI-UX-DESIGN.md §6).
	 *
	 * The nav header (`16-…` §1.5) lives here for the same reason from the other
	 * direction: it has to be on every screen to be worth having, and Settings
	 * being reachable only from the bench was `12-…` D16.
	 */

	let { children } = $props();

	const leaflet = leafletStore();

	// Authored content (WP46) is read once, before any registry is built from it.
	$effect(() => {
		void contentStore.load();
	});

	function routeOf(pathname: string): LeafletRoute {
		if (pathname.startsWith('/bench')) return 'bench';
		if (pathname.startsWith('/play')) return 'play';
		if (pathname.startsWith('/settings')) return 'settings';
		return 'shelf';
	}

	/**
	 * Only the two screens the header actually links to can be "current". The
	 * bench and the Playroom are reached through a bot, not through the nav, so
	 * marking anything there would be claiming a link is current when no link is.
	 */
	const current = $derived.by(() => {
		/*
		 * Matched here rather than through `routeOf`, which exists for the leaflet
		 * and knows only the four routes it has chapters for — it calls everything
		 * else "shelf", which is fine for a tutorial and wrong for a nav marker.
		 * Left to it, the Scrapbook and the replay viewer both lit up "Shelf".
		 */
		const path = page.url.pathname;
		if (path === '/') return 'shelf' as const;
		if (path.startsWith('/scrapbook')) return 'scrapbook' as const;
		if (path.startsWith('/settings')) return 'settings' as const;
		return undefined;
	});

	$effect(() => {
		leaflet.report({ route: routeOf(page.url.pathname) });
	});

	// Preferences that have to reach the whole document (03 §7).
	$effect(() => {
		document.documentElement.dataset['reducedMotion'] = String(preferences.reducedMotion);
	});

	/**
	 * The Kit's chrome belongs to the Kit.
	 *
	 * This layout wraps every route including `/workshop`, and both of the things
	 * it renders are Kit-specific: the header is a box-lid stud strip, and the
	 * leaflet is a tutorial whose chapters describe the bench and the Playroom. A
	 * chapter spotlight pointing at a Workshop table would be pointing at
	 * something it has never described.
	 *
	 * The Workshop brings its own shell (`15-…` §2 — one route tree per mode,
	 * shared state and components).
	 */
	const inKit = $derived(!page.url.pathname.startsWith('/workshop'));
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{#if inKit}
	<NavHeader {current} workshop={preferences.workshop} oninstructions={() => leaflet.show()} />
{/if}
{@render children()}
{#if inKit}
	<Leaflet {leaflet} />
{/if}
