<script lang="ts">
	import type { GroupRunRecord, RunRecord } from '@craftabot/core';
	import { createRegistry } from '$lib/packs.js';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import { byNewestFirst } from '$lib/state/storage.js';
	import GroupRunRow from './GroupRunRow.svelte';
	import RunRow from './RunRow.svelte';

	/**
	 * The scrapbook itself (`16-…` §1.4, closing `12-…` D14 — runs persisted and
	 * nothing ever listed them).
	 *
	 * Shared by the all-bots page and one bot's page: the same rows, filtered.
	 * Loading lives here rather than in either route so the two cannot drift into
	 * showing the same run differently.
	 *
	 * **Shared adventures** (WP31, `24-…` §4.5) sit alongside solo rows rather
	 * than doubling up: a run carrying a `groupRunId` is a *member* of an
	 * episode, so it is excluded from the solo list and represented once, by
	 * its own `GroupRunRow`, in either bot's own scrapbook or the all-bots one
	 * — reusing the *concept* the Run Browser's `groupRows()` already proved,
	 * re-expressed here rather than shared as a component (`24-…` §4.5).
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
	let groupRuns = $state<GroupRunRecord[]>([]);
	let loaded = $state(false);

	type ScrapbookRow =
		| { kind: 'run'; run: RunRecord }
		| { kind: 'group'; group: GroupRunRecord; memberNames: string[] };

	const shown = $derived.by((): ScrapbookRow[] => {
		const soloRuns = runs.filter(
			(run) => run.groupRunId === undefined && (agentId === undefined || run.agentId === agentId)
		);
		const shownGroups =
			agentId === undefined
				? groupRuns
				: groupRuns.filter((g) => g.memberAgentIds.includes(agentId));

		const rows: ScrapbookRow[] = [
			...soloRuns.map((run): ScrapbookRow => ({ kind: 'run', run })),
			...shownGroups.map((group): ScrapbookRow => ({
				kind: 'group',
				group,
				memberNames: runs.filter((run) => run.groupRunId === group.id).map((run) => run.agentName)
			}))
		];
		return rows.sort((a, b) =>
			byNewestFirst(a.kind === 'run' ? a.run : a.group, b.kind === 'run' ? b.run : b.group)
		);
	});

	$effect(() => {
		void load();
	});

	async function load(): Promise<void> {
		const storage = await appStorage();
		// Newest first is storage's own ordering, and the order a scrapbook wants.
		runs = await storage.listRuns();
		groupRuns = await storage.listGroupRuns();
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

	async function pinGroup(group: GroupRunRecord, pinned: boolean): Promise<void> {
		const storage = await appStorage();
		await storage.setGroupRunPinned(group.id, pinned);
		await load();
	}

	function cardTitle(goalCardId: string): string | undefined {
		return registry.getGoalCard(goalCardId)?.title;
	}
</script>

<div class="list" data-testid="scrapbook-list">
	{#if loaded && shown.length === 0}
		<p class="empty" data-testid="scrapbook-empty">
			No adventures yet. Send {whose} to the Playroom and they will start turning up here.
		</p>
	{:else}
		{#each shown as row (row.kind === 'run' ? row.run.id : row.group.id)}
			{#if row.kind === 'run'}
				<RunRow
					run={row.run}
					showBot={agentId === undefined}
					cardTitle={cardTitle(row.run.goalCardId)}
					onpin={(pinned) => void pin(row.run, pinned)}
				/>
			{:else}
				<GroupRunRow
					group={row.group}
					memberNames={row.memberNames}
					cardTitle={cardTitle(row.group.goalCardId)}
					onpin={(pinned) => void pinGroup(row.group, pinned)}
				/>
			{/if}
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
