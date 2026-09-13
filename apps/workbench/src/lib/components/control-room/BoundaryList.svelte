<script lang="ts">
	import type { BoundaryTwinRow } from '$lib/control-room/boundary-twin.js';

	/**
	 * **BoundaryList** (WP110, `97-ACCESS.md` §1; tenet 29): the Boundary's
	 * list twin — the rows `boundaryTwin` folds from the drawing's own layout,
	 * always rendered beneath the figure, never hidden behind a toggle. Every
	 * row carries the id the drawing's focus stop names, so a reader at a stop
	 * hears this row.
	 */
	interface Props {
		rows: readonly BoundaryTwinRow[];
		testId?: string | undefined;
		/** The row the drawing has focused, so it is marked. */
		current?: string | undefined;
	}

	let { rows, testId = 'boundary-list', current }: Props = $props();
	const KIND_WORD: Record<BoundaryTwinRow['kind'], string> = {
		outside: 'Outside the boundary',
		ring: 'On the ring',
		inside: 'Inside',
		stage: 'The journey'
	};
	const groups = $derived(
		(['outside', 'ring', 'inside', 'stage'] as const)
			.map((kind) => ({
				kind,
				word: KIND_WORD[kind],
				rows: rows.filter((row) => row.kind === kind)
			}))
			.filter((group) => group.rows.length > 0)
	);
</script>

<div class="twin" data-testid={testId}>
	{#each groups as group (group.kind)}
		<section aria-label={group.word} data-testid="{testId}-{group.kind}">
			<h3>{group.word}</h3>
			<ol>
				{#each group.rows as row (row.id)}
					<li
						id="{testId}-row-{row.id}"
						data-testid="{testId}-row"
						data-row={row.id}
						data-lit={row.lit}
						data-stop={row.stop}
						class:current={row.id === current}
					>
						<b>{row.label}</b>
						{row.detail}
						{#if row.flagged}<span class="flag">⚠</span>{/if}
					</li>
				{/each}
			</ol>
		</section>
	{/each}
</div>

<style>
	.twin {
		display: grid;
		gap: var(--cab-space-2);
		font-size: var(--cab-text-xs);
	}

	h3 {
		margin: 0;
		font-size: var(--cab-text-xs);
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	ol {
		display: grid;
		gap: 2px;
		margin: 0;
		padding: 0 0 0 var(--cab-space-4);
	}

	li.current {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	.flag {
		color: var(--cab-fail);
	}
</style>
