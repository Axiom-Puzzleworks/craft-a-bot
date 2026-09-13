<script lang="ts">
	import { resolve } from '$app/paths';
	import type { CoverageStatus, ExperimentResult } from '@craftabot/core';
	import { ASI_THREATS, CATALOGUE_MATURITIES, COVERAGE_STATUSES } from '@craftabot/core';
	import { GUARDRAIL_CATALOGUE } from '@craftabot/governance';
	import { coverageReport, coverageSummary } from '@craftabot/governance/reports';
	import CaseTable from '$lib/components/control-room/CaseTable.svelte';
	import Readout from '$lib/components/control-room/Readout.svelte';
	import Roundel from '$lib/components/control-room/Roundel.svelte';
	import { createRegistry } from '$lib/packs.js';
	import { appStorage } from '$lib/state/app-storage.svelte.js';

	/**
	 * **The Guardrail Catalogue** (WP98, `86-CATALOGUE.md` §7; `83-…` §6.4.3):
	 * every technique the industry ships or the research proposes, with what
	 * this product can honestly say about it — *shipped*, *connectable*,
	 * *bespoke*, *blueprint* or *not applicable* — the components that
	 * implement it, the stacks that use them, and the register's effect where
	 * an experiment measured such a stack. Filters by threat (ASI01–10),
	 * maturity and coverage; a row opens the Guard Rack for its components.
	 * Every entry is pending review until a person has read it.
	 */
	const registry = createRegistry();
	let experimentResults = $state.raw<ExperimentResult[]>([]);
	$effect(() => {
		void (async () => {
			const storage = await appStorage();
			experimentResults = await storage.listExperimentResults();
		})();
	});
	const rows = $derived(coverageReport(GUARDRAIL_CATALOGUE, registry, experimentResults));
	const summary = coverageSummary(GUARDRAIL_CATALOGUE);

	let threat = $state('');
	let maturity = $state('');
	let status = $state<CoverageStatus | ''>('');
	const shown = $derived(
		rows.filter(
			(row) =>
				(threat === '' || row.entry.threats.includes(threat)) &&
				(maturity === '' || row.entry.maturity === maturity) &&
				(status === '' || row.status === status)
		)
	);

	const columns = [
		{ id: 'entry', label: 'Entry', kind: 'text' as const },
		{ id: 'category', label: 'Category', kind: 'text' as const },
		{ id: 'points', label: 'Points', kind: 'text' as const },
		{ id: 'maturity', label: 'Maturity', kind: 'text' as const },
		{ id: 'threats', label: 'Threats', kind: 'text' as const },
		{ id: 'status', label: 'Coverage', kind: 'text' as const },
		{ id: 'implemented', label: 'Implemented by', kind: 'text' as const },
		{ id: 'effect', label: 'Measured effect', kind: 'text' as const },
		{ id: 'review', label: 'Review', kind: 'text' as const }
	];
	const signed = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(3)}`;
	const tableRows = $derived(
		shown.map((row) => ({
			id: row.entry.id,
			cells: {
				entry: row.entry.name,
				category: `${row.entry.category} · ${row.entry.subcategory}`,
				points: row.entry.points.length === 0 ? '—' : row.entry.points.join(', '),
				maturity: row.entry.maturity,
				threats: row.entry.threats.length === 0 ? '—' : row.entry.threats.join(', '),
				status: row.status,
				implemented:
					[...row.components, ...(row.entry.coverage.implementedBy ?? [])].join(', ') || '—',
				effect: row.headline
					? `${row.headline.metricId}: ${signed(row.headline.delta)} (${row.headline.stackId})`
					: '—',
				review: row.entry.review
			}
		}))
	);
	let openId = $state<string | undefined>(undefined);
	const open = $derived(rows.find((row) => row.entry.id === openId));
</script>

<svelte:head>
	<title>Guardrail Catalogue — Craft A Bot Workshop</title>
</svelte:head>

<main>
	<h1><Roundel icon="catalogue" size={28} /> Guardrail Catalogue</h1>
	<p class="lede" data-testid="catalogue-lede">
		Edition {summary.edition}: {summary.entries} techniques the industry ships or the research proposes,
		and what this product can honestly say about each. {summary.pending} of {summary.entries}
		entries are pending review — read against their sources by a person before the status is trusted.
	</p>

	<div class="readouts" data-testid="catalogue-readouts">
		<Readout label="Shipped" value={String(summary.byStatus.shipped)} />
		<Readout label="Connectable" value={String(summary.byStatus.connectable)} />
		<Readout label="Bespoke" value={String(summary.byStatus.bespoke)} />
		<Readout label="Blueprint" value={String(summary.byStatus.blueprint)} />
		<Readout label="Not applicable" value={String(summary.byStatus['not-applicable'])} />
	</div>

	<div class="filters" data-testid="catalogue-filters">
		<label class="field">
			<span>Threat</span>
			<select bind:value={threat} data-testid="catalogue-filter-threat">
				<option value="">Any</option>
				{#each ASI_THREATS as id (id)}
					<option value={id}>{id}</option>
				{/each}
			</select>
		</label>
		<label class="field">
			<span>Maturity</span>
			<select bind:value={maturity} data-testid="catalogue-filter-maturity">
				<option value="">Any</option>
				{#each CATALOGUE_MATURITIES as id (id)}
					<option value={id}>{id}</option>
				{/each}
			</select>
		</label>
		<label class="field">
			<span>Coverage</span>
			<select bind:value={status} data-testid="catalogue-filter-status">
				<option value="">Any</option>
				{#each COVERAGE_STATUSES as id (id)}
					<option value={id}>{id}</option>
				{/each}
			</select>
		</label>
		<span class="count" data-testid="catalogue-count">{shown.length} of {rows.length}</span>
	</div>

	<CaseTable {columns} rows={tableRows} onRow={(id) => (openId = id)} testId="catalogue-table" />

	{#if open}
		<section class="entry" aria-labelledby="entry-h" data-testid="catalogue-entry">
			<h2 id="entry-h">{open.entry.name} <code>{open.entry.id}</code></h2>
			<p>{open.entry.summary}</p>
			<p>
				<strong>{open.status}</strong> — {open.entry.coverage.note}{open.entry.coverage.since
					? ` (${open.entry.coverage.since})`
					: ''}
			</p>
			{#if open.components.length > 0}
				<p>
					Components: <span class="mono">{open.components.join(', ')}</span> —
					<a href={resolve('/workshop/studio')} data-testid="catalogue-open-guards">the Studio</a>.
				</p>
			{/if}
			{#if open.stacks.length > 0}
				<p>Stacks: <span class="mono">{open.stacks.join(', ')}</span></p>
			{/if}
			<p>Frameworks: {open.entry.frameworks.join(', ')}</p>
			<h3>Sources</h3>
			<ul>
				{#each open.entry.sources as source (source.title)}
					<li>
						{source.publisher}, <em>{source.title}</em> ({source.year}, {source.kind}){#if source.url}
							—
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- an external source -->
							<a href={source.url} rel="noopener noreferrer">{source.url}</a>{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<p class="foot" data-testid="catalogue-not-claimed">
		<strong>Not claimed.</strong> Blueprint only: {summary.blueprint.join('; ')}. Not applicable to
		a simulator: {summary.notApplicable.join('; ')}.
	</p>
</main>

<style>
	.lede {
		max-width: 70ch;
	}
	.readouts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-3);
		margin-bottom: var(--cab-space-3);
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
	.mono {
		font-family: var(--cab-font-mono);
	}
	.foot {
		margin-top: var(--cab-space-4);
		max-width: 80ch;
	}
</style>
