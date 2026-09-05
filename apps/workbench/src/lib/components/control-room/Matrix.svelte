<script lang="ts">
	import { SEQUENTIAL_TEAL, sequential, type RampStep } from '$lib/control-room/dataviz.js';

	/**
	 * **Matrix** (WP57, `44-CONTROL-ROOM.md` §4.4): the campaign grid and the
	 * confusion matrix on one component — row and column heads, a sequential
	 * fill from the grammar with the value in every cell (`17-…` §4.4's
	 * rule: colour is magnitude, the number is the fact), row and column
	 * summaries, and an optional click per cell. A table, deliberately: a
	 * reader gets the headers, and no `<svg>` is needed.
	 */
	export interface MatrixCell {
		/** In `[0, 1]`, for the fill. */
		value: number;
		/** What the cell says. */
		label: string;
		/** A quieter second line. */
		note?: string | undefined;
	}

	interface Props {
		corner?: string;
		rows: { id: string; label: string }[];
		cols: { id: string; label: string }[];
		cell: (rowId: string, colId: string) => MatrixCell | undefined;
		/** Row and column totals, when the numbers add up. */
		rowSummary?: ((rowId: string) => string) | undefined;
		colSummary?: ((colId: string) => string) | undefined;
		ramp?: readonly RampStep[];
		onCell?: ((rowId: string, colId: string) => void) | undefined;
		testId?: string | undefined;
	}

	let {
		corner = '',
		rows,
		cols,
		cell,
		rowSummary,
		colSummary,
		ramp = SEQUENTIAL_TEAL,
		onCell,
		testId
	}: Props = $props();
</script>

<table class="matrix" data-testid={testId}>
	<thead>
		<tr>
			<th scope="col">{corner}</th>
			{#each cols as col (col.id)}
				<th scope="col">{col.label}</th>
			{/each}
			{#if rowSummary}
				<th scope="col" class="summary">Σ</th>
			{/if}
		</tr>
	</thead>
	<tbody>
		{#each rows as row (row.id)}
			<tr>
				<th scope="row">{row.label}</th>
				{#each cols as col (col.id)}
					{@const entry = cell(row.id, col.id)}
					<td data-testid={testId ? `${testId}-${row.id}-${col.id}` : undefined}>
						{#if entry}
							{@const step = sequential(entry.value, ramp)}
							{#if onCell}
								<button
									type="button"
									class="square"
									style="--fill: {step.fill}; --label: {step.ink
										? 'var(--cab-ink)'
										: 'var(--cab-cream)'}"
									onclick={() => onCell?.(row.id, col.id)}
								>
									<b>{entry.label}</b>
									{#if entry.note}<span>{entry.note}</span>{/if}
								</button>
							{:else}
								<span
									class="square"
									style="--fill: {step.fill}; --label: {step.ink
										? 'var(--cab-ink)'
										: 'var(--cab-cream)'}"
								>
									<b>{entry.label}</b>
									{#if entry.note}<span>{entry.note}</span>{/if}
								</span>
							{/if}
						{:else}
							<span class="empty">—</span>
						{/if}
					</td>
				{/each}
				{#if rowSummary}
					<td class="summary">{rowSummary(row.id)}</td>
				{/if}
			</tr>
		{/each}
	</tbody>
	{#if colSummary}
		<tfoot>
			<tr>
				<th scope="row" class="summary">Σ</th>
				{#each cols as col (col.id)}
					<td class="summary">{colSummary(col.id)}</td>
				{/each}
				{#if rowSummary}
					<td class="summary"></td>
				{/if}
			</tr>
		</tfoot>
	{/if}
</table>

<style>
	.matrix {
		border-collapse: collapse;
		width: 100%;
		color: var(--cab-ink);
		background: var(--cab-cream);
	}

	th,
	td {
		border: 1.5px solid var(--cab-ink);
		padding: 0;
		text-align: center;
		font-size: var(--cab-text-sm);
	}

	th {
		padding: var(--cab-space-1) var(--cab-space-2);
		background: var(--cab-metal);
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--cab-engrave);
	}

	tbody th {
		text-align: left;
	}

	.summary {
		background: var(--cab-graph);
		font-weight: 700;
		padding: var(--cab-space-1) var(--cab-space-2);
	}

	.square {
		display: grid;
		width: 100%;
		min-height: 3rem;
		padding: var(--cab-space-1) var(--cab-space-2);
		place-content: center;
		background: var(--fill);
		color: var(--label);
		border: 0;
		font: inherit;
	}

	button.square {
		cursor: pointer;
	}

	button.square:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: -3px;
	}

	.square b {
		font-size: var(--cab-text-base);
	}

	.square span {
		font-size: var(--cab-text-xs);
	}

	.empty {
		display: block;
		padding: var(--cab-space-2);
		color: var(--cab-ink-muted);
	}
</style>
