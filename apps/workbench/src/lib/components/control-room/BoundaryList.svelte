<script lang="ts">
	import type { BoundaryTwinRow } from '$lib/control-room/boundary-twin.js';

	/**
	 * **BoundaryList** (WP110, `97-ACCESS.md` §1; tenet 29): the Boundary's
	 * list twin — the rows `boundaryTwin` folds from the drawing's own layout,
	 * always rendered beneath the figure, never hidden behind a toggle. One
	 * list, *Every edge*, a row per outside node, ring element, inside
	 * occupant and workflow stage; every row carries the id the drawing's
	 * focus stop names, so a reader at a stop hears this row.
	 */
	interface Props {
		rows: readonly BoundaryTwinRow[];
		/** The prefix of every row's id and test id: `boundary-list`. */
		testId?: string | undefined;
		/** The row the drawing has focused, so it is marked. */
		current?: string | undefined;
	}

	let { rows, testId = 'boundary-list', current }: Props = $props();
	/** An outside row keeps its edge as its key (the e2e and the drawing's stop name it); the rest their id. */
	export const rowKey = (row: BoundaryTwinRow): string => row.edge ?? row.id;
</script>

<ol class="edges" aria-label="Every edge" data-testid={testId}>
	{#each rows as row (row.id)}
		<li
			id="{testId}-{rowKey(row)}"
			data-testid="{testId}-{rowKey(row)}"
			data-kind={row.kind}
			data-lit={row.lit}
			data-stop={row.stop}
			class:current={row.id === current}
		>
			<b>{row.label}</b>
			{row.detail}
			{#if row.flagged}<span class="flag" aria-hidden="true">⚠</span>{/if}
		</li>
	{/each}
</ol>

<style>
	.edges {
		display: grid;
		gap: 2px;
		margin: 0;
		padding: 0 0 0 var(--cab-space-4);
		font-size: var(--cab-text-xs);
	}

	li.current {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	.flag {
		color: var(--cab-fail);
	}
</style>
