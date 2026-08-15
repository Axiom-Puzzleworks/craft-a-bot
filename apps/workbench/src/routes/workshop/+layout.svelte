<script lang="ts">
	import { page } from '$app/state';
	import WorkshopRail from '$lib/components/workshop/WorkshopRail.svelte';

	/**
	 * The Workshop shell (`15-…` §2, `17-…` §2).
	 *
	 * **One app, one route tree per mode, shared state and components.** The
	 * Workshop is not a second application: it renders the same runs, the same
	 * events and the same stores as the Kit, at full fidelity. §7 rule 1 is the
	 * contract — no mode-private data models — and rule 4 says the Kit is a
	 * curated view of the Workshop rather than a fork.
	 *
	 * `data-mode="workshop"` is set here and nowhere else. It swaps a token layer
	 * (surfaces and typography only) and leaves component geometry alone, so a
	 * component written for the Kit renders correctly in here without knowing the
	 * Workshop exists — which is the property that stops the two modes drifting
	 * into two component libraries.
	 *
	 * The Kit's nav header and leaflet deliberately do not appear: the tutorial is
	 * for the Kit, and a chapter spotlight pointing at a Workshop table would be
	 * pointing at something it has never described.
	 */
	let { children } = $props();

	const current = $derived(page.url.pathname.startsWith('/workshop/runs') ? 'runs' : 'dashboard');
</script>

<div class="workshop" data-mode="workshop" data-testid="workshop">
	<WorkshopRail {current} />
	<div class="stage">
		{@render children()}
	</div>
</div>

<style>
	.workshop {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		min-height: 100vh;
		background: var(--cab-paper);
		color: var(--cab-ink);
		font-size: var(--cab-text-base);
	}

	.stage {
		min-width: 0;
		padding: var(--cab-space-4);
	}

	@media (max-width: 700px) {
		.workshop {
			grid-template-columns: 1fr;
		}
	}
</style>
