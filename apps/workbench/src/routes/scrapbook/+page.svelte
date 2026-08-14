<script lang="ts">
	import ScrapbookList from '$lib/components/scrapbook/ScrapbookList.svelte';

	/**
	 * Every bot's adventures (`16-…` §1.4).
	 *
	 * §1.4 specifies `/scrapbook/[agentId]`, and §1.5 wants Scrapbook in a header
	 * that is on every screen — including the Shelf, where there is no current
	 * bot to have a scrapbook. This page is what that header points at; the
	 * per-bot page is the same list filtered.
	 */
</script>

<svelte:head><title>Scrapbook — Craft A Bot</title></svelte:head>

<main>
	<header>
		<h1>The Scrapbook</h1>
		<p class="tagline">Everything your bots have got up to.</p>
	</header>

	<ScrapbookList whose="a bot" />
</main>

<style>
	main {
		max-width: 46rem;
		margin: 0 auto;
		padding: var(--cab-space-5) var(--cab-space-4);
		display: grid;
		gap: var(--cab-space-4);
	}

	h1 {
		margin: 0;
		font-size: var(--cab-text-2xl);
		color: var(--cab-blue-text);
	}

	.tagline {
		margin: 0;
		font-size: var(--cab-text-sm);
		opacity: 0.8;
	}
</style>
