<script lang="ts">
	import type { RunRecord } from '@craftabot/core';
	import { createRegistry } from '$lib/packs.js';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import RunRow from './RunRow.svelte';

	/**
	 * The scrapbook itself (`16-…` §1.4, closing `12-…` D14 — runs persisted and
	 * nothing ever listed them).
	 *
	 * Shared by the all-bots page and one bot's page: the same rows, filtered.
	 * Loading lives here rather than in either route so the two cannot drift into
	 * showing the same run differently.
	 */
	interface Props {
		/** Show only this bot's adventures; every bot's when absent. */
		agentId?: string | undefined;
		/** Heading the page has already rendered — used for the empty message. */
		whose: string;
	}

	let { agentId, whose }: Props = $props();

	const registry = createRegistry();
	let runs = $state<RunRecord[]>([]);
	let loaded = $state(false);

	const shown = $derived(
		agentId === undefined ? runs : runs.filter((run) => run.agentId === agentId)
	);

	$effect(() => {
		void load();
	});

	async function load(): Promise<void> {
		const storage = await appStorage();
		// Newest first is storage's own ordering, and the order a scrapbook wants.
		runs = await storage.listRuns();
		loaded = true;
	}

	async function pin(run: RunRecord, pinned: boolean): Promise<void> {
		const storage = await appStorage();
		await storage.setRunPinned(run.id, pinned);
		// Re-read rather than patch in place: the pin is the one thing that
		// changes what eviction will do next, and guessing at it here would be a
		// second opinion about state storage owns.
		await load();
	}

	function cardTitle(run: RunRecord): string | undefined {
		return registry.getGoalCard(run.goalCardId)?.title;
	}
</script>

<div class="list" data-testid="scrapbook-list">
	{#if loaded && shown.length === 0}
		<p class="empty" data-testid="scrapbook-empty">
			No adventures yet. Send {whose} to the Playroom and they will start turning up here.
		</p>
	{:else}
		{#each shown as run (run.id)}
			<RunRow
				{run}
				showBot={agentId === undefined}
				cardTitle={cardTitle(run)}
				onpin={(pinned) => void pin(run, pinned)}
			/>
		{/each}
	{/if}
</div>

<style>
	.list {
		display: grid;
		gap: var(--cab-space-2);
	}

	.empty {
		margin: 0;
		padding: var(--cab-space-4);
		border: var(--cab-border-part) dashed var(--cab-ink);
		border-radius: var(--cab-radius-panel);
		text-align: center;
		font-size: var(--cab-text-sm);
		opacity: 0.85;
	}
</style>
