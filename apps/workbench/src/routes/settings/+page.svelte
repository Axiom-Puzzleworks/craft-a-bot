<script lang="ts">
	import { resolve } from '$app/paths';
	import BatteryCompartment from '$lib/components/settings/BatteryCompartment.svelte';
	import { createBatteryBay } from '$lib/state/battery.svelte.js';

	/**
	 * Settings. WP7 brings the battery compartment (03-UI-UX-DESIGN.md §7); the
	 * preferences and About panels arrive with WP9.
	 */
	const bay = createBatteryBay();
</script>

<svelte:head><title>Settings — Craft A Bot</title></svelte:head>

<main>
	<header class="head">
		<a class="back" href={resolve('/')}>← Shelf</a>
		<h1>Settings</h1>
	</header>

	<BatteryCompartment {bay} />

	<p class="later">
		Sound, motion, tick speed, and the About panel arrive with the instruction leaflet.
	</p>
</main>

<style>
	main {
		max-width: 720px;
		margin-inline: auto;
		padding: var(--cab-space-5) var(--cab-space-4) var(--cab-space-7);
		display: grid;
		gap: var(--cab-space-4);
	}

	.head {
		display: flex;
		align-items: baseline;
		gap: var(--cab-space-3);
	}

	.back {
		color: var(--cab-blue-text);
		font-size: var(--cab-text-sm);
		font-weight: 600;
		text-decoration: none;
	}

	.back:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	h1 {
		margin: 0;
		font-size: var(--cab-text-xl);
		color: var(--cab-blue-text);
	}

	.later {
		margin: 0;
		font-size: var(--cab-text-sm);
		opacity: 0.7;
	}
</style>
