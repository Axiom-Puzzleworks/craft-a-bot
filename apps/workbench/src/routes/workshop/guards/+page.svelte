<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';

	/** WP101 (`88-STUDIO.md` §7): the Guard Rack is the Studio's *Connections* tab; the old address forwards. */
	onMount(() => {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() builds the base path; the tab is a query the typed surface cannot carry.
		void goto(`${resolve('/workshop/studio')}?tab=connections`, { replaceState: true });
	});
</script>

<p>Opening the Studio's connections…</p>
