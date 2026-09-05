<script lang="ts">
	import type { DeskWorldState, RunOutcome } from '@craftabot/core';
	import CaseFile from '$lib/components/control-room/CaseFile.svelte';
	import Queue from '$lib/components/control-room/Queue.svelte';
	import Transcript from '$lib/components/control-room/Transcript.svelte';

	/**
	 * **The Desk** (WP53, `43-DESK-WORLDS.md` §4.2; rebuilt on the Control
	 * Room's `Transcript`, `CaseFile` and `Queue` in WP57 stage B,
	 * `44-CONTROL-ROOM.md` §4.4): three panes over `DeskWorldState` and
	 * nothing else, plus an alerts strip and the "FOR SIMULATION ONLY" strip
	 * every Desk carries in every mode (`41-…` §13). The state comes
	 * entirely from `world.changed` events (hard rule 3), the same way
	 * `WorldView`'s does; nothing here reaches the engine. The test ids the
	 * components carry are the contract WP53's e2e reads.
	 *
	 * `data-testid="world-view"` on the outer element on purpose: every e2e
	 * that waits for "the world" keeps its selector whichever world it is.
	 */
	interface Props {
		world: DeskWorldState;
		outcome?: RunOutcome | undefined;
	}

	let { world, outcome }: Props = $props();

	const label = $derived(
		`${world.desk.title}. ${world.transcript.length} lines said, ${world.records.length} records on the desk, ${world.queue.length} in the queue.`
	);
</script>

<div class="desk" data-testid="world-view" data-world="desk" role="region" aria-label={label}>
	<p class="simulation" data-testid="desk-simulation-only">FOR SIMULATION ONLY</p>

	<header class="head">
		<h2 class="title" data-testid="desk-title">{world.desk.title}</h2>
		<p class="role">{world.desk.role}</p>
		{#if outcome}
			<p class="outcome" data-outcome={outcome}>{outcome}</p>
		{/if}
	</header>

	{#if world.alerts.length > 0}
		<ul class="alerts" aria-label="Alerts" data-testid="desk-alerts">
			{#each world.alerts as alert (alert.id)}
				<li data-severity={alert.severity}>
					<span class="severity">{alert.severity}</span>
					{alert.text}
				</li>
			{/each}
		</ul>
	{/if}

	<div class="panes">
		<Transcript lines={world.transcript} />
		<CaseFile records={world.records} />
		<Queue items={world.queue} />
	</div>
</div>

<style>
	.desk {
		display: grid;
		gap: var(--cab-space-3);
		padding: var(--cab-space-4);
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink);
		border-radius: var(--cab-radius-panel);
		color: var(--cab-ink);
	}

	.simulation {
		margin: 0;
		justify-self: start;
		padding: var(--cab-space-1) var(--cab-space-2);
		font-size: var(--cab-text-xs);
		font-weight: 700;
		letter-spacing: 0.08em;
		border: 2px solid var(--cab-ink);
		border-radius: var(--cab-radius-pill);
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-2) var(--cab-space-3);
		align-items: baseline;
	}

	.title {
		margin: 0;
		font-size: var(--cab-text-lg);
	}

	.role,
	.outcome {
		margin: 0;
		color: var(--cab-ink-muted);
	}

	.alerts {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: var(--cab-space-1);
	}

	.alerts li {
		padding: var(--cab-space-1) var(--cab-space-2);
		border-left: 4px solid var(--cab-yellow);
		background: var(--cab-paper);
	}

	.alerts li[data-severity='critical'] {
		border-left-color: var(--cab-red);
	}

	.severity {
		font-size: var(--cab-text-xs);
		font-weight: 700;
		text-transform: uppercase;
		margin-right: var(--cab-space-2);
	}

	.panes {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr);
		gap: var(--cab-space-3);
	}

	@media (max-width: 900px) {
		.panes {
			grid-template-columns: 1fr;
		}
	}
</style>
