<script lang="ts">
	import { resolve } from '$app/paths';

	/**
	 * The Workshop's front door.
	 *
	 * `17-…` §4.1 puts the Bench Dashboard here — fleet table, telemetry tiles,
	 * sparklines — and that is WP23's, over WP19's eval records. This is
	 * deliberately not a stub of it: a dashboard with invented numbers on it
	 * would be the one thing a governance tool must never be. It says what is
	 * here and points at it.
	 */
</script>

<svelte:head><title>Workshop — Craft A Bot</title></svelte:head>

<main>
	<h1>Workshop</h1>
	<p class="lead">
		The same bots, worlds, runs and traces the Kit builds — at full fidelity. Nothing here changes
		how anything behaves; it changes how much of it you can see.
	</p>

	<a class="door" href={resolve('/workshop/runs')} data-testid="open-runs">
		<span class="title">Run Browser &amp; Run Lab</span>
		<span class="detail">
			Every run the Kit has stored, filterable — then the trace of any one of them, tick by tick,
			with the world beside it.
		</span>
	</a>

	<p class="note">
		The Bench Dashboard, Spec Lab, Eval Matrix and Policy Studio are specified in
		<code>17-PRO-MODE-UI-DESIGN.md</code> and arrive with later work packages. The rail says which.
	</p>
</main>

<style>
	main {
		max-width: 760px;
		display: grid;
		gap: var(--cab-space-4);
	}

	h1 {
		margin: 0;
		font-size: var(--cab-text-xl);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.lead {
		margin: 0;
		max-width: 62ch;
	}

	.door {
		display: grid;
		gap: var(--cab-space-1);
		padding: var(--cab-space-3);
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink);
		border-radius: var(--cab-radius-panel);
		color: var(--cab-ink);
		text-decoration: none;
	}

	.door:hover {
		background: var(--cab-paper);
	}

	.door:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	.title {
		font-weight: 700;
		letter-spacing: 0.04em;
	}

	.detail,
	.note {
		margin: 0;
		font-size: var(--cab-text-sm);
		color: var(--cab-ink-muted);
	}
</style>
