<script lang="ts">
	import type { JourneyLayout, StageRecord } from '@craftabot/core';
	import { journeyTwin } from '$lib/control-room/journey-twin.js';
	import Lamp from './Lamp.svelte';
	import { statusOfStage } from '$lib/workshop/pipeline.js';

	/**
	 * **JourneyList** (WP100, `87-JOURNEY-CANVAS.md` §6): the canvas's list
	 * twin — the stages table and the edges table from the same layout,
	 * rendered beside the drawing at every width, never removed.
	 */
	interface Props {
		layout: JourneyLayout;
		run?: { stages: readonly StageRecord[] } | undefined;
		testId?: string | undefined;
		/** The stage the canvas has selected, so the row is marked. */
		selected?: string | undefined;
		onSelect?: ((stageId: string) => void) | undefined;
	}

	let { layout, run, testId = 'journey-list', selected, onSelect }: Props = $props();
	const twin = $derived(journeyTwin(layout, run));
	const lit = $derived(layout.lit !== undefined);
</script>

<div class="twin" data-testid={testId}>
	<table data-testid="{testId}-stages">
		<caption>Stages, in journey order</caption>
		<thead>
			<tr>
				<th scope="col">Stage</th>
				<th scope="col">Lane</th>
				<th scope="col">Executor</th>
				<th scope="col">Obligations</th>
				<th scope="col">Guards</th>
				{#if lit}
					<th scope="col">Status</th>
					<th scope="col">Verdicts</th>
					<th scope="col">Took</th>
				{/if}
			</tr>
		</thead>
		<tbody>
			{#each twin.stages as row (row.stageId)}
				<tr
					id="{testId}-row-{row.stageId}"
					data-testid="{testId}-stage-{row.stageId}"
					class:selected={row.stageId === selected}
					aria-selected={onSelect ? row.stageId === selected : undefined}
				>
					<th scope="row">
						{#if onSelect}
							<button type="button" class="link" onclick={() => onSelect?.(row.stageId)}
								>{row.name}</button
							>
						{:else}
							{row.name}
						{/if}
						{#if row.irreversible}<span class="hazard" title="irreversible">⚠</span><span
								class="sr-only">irreversible</span
							>{/if}
					</th>
					<td>{row.lane}</td>
					<td>{row.executor}</td>
					<td>{row.obligations.length === 0 ? '—' : row.obligations.join(', ')}</td>
					<td>{row.guards.length === 0 ? '—' : row.guards.join(', ')}</td>
					{#if lit}
						<td
							>{#if row.status}<Lamp
									status={statusOfStage(row.status)}
									label={row.status}
								/>{:else}—{/if}</td
						>
						<td>{row.verdicts.length === 0 ? '—' : row.verdicts.join('; ')}</td>
						<td>{row.took ?? '—'}</td>
					{/if}
				</tr>
			{/each}
		</tbody>
	</table>
	<table data-testid="{testId}-edges">
		<caption>Edges</caption>
		<thead>
			<tr>
				<th scope="col">From</th>
				<th scope="col">To</th>
				<th scope="col">On</th>
				<th scope="col">Kind</th>
				{#if lit}<th scope="col">Taken</th>{/if}
			</tr>
		</thead>
		<tbody>
			{#each twin.edges as edge (edge.id)}
				<tr data-testid="{testId}-edge-{edge.id}" class:taken={edge.taken}>
					<td>{edge.from}</td>
					<td>{edge.to}</td>
					<td>{edge.label === '' ? '—' : edge.label}</td>
					<td>{edge.kind}</td>
					{#if lit}<td>{edge.taken ? 'yes' : '—'}</td>{/if}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.twin {
		display: grid;
		gap: var(--cab-space-3);
		font-size: var(--cab-text-sm);
	}
	table {
		border-collapse: collapse;
		width: 100%;
	}
	caption {
		text-align: left;
		font-weight: 700;
		padding: 0 0 var(--cab-space-1);
	}
	th,
	td {
		text-align: left;
		vertical-align: top;
		padding: var(--cab-space-1) var(--cab-space-2);
		border-bottom: 1px solid var(--cab-metal);
	}
	th[scope='row'] {
		font-weight: 700;
	}
	tr.selected {
		background: var(--cab-graph);
	}
	tr.taken td {
		font-weight: 700;
	}
	.link {
		all: unset;
		cursor: pointer;
		text-decoration: underline;
		font-weight: 700;
	}
	.link:focus-visible {
		outline: var(--cab-focus-ring);
	}
	.hazard {
		color: var(--cab-fail);
		margin-left: var(--cab-space-1);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
</style>
