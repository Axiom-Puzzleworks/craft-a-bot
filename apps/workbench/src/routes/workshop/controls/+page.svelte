<script lang="ts">
	import { page } from '$app/state';
	import { afterNavigate, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		CONTROL_REF_KINDS,
		reviewsFromContent,
		type BenchmarkReport,
		type ExperimentResult,
		type RunSummary,
		type StoredCampaignReport
	} from '@craftabot/core';
	import { GUARDRAIL_CATALOGUE } from '@craftabot/governance';
	import {
		controlEffectiveness,
		controlInventory,
		controlInventorySummary,
		type ControlInventoryRow
	} from '@craftabot/governance/reports';
	import CaseTable from '$lib/components/control-room/CaseTable.svelte';
	import Matrix from '$lib/components/control-room/Matrix.svelte';
	import Readout from '$lib/components/control-room/Readout.svelte';
	import Roundel from '$lib/components/control-room/Roundel.svelte';
	import Strip from '$lib/components/control-room/Strip.svelte';
	import { installedPacks } from '$lib/packs.js';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import { contentStore } from '$lib/state/content.svelte.js';
	import {
		KIND_LABELS,
		inventoryRegistry,
		MATRIX_FACETS,
		SURFACE_LABELS,
		SURFACE_ROUTES,
		controlFilterFrom,
		controlFilterQuery,
		facetWords,
		filterControls,
		inventoryReportsOf,
		kindFacet,
		type ControlFilter
	} from '$lib/workshop/controls.js';
	import { readingSources } from '$lib/workshop/readings.js';
	import { shippedCampaigns } from '$lib/workshop/shipped-campaigns.js';

	/**
	 * **The Control Inventory** (WP134, `110-CONTROL-SUITE-PLAN.md` §4.3): every
	 * control in the product, one row each — the components, cards, stacks,
	 * readers, evaluators, mechanisms, gate kinds, knobs, ceilings and models
	 * — with eight facets folded from where each is recorded: whether the
	 * catalogue names it, where it is fitted, whether it fired in the stored
	 * runs, its benchmark, the register's effect over the rows that cite it,
	 * whether anyone has read it, and where it is turned. The catalogue is the
	 * page of techniques; this is the page of instances. Every figure is the
	 * fold's (`controlInventory`); the filter is in the URL.
	 */
	const registry = inventoryRegistry();
	let results = $state.raw<ExperimentResult[]>([]);
	let benchmarks = $state.raw<BenchmarkReport[]>([]);
	let summaries = $state.raw<RunSummary[]>([]);
	let reports = $state.raw<StoredCampaignReport[]>([]);
	let loaded = $state(false);
	$effect(() => {
		void (async () => {
			const storage = await appStorage();
			[results, benchmarks, summaries, reports] = await Promise.all([
				storage.listExperimentResults(),
				storage.listBenchmarkReports(),
				storage.listRunSummaries(),
				storage.listCampaignReports()
			]);
			loaded = true;
		})();
	});
	const sources = readingSources(installedPacks);
	const campaigns = shippedCampaigns().map((shipped) => ({
		id: shipped.id,
		campaign: shipped.campaign()
	}));
	const reviews = $derived(
		reviewsFromContent([...contentStore.of('review'), ...contentStore.of('control-review')])
	);
	const rows = $derived(
		controlInventory({
			registry,
			catalogue: GUARDRAIL_CATALOGUE,
			campaigns,
			summaries,
			campaignReports: inventoryReportsOf(reports),
			register: controlEffectiveness(results, registry.listControlMaps()),
			benchmarks,
			reviews,
			errorModels: sources.errorModels ?? [],
			reviewerModels: sources.reviewerModels ?? []
		})
	);
	const summary = $derived(controlInventorySummary(rows));

	let filter = $state<ControlFilter>(controlFilterFrom(page.url.searchParams));
	afterNavigate(() => {
		const fromUrl = controlFilterFrom(page.url.searchParams);
		if (controlFilterQuery(fromUrl) !== controlFilterQuery(filter)) filter = fromUrl;
	});
	function updateFilter(next: ControlFilter): void {
		filter = next;
		const wanted = controlFilterQuery(next);
		if (wanted === page.url.search) return;
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() builds the base path; the filter is a query the typed surface cannot carry.
		replaceState(`${resolve('/workshop/controls')}${wanted}`, {});
	}
	const shown = $derived(filterControls(rows, filter));
	const kinds = $derived(CONTROL_REF_KINDS.filter((kind) => rows.some((row) => row.kind === kind)));

	const columns = [
		{ id: 'control', label: 'Control', kind: 'text' as const },
		{ id: 'kind', label: 'Kind', kind: 'text' as const },
		{ id: 'pack', label: 'Pack', kind: 'text' as const },
		{ id: 'coverage', label: 'Catalogue', kind: 'text' as const },
		{ id: 'fitted', label: 'Fitted', kind: 'text' as const },
		{ id: 'exercised', label: 'Exercised', kind: 'text' as const },
		{ id: 'measured', label: 'Measured', kind: 'text' as const },
		{ id: 'effect', label: 'Effect', kind: 'text' as const },
		{ id: 'reviewed', label: 'Read', kind: 'text' as const },
		{ id: 'configurable', label: 'Turned in', kind: 'text' as const }
	];
	const tableRows = $derived(
		shown.map((row) => ({
			id: row.ref,
			cells: {
				control: row.name,
				kind: KIND_LABELS[row.kind],
				pack: row.pack,
				...facetWords(row)
			}
		}))
	);

	let openRef = $state<string | undefined>(undefined);
	const open = $derived<ControlInventoryRow | undefined>(rows.find((row) => row.ref === openRef));
	const openWords = $derived(open ? facetWords(open) : undefined);
	const routeOf = (path: string) => resolve(path as '/workshop');
	const surfaceLinks = $derived(
		(open?.configurable.surfaces ?? []).map((surface) => ({
			surface,
			label: SURFACE_LABELS[surface],
			route: SURFACE_ROUTES[surface]
		}))
	);
