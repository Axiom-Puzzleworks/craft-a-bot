<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import Leaflet from '$lib/components/leaflet/Leaflet.svelte';
	import NavHeader from '$lib/components/kit/NavHeader.svelte';
	import { leafletStore } from '$lib/leaflet/leaflet.svelte.js';
	import type { LeafletRoute } from '$lib/leaflet/chapters.js';
	import { preferences } from '$lib/state/preferences.svelte.js';

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
		const route = routeOf(page.url.pathname);
		if (route === 'shelf') return 'shelf' as const;
		if (route === 'settings') return 'settings' as const;
		return undefined;
	});

	$effect(() => {
		leaflet.report({ route: routeOf(page.url.pathname) });
	});

	// Preferences that have to reach the whole document (03 §7).
	$effect(() => {
		document.documentElement.dataset['reducedMotion'] = String(preferences.reducedMotion);
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<NavHeader {current} oninstructions={() => leaflet.show()} />
{@render children()}
<Leaflet {leaflet} />
