<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A cream card with a thick rounded border and its title on a colour tab
	 * poking out of the top edge — the box-art panel treatment (04 §5).
	 */
	interface Props {
		title: string;
		/** Any `--cab-*` colour; defaults to the frame blue. */
		accent?: string;
		/**
		 * The heading colour on that accent. Cream suits the dark accents; a light
		 * one needs ink, and `04-…` §7 bans white on yellow outright — which is
		 * what the Instruction Leaflet panel was doing until axe said so.
		 */
		accentInk?: string;
		children: Snippet;
		actions?: Snippet;
	}

	let {
		title,
		accent = 'var(--cab-blue)',
		accentInk = 'var(--cab-cream)',
		children,
		actions
	}: Props = $props();
</script>

<section class="panel" style="--accent: {accent}; --accent-ink: {accentInk}">
	<header>
		<h2>{title}</h2>
		{#if actions}
			<div class="actions">{@render actions()}</div>
		{/if}
	</header>
	<div class="body">{@render children()}</div>
</section>

<style>
	.panel {
		position: relative;
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--accent);
		border-radius: var(--cab-radius-panel);
		box-shadow: var(--cab-drop-shadow);
		min-width: 0;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--cab-space-2);
		padding: var(--cab-space-2) var(--cab-space-3);
		background: var(--accent);
		border-radius: 6px 6px 0 0;
	}

	h2 {
		margin: 0;
		font-size: var(--cab-text-sm);
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--accent-ink);
	}

	.actions {
		display: flex;
		gap: var(--cab-space-2);
	}

	.body {
		padding: var(--cab-space-3);
	}
</style>
