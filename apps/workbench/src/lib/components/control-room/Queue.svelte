<script lang="ts">
	import type { DeskQueueItem } from '@craftabot/core';
	import Lamp from './Lamp.svelte';
	import type { Status } from '$lib/control-room/dataviz.js';

	/**
	 * **Queue** (WP57, `44-CONTROL-ROOM.md` §4.4): the Desk's queue — one
	 * row per item with its status as a `Lamp`-styled chip, its decision
	 * when made, and the records it names. The `desk-queue-{id}` ids are the
	 * contract WP53's e2e reads.
	 */
	interface Props {
		items: readonly DeskQueueItem[];
		testId?: string;
	}

	let { items, testId = 'desk-queue' }: Props = $props();

	/** A queue status onto a lamp: decided passes, escalated is inconclusive, open is live work. */
	const STATUS_LAMP: Record<DeskQueueItem['status'], Status> = {
		open: 'live',
		'in-progress': 'live',
		decided: 'pass',
		escalated: 'inconclusive'
	};
</script>

<section class="queue" aria-label="Queue" data-testid={testId}>
	<h3>Queue</h3>
	{#if items.length === 0}
		<p class="empty">The queue is empty.</p>
	{:else}
		<ul>
			{#each items as item (item.id)}
				<li
					data-testid="desk-queue-{item.id}"
					data-status={item.status}
					aria-label="{item.title}, {item.status}{item.decision ? `: ${item.decision}` : ''}"
				>
					<Lamp status={STATUS_LAMP[item.status]} label={item.status} />
					<span class="item-title">{item.title}</span>
					{#if item.decision}
						<span class="decision">{item.decision}</span>
					{/if}
					{#if item.recordIds.length > 0}
						<span class="records">about {item.recordIds.join(', ')}</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.queue {
		min-width: 0;
		padding: var(--cab-space-3);
		background: var(--cab-paper);
		border-radius: var(--cab-radius-part);
		color: var(--cab-ink);
	}

	h3 {
		margin: 0 0 var(--cab-space-2);
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--cab-engrave);
	}

	.empty {
		margin: 0;
		color: var(--cab-ink-muted);
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: var(--cab-space-2);
	}

	li {
		display: grid;
		gap: var(--cab-space-1);
		justify-items: start;
		padding: var(--cab-space-2);
		background: var(--cab-cream);
		border-radius: var(--cab-radius-part);
	}

	.decision,
	.records {
		font-size: var(--cab-text-sm);
		color: var(--cab-ink-muted);
	}
</style>
