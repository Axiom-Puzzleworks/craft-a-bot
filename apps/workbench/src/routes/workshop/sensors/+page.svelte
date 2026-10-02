<script lang="ts">
	import { resolve } from '$app/paths';
	import { sensorInventory, sensorInventoryExport } from '@craftabot/governance/reports';
	import CaseTable from '$lib/components/control-room/CaseTable.svelte';
	import Readout from '$lib/components/control-room/Readout.svelte';
	import Roundel from '$lib/components/control-room/Roundel.svelte';
	import Strip from '$lib/components/control-room/Strip.svelte';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import {
		SEEN_RUN_LIMIT,
		countEventTypes,
		filterSensors,
		openFindings,
		sensorWords,
		sourcesOf,
		type SensorFilter
	} from '$lib/workshop/sensors.js';

	/**
	 * **The Sensor Inventory** (WP159, `112-REAL-ENOUGH-PLAN.md` §5): every
	 * event type a run can carry, one row each — where it is written, what it
	 * carries, who reads it. The Control Inventory lists what constrains a bot;
	 * this lists what records it. The rows are the fold's (`sensorInventory`),
	 * and the headless host's `craftabot sensors` says the same; *seen here*
	 * is counted from the runs stored in this browser.
	 */
	const rows = sensorInventory();
	const summary = sensorInventoryExport(rows, '').summary;
	const findings = openFindings(rows);
	const sources = sourcesOf(rows);

	let seen = $state.raw<Record<string, number> | undefined>(undefined);
	$effect(() => {
		void (async () => {
			seen = await countEventTypes(await appStorage());
		})();
	});

	let filter = $state<SensorFilter>({});
	const shown = $derived(filterSensors(rows, filter));

	const columns = [
		{ id: 'event', label: 'Event', kind: 'text' as const },
		{ id: 'source', label: 'Written by', kind: 'text' as const },
		{ id: 'since', label: 'Since', kind: 'text' as const },
		{ id: 'readers', label: 'Read by', kind: 'text' as const },
		{ id: 'optional', label: 'Optional fields', kind: 'text' as const },
		{ id: 'seen', label: 'Seen here', kind: 'number' as const }
	];
	const tableRows = $derived(
		shown.map((row) => {
			const words = sensorWords(row);
			return {
				id: row.type,
				cells: {
					event: row.type,
					source: row.source,
					since: row.since,
					readers: words.readers,
					optional: words.optional,
					seen: seen?.[row.type] ?? 0
				}
			};
		})
	);

	let openType = $state<string | undefined>(undefined);
	const open = $derived(rows.find((row) => row.type === openType));
	const openWords = $derived(open ? sensorWords(open) : undefined);
</script>

<svelte:head>
	<title>Sensor Inventory — Craft A Bot Workshop</title>
</svelte:head>

<main>
	<h1><Roundel icon="inventory" size={28} /> Sensor Inventory</h1>
	<p class="lede" data-testid="sensors-lede">
		Every event a run can carry, one row each: which part of the system writes it, which fields may
		be absent, and who reads it. Whatever the Run Lab, the story strip, the reports and the exports
		show of a run comes from one of these. The
		<a href={resolve('/workshop/controls')}>Control Inventory</a> lists what constrains a bot; this lists
		what records it.
	</p>

	<section aria-label="At a glance">
		<Strip label="Sensors" icon="inventory">
			<Readout label="Event types" value={summary.types} testId="sensors-count" />
			<Readout label="Read by a fold" value={summary.folded} testId="sensors-folded" />
			<Readout label="Listed only" value={summary.listedOnly} testId="sensors-listed" />
			<Readout label="Optional fields" value={summary.optionalFields} testId="sensors-optional" />
		</Strip>
		<p class="note">
			Whether each one still fires is held by the harness's coverage test, not by this page: it runs
			the seven-desk bank day and a set of small fixtures and fails by name if an event goes quiet.
			<em>Seen here</em> counts the events in the {SEEN_RUN_LIMIT} most recent runs stored in this browser.
		</p>
	</section>

	{#if findings.length > 0}
		<section aria-labelledby="findings-h" data-testid="sensors-findings">
			<h2 id="findings-h">Open findings</h2>
			<p class="note">Events only the trace list reads — nothing folds them yet, and why:</p>
			<ul>
				{#each findings as row (row.type)}
					<li><code>{row.type}</code> — {row.unfolded}</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section aria-labelledby="list-h">
		<h2 id="list-h">Every event</h2>
		<div class="filters" data-testid="sensors-filters">
			<label class="field">
				<span>Written by</span>
				<select
					value={filter.source ?? ''}
					onchange={(event) => {
						const source = event.currentTarget.value;
						const { source: _source, ...rest } = filter;
						void _source;
						filter = source === '' ? rest : { ...rest, source: source as (typeof sources)[number] };
					}}
					data-testid="sensors-filter-source"
				>
					<option value="">Any</option>
					{#each sources as source (source)}
						<option value={source}>{source}</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span>Read by</span>
				<select
					value={filter.reading ?? ''}
					onchange={(event) => {
						const reading = event.currentTarget.value;
						const { reading: _reading, ...rest } = filter;
						void _reading;
						filter = reading === 'folded' || reading === 'listed' ? { ...rest, reading } : rest;
					}}
					data-testid="sensors-filter-reading"
				>
					<option value="">Any</option>
					<option value="folded">a fold</option>
					<option value="listed">the trace list only</option>
				</select>
			</label>
			<label class="field">
				<span>Search</span>
				<input
					type="search"
					value={filter.q ?? ''}
					oninput={(event) => {
						const q = event.currentTarget.value.trim();
						const { q: _q, ...rest } = filter;
						void _q;
						filter = q === '' ? rest : { ...rest, q };
					}}
					data-testid="sensors-filter-q"
				/>
			</label>
			<span class="count" data-testid="sensors-shown">{shown.length} of {rows.length}</span>
		</div>

		<CaseTable {columns} rows={tableRows} onRow={(id) => (openType = id)} testId="sensors-table" />
	</section>

	{#if open && openWords}
		<section class="entry" aria-labelledby="sensor-h" data-testid="sensors-entry">
			<h2 id="sensor-h"><code>{open.type}</code></h2>
			<dl class="facets">
				<dt>Written by</dt>
				<dd>{open.source}, since {open.since}</dd>
				<dt>Read by</dt>
				<dd data-testid="sensors-entry-readers">{openWords.readers}</dd>
				<dt>Fields</dt>
				<dd data-testid="sensors-entry-fields">
					{#each open.fields as field, index (field.name)}
						{index > 0 ? ', ' : ''}<code>{field.name}</code>{field.optional ? ' (optional)' : ''}
					{:else}
						none — the event is its type and its tick
					{/each}
				</dd>
				{#if openWords.note}
					<dt>Open finding</dt>
					<dd data-testid="sensors-entry-note">{openWords.note}</dd>
				{/if}
			</dl>
		</section>
	{/if}
</main>

<style>
	.lede,
	.note {
		max-width: 75ch;
	}
	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--cab-space-3);
		margin-bottom: var(--cab-space-3);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--cab-space-1);
	}
	.count {
		font-family: var(--cab-font-mono);
	}
	.entry {
		margin-top: var(--cab-space-4);
		padding: var(--cab-space-3);
		background-color: var(--cab-graph);
	}
	.facets {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: var(--cab-space-1) var(--cab-space-3);
	}
	.facets dt {
		font-weight: 600;
	}
	.facets dd {
		margin: 0;
	}
</style>
