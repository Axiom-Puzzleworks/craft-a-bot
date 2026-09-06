<script lang="ts">
	import { resolve } from '$app/paths';
	import { edition, sectionFor } from '$lib/edition.js';

	/**
	 * **Not in this box** (`59-EDITIONS.md` §4.3, WP69): the page an edition
	 * renders for a route outside its allow-list — a plain statement, the
	 * section that has it as a link on the same host, and the way back to
	 * this section's shelf. The Kit's voice: boxes, not editions.
	 */
	interface Props {
		path: string;
	}

	let { path }: Props = $props();
	const section = $derived(sectionFor(path));
</script>

<main data-testid="not-in-this-box" data-edition={edition.id}>
	<h1>This is not in this box</h1>
	<p>
		<code>{path}</code> is not part of <strong>{edition.title}</strong>.
		{#if section}
			It lives in <strong>{section.title}</strong>.
		{/if}
	</p>
	<p class="links">
		{#if section}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- another section of the same host, not a route of this app -->
			<a href="{section.base}/" data-testid="not-in-this-box-section">Open {section.title}</a>
		{/if}
		<a href={resolve('/')} data-testid="not-in-this-box-home">Back to the shelf</a>
	</p>
</main>

<style>
	main {
		display: grid;
		gap: var(--cab-space-3);
		align-content: start;
		max-width: 640px;
		margin: var(--cab-space-5) auto;
		padding: var(--cab-space-4);
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-panel);
	}

	h1 {
		margin: 0;
		font-size: var(--cab-text-xl);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.links {
		display: flex;
		gap: var(--cab-space-3);
		flex-wrap: wrap;
	}
</style>
