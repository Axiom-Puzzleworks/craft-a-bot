<script lang="ts">
	import { resolve } from '$app/paths';
	import { preferences } from '$lib/state/preferences.svelte.js';
	import { LENSES, lensById, railLabel, type LensId, type RailId } from '$lib/workshop/lens.js';

	/**
	 * The Workshop's persistent left rail (`17-…` §2).
	 *
	 * Built from a list rather than hand-written links because the information
	 * architecture grew, screen by screen, from one built entry to every one
	 * of them (`17-…` §4.7–§4.9's own retrofits) — a rail that silently
	 * omitted an unbuilt screen would misrepresent the product, and one that
	 * linked to it early would be lying about what is there. `spec` is the
	 * one entry that stays a non-link permanently by design, not because it
	 * is unbuilt: the Spec Lab has no screen of its own, it is always about a
	 * particular bot, so the rail says how to reach it rather than pretending
	 * it is missing.
	 */
	interface Props {
		current:
			| 'runs'
			| 'dashboard'
			| 'spec'
			| 'evals'
			| 'policies'
			| 'bench'
			| 'telemetry'
			| 'monitor'
			| 'conduct'
			| 'model-risk'
			| 'incidents'
			| 'safety-case'
			| 'assurance'
			| 'export'
			| 'armour'
			| 'guards'
			| 'evaluators'
			| 'scenarios'
			| 'sinks'
			| 'evidence'
			| 'campaigns'
			| 'workflows'
			| 'playground';
	}

	let { current }: Props = $props();

	/**
	 * The rail under a lens (WP87, `78-LENSES.md` §3): the same destinations,
	 * grouped and ordered for the reader's question, labelled in the lens's
	 * words; a switcher at the top; the engineer's lens is the rail as it
	 * was. A lens hides nothing — every group is drawn, the reader's first.
	 */
	const lens = $derived(lensById(preferences.lens));
	const HREF: Partial<Record<RailId, string>> = {
		dashboard: '/workshop',
		runs: '/workshop/runs',
		evals: '/workshop/evals',
		campaigns: '/workshop/campaigns',
		workflows: '/workshop/workflows',
		evaluators: '/workshop/evaluators',
		scenarios: '/workshop/scenarios',
		sinks: '/workshop/sinks',
		evidence: '/workshop/evidence',
		playground: '/workshop/playground',
		policies: '/workshop/policies',
		bench: '/workshop/bench',
		telemetry: '/workshop/telemetry',
		monitor: '/workshop/monitor',
		conduct: '/workshop/conduct',
		'model-risk': '/workshop/model-risk',
		incidents: '/workshop/incidents',
		'safety-case': '/workshop/safety-case',
		assurance: '/workshop/assurance',
		export: '/workshop/export',
		guards: '/workshop/guards'
	};
	const groups = $derived(
		lens.rail.map((group) => ({
			group: group.group,
			entries: group.routes.map((id) => ({ id, label: railLabel(lens, id), href: HREF[id] }))
		}))
	);
</script>

<nav class="rail" aria-label="Workshop">
	<span class="mark">CRAFT A BOT<em>workshop</em></span>
	<label class="lens">
		<span>Lens</span>
		<select
			value={lens.id}
			onchange={(event) => preferences.setLens(event.currentTarget.value as LensId)}
			data-testid="lens-switcher"
			aria-label="Lens"
		>
			{#each LENSES as entry (entry.id)}
				<option value={entry.id}>{entry.name} — {entry.question}</option>
			{/each}
		</select>
	</label>
	{#each groups as group (group.group)}
		{#if lens.rail.length > 1}
			<h2 class="group" data-testid="rail-group-{group.group.toLowerCase().replaceAll(' ', '-')}">
				{group.group}
			</h2>
		{/if}
		<ul>
			{#each group.entries as destination (destination.id)}
				<li>
					{#if destination.href}
						<a
							href={resolve(
								destination.href as
									| '/workshop'
									| '/workshop/runs'
									| '/workshop/evals'
									| '/workshop/policies'
									| '/workshop/bench'
									| '/workshop/telemetry'
									| '/workshop/monitor'
									| '/workshop/conduct'
									| '/workshop/model-risk'
									| '/workshop/incidents'
									| '/workshop/safety-case'
									| '/workshop/assurance'
									| '/workshop/export'
									| '/workshop/armour'
									| '/workshop/guards'
									| '/workshop/evaluators'
									| '/workshop/scenarios'
									| '/workshop/sinks'
									| '/workshop/campaigns'
									| '/workshop/workflows'
									| '/workshop/evidence'
									| '/workshop/playground'
							)}
							aria-current={current === destination.id ? 'page' : undefined}
							data-testid="rail-{destination.id}">{destination.label}</a
						>
					{:else}
						<!-- Not a link, and it says why: the Spec Lab is always about a particular bot. -->
						<span class="pending" data-testid="rail-{destination.id}"
							>{destination.label}<em>per bot</em></span
						>
					{/if}
				</li>
			{/each}
		</ul>
	{/each}
	<a class="back" href={resolve('/')}>← The Kit</a>
</nav>

<style>
	.rail {
		display: flex;
		flex-direction: column;
		gap: var(--cab-space-4);
		padding: var(--cab-space-4) var(--cab-space-3);
		min-width: 152px;
		background: var(--cab-panel);
		border-right: var(--cab-border-panel) solid var(--cab-ink);
	}

	.mark {
		display: grid;
		font-size: var(--cab-text-xs);
		font-weight: 700;
		letter-spacing: 0.1em;
		color: var(--cab-cream);
	}

	.lens {
		display: grid;
		gap: 2px;
		font-size: var(--cab-text-xs);
		color: var(--cab-cream-muted);
	}

	.lens select {
		max-width: 100%;
		font-size: var(--cab-text-xs);
	}

	.group {
		margin: var(--cab-space-2) 0 0;
		font-size: var(--cab-text-xs);
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--cab-cream-muted);
	}

	.mark em {
		font-style: normal;
		font-weight: 400;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--cab-cream-muted);
	}

	ul {
		display: grid;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	a,
	.pending {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--cab-space-2);
		padding: var(--cab-space-2);
		font-size: var(--cab-text-sm);
		border-radius: var(--cab-radius-part);
		text-decoration: none;
	}

	a {
		color: var(--cab-cream);
	}

	a[aria-current='page'] {
		background: var(--cab-cream);
		color: var(--cab-ink);
		font-weight: 600;
	}

	a:hover:not([aria-current='page']) {
		background: color-mix(in srgb, var(--cab-cream) 20%, transparent);
	}

	a:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	/*
	 * A muted token, not a dimmed one (`04-…` §2.3). The label still has to be
	 * readable — it is telling you what the product will be.
	 */
	.pending {
		color: var(--cab-cream-muted);
	}

	.pending em {
		font-style: normal;
		font-size: var(--cab-text-xs);
		letter-spacing: 0.06em;
	}

	.back {
		margin-top: auto;
		font-size: var(--cab-text-xs);
	}
</style>
