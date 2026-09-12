<script lang="ts">
	import { page } from '$app/state';
	import WorkshopRail from '$lib/components/workshop/WorkshopRail.svelte';
	import FirstRun from '$lib/components/workshop/FirstRun.svelte';
	import { preferences } from '$lib/state/preferences.svelte.js';
	import { lensById } from '$lib/workshop/lens.js';
	import { installGroupEpisodeEntryPoint } from '$lib/state/group-episode-entry-point.js';
	import { routePath } from '$lib/edition.js';
	import { FINISH_PROPERTIES } from '$lib/assets/finishes.js';

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

	/** The guided path (WP87, GAP-2): the lens's three steps on its entry page, until dismissed. */
	const lens = $derived(lensById(preferences.lens));
	const showFirstRun = $derived(
		routePath(page.url.pathname) === lens.entry && !preferences.firstRunDismissed.includes(lens.id)
	);

	const current = $derived.by(() => {
		const path = routePath(page.url.pathname);
		if (path.startsWith('/workshop/runs')) return 'runs' as const;
		if (path.startsWith('/workshop/evals')) return 'evals' as const;
		if (path.startsWith('/workshop/policies')) return 'policies' as const;
		if (path.startsWith('/workshop/bench')) return 'bench' as const;
		if (path.startsWith('/workshop/workflows')) return 'workflows' as const;
		if (path.startsWith('/workshop/campaigns')) return 'campaigns' as const;
		if (path.startsWith('/workshop/playground')) return 'playground' as const;
		if (path.startsWith('/workshop/compare')) return 'runs' as const;
		if (path.startsWith('/workshop/monitor')) return 'monitor' as const;
		if (path.startsWith('/workshop/conduct')) return 'conduct' as const;
		if (path.startsWith('/workshop/model-risk')) return 'model-risk' as const;
		if (path.startsWith('/workshop/experiments')) return 'experiments' as const;
		if (path.startsWith('/workshop/telemetry')) return 'telemetry' as const;
		if (path.startsWith('/workshop/incidents')) return 'incidents' as const;
		if (path.startsWith('/workshop/safety-case')) return 'safety-case' as const;
		if (path.startsWith('/workshop/assurance')) return 'assurance' as const;
		if (path.startsWith('/workshop/catalogue')) return 'catalogue' as const;
		if (path.startsWith('/workshop/export')) return 'export' as const;
		if (path.startsWith('/workshop/armour')) return 'armour' as const;
		if (path.startsWith('/workshop/guards')) return 'studio' as const;
		if (path.startsWith('/workshop/studio')) return 'studio' as const;
		if (path.startsWith('/workshop/evaluators')) return 'evaluators' as const;
		if (path.startsWith('/workshop/scenarios')) return 'scenarios' as const;
		if (path.startsWith('/workshop/sinks')) return 'sinks' as const;
		if (path.startsWith('/workshop/evidence')) return 'evidence' as const;
		return 'dashboard' as const;
	});
</script>

<!-- The two finishes (WP73, `62-…` §4.2): set once here; every instrument reads them with its own rule as the fallback. -->
<div
	class="workshop"
	data-mode="workshop"
	data-testid="workshop"
	style:--cab-finish-metal={FINISH_PROPERTIES['--cab-finish-metal']}
	style:--cab-finish-graph={FINISH_PROPERTIES['--cab-finish-graph']}
>
	<WorkshopRail {current} />
	<div class="stage">
		{#if showFirstRun}
			<FirstRun {lens} onDismiss={() => preferences.dismissFirstRun(lens.id)} />
		{/if}
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