</script>

<svelte:head>
	<title>Control Inventory — Craft A Bot Workshop</title>
</svelte:head>

<main>
	<h1><Roundel icon="inventory" size={28} /> Control Inventory</h1>
	<p class="lede" data-testid="controls-lede">
		Every control in this toolkit, one row each, with what can be said of it — whether the
		<a href={resolve('/workshop/catalogue')}>Guardrail Catalogue</a> names it, where it is fitted, whether
		it fired in the runs stored here, its benchmark, the register's effect over the control rows that
		cite it, whether a person has read it, and where it is turned. Nothing here is typed in: each facet
		is folded from where it is recorded.
	</p>

	<section aria-label="At a glance">
		<Strip label="Controls" icon="inventory">
			<Readout label="Controls" value={summary.rows} testId="controls-count" />
			<Readout label="Uncatalogued" value={summary.uncatalogued} testId="controls-uncatalogued" />
			<Readout label="Unfitted" value={summary.unfitted} testId="controls-unfitted" />
			<Readout label="Fired" value={summary.fired} testId="controls-fired" />
			<Readout label="Measured" value={summary.measured} testId="controls-measured" />
			<Readout label="Effect evidenced" value={summary.evidenced} testId="controls-evidenced" />
			<Readout label="Unread" value={summary.unread} testId="controls-unread" />
		</Strip>
		{#if loaded && summaries.length === 0 && reports.length === 0}
			<p class="note" data-testid="controls-no-runs">
				No runs or campaign reports are stored in this browser, so nothing reads <em>fired</em> yet. Run
				a campaign and come back.
			</p>
		{/if}
	</section>

	<section aria-labelledby="matrix-h">
		<h2 id="matrix-h">By kind</h2>
		<Matrix
			corner="Kind"
			rows={kinds.map((kind) => ({ id: kind, label: KIND_LABELS[kind] }))}
			cols={MATRIX_FACETS.map((facet) => ({ id: facet.id, label: facet.label }))}
			cell={(kind, facet) => {
				const counted = kindFacet(
					rows,
					kind as (typeof kinds)[number],
					facet as (typeof MATRIX_FACETS)[number]['id']
				);
				return counted.of === 0
					? undefined
					: { value: counted.good / counted.of, label: `${counted.good} of ${counted.of}` };
			}}
			rowSummary={(kind) => String(rows.filter((row) => row.kind === kind).length)}
			onCell={(kind) => updateFilter({ ...filter, kind: kind as (typeof kinds)[number] })}
			testId="controls-matrix"
		/>
	</section>

	<section aria-labelledby="list-h">
		<h2 id="list-h">Every control</h2>
		<div class="filters" data-testid="controls-filters">
			<label class="field">
				<span>Kind</span>
				<select
					value={filter.kind ?? ''}
					onchange={(event) => {
						const kind = event.currentTarget.value;
						const { kind: _kind, ...rest } = filter;
						void _kind;
						updateFilter(kind === '' ? rest : { ...rest, kind: kind as (typeof kinds)[number] });
					}}
					data-testid="controls-filter-kind"
				>
					<option value="">Any</option>
					{#each kinds as kind (kind)}
						<option value={kind}>{KIND_LABELS[kind]}</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span>Catalogue</span>
				<select
					value={filter.coverage ?? ''}
					onchange={(event) => {
						const coverage = event.currentTarget.value;
						const { coverage: _coverage, ...rest } = filter;
						void _coverage;
						updateFilter(
							coverage === ''
								? rest
								: { ...rest, coverage: coverage as ControlInventoryRow['coverage'] }
						);
					}}
					data-testid="controls-filter-coverage"
				>
					<option value="">Any</option>
					{#each ['shipped', 'connectable', 'bespoke', 'blueprint', 'not-applicable', 'uncatalogued'] as status (status)}
						<option value={status}>{status}</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span>Fitted</span>
				<select
					value={filter.fitted ?? ''}
					onchange={(event) => {
						const fitted = event.currentTarget.value;
						const { fitted: _fitted, ...rest } = filter;
						void _fitted;
						updateFilter(fitted === 'fitted' || fitted === 'unfitted' ? { ...rest, fitted } : rest);
					}}
					data-testid="controls-filter-fitted"
				>
					<option value="">Any</option>
					<option value="fitted">fitted</option>
					<option value="unfitted">unfitted</option>
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
						updateFilter(q === '' ? rest : { ...rest, q });
					}}
					data-testid="controls-filter-q"
				/>
			</label>
			{#if filter.entry}
				<span class="entry-filter" data-testid="controls-filter-entry">
					the controls the catalogue entry <code>{filter.entry}</code> names
					<button
						type="button"
						onclick={() => {
							const { entry: _entry, ...rest } = filter;
							void _entry;
							updateFilter(rest);
						}}
						data-testid="controls-filter-entry-clear">Show every control</button
					>
				</span>
			{/if}
			<span class="count" data-testid="controls-shown">{shown.length} of {rows.length}</span>
		</div>

		<CaseTable {columns} rows={tableRows} onRow={(id) => (openRef = id)} testId="controls-table" />
	</section>

	{#if open && openWords}
		<section class="entry" aria-labelledby="control-h" data-testid="controls-entry">
			<h2 id="control-h">{open.name} <code>{open.ref}</code></h2>
			<p>{open.summary}</p>
			<dl class="facets">
				<dt>Catalogue</dt>
				<dd data-testid="controls-entry-coverage">
					{#if open.entries.length === 0}
						uncatalogued — no entry names it
					{:else}
						{#each open.entries as entry, index (entry.id)}
							{index > 0 ? '; ' : ''}{entry.name} (<strong>{entry.status}</strong>{entry.via
								? `, through ${entry.via}`
								: ''})
						{/each}
						— <a href={resolve('/workshop/catalogue')}>the catalogue</a>
					{/if}
				</dd>
				<dt>Control rows</dt>
				<dd>
					{open.rows.length === 0
						? 'none cites it'
						: open.rows.map((link) => `${link.title} (${link.mapId}#${link.ref})`).join('; ')}
				</dd>
				<dt>Fitted</dt>
				<dd data-testid="controls-entry-fitted">
					{openWords.fitted}{open.fitted.where.length > 0
						? ` — ${open.fitted.where.join('; ')}`
						: ''}{open.fitted.note ? ` (${open.fitted.note})` : ''}
				</dd>
				<dt>Exercised</dt>
				<dd>{openWords.exercised}</dd>
				<dt>Measured</dt>
				<dd>
					{openWords.measured}{#if open.measured.state !== 'not-applicable'}
						— <a href={resolve('/workshop/benchmarks')}>Benchmarks</a>{/if}
				</dd>
				<dt>Effect</dt>
				<dd>
					{openWords.effect}{open.effect.controlIds.length > 0
						? ` — ${open.effect.controlIds.join(', ')}`
						: ''}{#if open.effect.state !== 'not-applicable'}
						— <a href={resolve('/workshop/assurance')}>the register</a>{/if}
				</dd>
				<dt>Read</dt>
				<dd>
					{openWords.reviewed}{#if open.reviewed.state !== 'not-applicable'}
						— <a href={resolve('/workshop/readings')} data-testid="controls-entry-read-in"
							>Readings</a
						>{/if}
				</dd>
				<dt>Turned in</dt>
				<dd data-testid="controls-entry-configure">
					{#if open.configurable.state === 'fixed'}
						fixed — it is always there
					{:else}
						{#each surfaceLinks as link, index (link.surface)}
							{index > 0 ? ', ' : ''}{#if link.route}<a href={routeOf(link.route)}>{link.label}</a
								>{:else}{link.label}{/if}
						{/each}
						{open.configurable.setting ? ` — ${open.configurable.setting}` : ''}
					{/if}
				</dd>
			</dl>
		</section>
	{/if}
</main>

<style>
	.lede {
		max-width: 75ch;
	}
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
