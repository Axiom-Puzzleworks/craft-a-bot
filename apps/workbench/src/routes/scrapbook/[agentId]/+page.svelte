<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { AgentRecord } from '@craftabot/core';
	import ScrapbookList from '$lib/components/scrapbook/ScrapbookList.svelte';
	import { appStorage } from '$lib/state/app-storage.svelte.js';

	/** One bot's adventures — `16-…` §1.4's `/scrapbook/[agentId]`. */

	const agentId = $derived(page.params.agentId ?? '');
	let record = $state<AgentRecord | undefined>(undefined);

	$effect(() => {
		void load(agentId);
	});

	async function load(id: string): Promise<void> {
		const storage = await appStorage();
		record = await storage.getAgent(id);
	}
</script>

<svelte:head><title>{record?.spec.name ?? 'Scrapbook'} — Craft A Bot</title></svelte:head>

<main>
	<header>
		<a class="back" href={resolve('/')}>← Shelf</a>
		<h1>{record?.spec.name ?? 'This bot'}'s adventures</h1>
	</header>

	<ScrapbookList {agentId} whose={record?.spec.name ?? 'this bot'} />
</main>

<style>
	main {
		max-width: 46rem;
		margin: 0 auto;
		padding: var(--cab-space-5) var(--cab-space-4);
		display: grid;
		gap: var(--cab-space-4);
	}

	.back {
		font-size: var(--cab-text-sm);
		color: var(--cab-blue-text);
	}

	h1 {
		margin: var(--cab-space-1) 0 0;
		font-size: var(--cab-text-xl);
		color: var(--cab-blue-text);
	}
</style>
