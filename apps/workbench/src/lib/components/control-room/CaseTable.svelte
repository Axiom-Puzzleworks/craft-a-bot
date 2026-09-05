<script lang="ts">
	import Lamp from './Lamp.svelte';
	import type { Status } from '$lib/control-room/dataviz.js';

	/**
	 * **CaseTable** (WP57, `44-CONTROL-ROOM.md` §4.4): the drill-through —
	 * one row per case, a column per fact, a verdict drawn as a `Lamp` where
	 * a column says so, sortable by any column, a click per row. Every
	 * number a report quotes lands here for the reader who wants the row.
	 */
	export interface CaseColumn {
		id: string;
		label: string;
		/** `status` renders the cell's value (a `Status`) as a lamp. */
		kind?: 'text' | 'number' | 'status';
	}

	export interface CaseRow {
		id: string;
		cells: Record<string, string | number | Status | undefined>;
	}

	interface Props {
		columns: CaseColumn[];
		rows: CaseRow[];
		onRow?: ((rowId: string) => void) | undefined;
		testId?: string | undefined;
	}

	let { columns, rows, onRow, testId }: Props = $props();

	let sortBy = $state<string | undefined>(undefined);
	let ascending = $state(true);

	const sorted = $derived.by(() => {
		if (sortBy === undefined) return rows;
		const key = sortBy;
		const kind = columns.find((column) => column.id === key)?.kind ?? 'text';
		return [...rows].sort((a, b) => {
			const av = a.cells[key];
			const bv = b.cells[key];
			let order: number;
			if (kind === 'number') order = Number(av ?? Number.NaN) - Number(bv ?? Number.NaN);
			else order = String(av ?? '').localeCompare(String(bv ?? ''));
			if (Number.isNaN(order)) order = 0;
			return ascending ? order : -order;
		});
	});

	function sort(id: string): void {
		if (sortBy === id) ascending = !ascending;
		else {
			sortBy = id;
			ascending = true;
		}
	}

	const isStatus = (value: unknown): value is Status =>
		value === 'pass' || value === 'fail' || value === 'inconclusive' || value === 'live';
</script>

<table class="cases" data-testid={testId}>
	<thead>
		<tr>
			{#each columns as column (column.id)}
				<th
					scope="col"
					aria-sort={sortBy === column.id ? (ascending ? 'ascending' : 'descending') : 'none'}
				>
					<button type="button" onclick={() => sort(column.id)}>
						{column.label}
						{#if sortBy === column.id}<span aria-hidden="true">{ascending ? '▲' : '▼'}</span>{/if}
					</button>
				</th>
			{/each}
		</tr>
	</thead>
	<tbody>
		{#each sorted as row (row.id)}
			<tr
				data-testid={testId ? `${testId}-row-${row.id}` : undefined}
				data-clickable={onRow !== undefined}
			>
				{#each columns as column (column.id)}
					{@const value = row.cells[column.id]}
					<td class={column.kind ?? 'text'}>
						{#if column.kind === 'status' && isStatus(value)}
							<Lamp status={value} />
						{:else if onRow && column.id === columns[0]?.id}
							<button type="button" class="row-link" onclick={() => onRow?.(row.id)}
								>{value ?? '—'}</button
							>
						{:else}
							{value ?? '—'}
						{/if}
					</td>
				{/each}
			</tr>
		{/each}
	</tbody>
</table>

<style>
	.cases {
		border-collapse: collapse;
		width: 100%;
		color: var(--cab-ink);
		background: var(--cab-cream);
		font-size: var(--cab-text-sm);
	}

	th,
	td {
		border: 1px solid var(--cab-ink);
		padding: var(--cab-space-1) var(--cab-space-2);
		text-align: left;
	}

	th {
		background: var(--cab-metal);
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--cab-engrave);
	}

	th button,
	.row-link {
		font: inherit;
		color: inherit;
		background: none;
		border: 0;
		padding: 0;
		cursor: pointer;
	}

	th button {
		font-weight: 700;
		text-transform: inherit;
		letter-spacing: inherit;
	}

	.row-link {
		text-decoration: underline;
		font-family: var(--cab-font-mono);
	}

	th button:focus-visible,
	.row-link:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	td.number {
		text-align: right;
		font-family: var(--cab-font-mono);
	}
</style>
