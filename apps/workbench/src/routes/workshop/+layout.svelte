<script lang="ts">
	import { page } from '$app/state';
	import WorkshopRail from '$lib/components/workshop/WorkshopRail.svelte';
	import { installGroupEpisodeEntryPoint } from '$lib/state/group-episode-entry-point.js';

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

	// WP29's group-episode entry point (`23-…` §10 stage F) — installed here
	// because every Workshop page loads this shell, and nothing outside the
	// Workshop has any use for it.
	installGroupEpisodeEntryPoint();

	const current = $derived.by(() => {
		const path = page.url.pathname;
		if (path.startsWith('/workshop/runs')) return 'runs' as const;
		if (path.startsWith('/workshop/evals')) return 'evals' as const;
		if (path.startsWith('/workshop/policies')) return 'policies' as const;
		if (path.startsWith('/workshop/bench')) return 'bench' as const;
		if (path.startsWith('/workshop/telemetry')) return 'telemetry' as const;
		if (path.startsWith('/workshop/incidents')) return 'incidents' as const;
		if (path.startsWith('/workshop/safety-case')) return 'safety-case' as const;
		if (path.startsWith('/workshop/export')) return 'export' as const;
		if (path.startsWith('/workshop/armour')) return 'armour' as const;
		return 'dashboard' as const;
	});
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
