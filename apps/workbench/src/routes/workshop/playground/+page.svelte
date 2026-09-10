<script lang="ts">
	import { resolve } from '$app/paths';
	import type { BoundaryMap } from '@craftabot/governance/reports';
	import {
		CALIBRATION,
		bankCase,
		bankRecords,
		bankServiceLines,
		marginalOf,
		population,
		type BankCase,
		type BankRecords,
		type Population,
		type PopulationCustomer
	} from '@craftabot/pack-fs-bank';
	import type { CalibrationRow } from '@craftabot/core';
	import CaseTable from '$lib/components/control-room/CaseTable.svelte';
	import Boundary from '$lib/components/control-room/Boundary.svelte';
	import CaseFile from '$lib/components/control-room/CaseFile.svelte';
	import Readout from '$lib/components/control-room/Readout.svelte';
	import Strip from '$lib/components/control-room/Strip.svelte';

	/**
	 * **The Playground** (WP59 stage C, `48-FS-BANK.md` §4.8): the synthetic
	 * bank, read. A seed makes a case — a customer with everything that
	 * hangs off them — shown on `CaseFile` as a desk would show it: what is
	 * on the desk, what a look-up would earn, and the truth nobody at a desk
	 * sees, under the flap. The nine lines sit outside an empty boundary on
	 * a hand-built map (the map's reserved `service-line` kind, first used).
	 * Nothing here runs: the desks (WP60–WP63) are where a bot works this
	 * bank; this is where a reader looks at it.
	 */
	let seed = $state(1);
	let bank = $state<BankCase | undefined>(undefined);
	let records = $state<BankRecords | undefined>(undefined);

	function generate(): void {
		const next = bankCase(seed);
		bank = next;
		records = bankRecords(next);
	}

	const map: BoundaryMap = {
		schemaVersion: 1,
		agent: { id: 'playground', name: 'A desk (to come)', bricks: [] },
		boundary: {
			safetyStack: [],
			guardrailIds: [],
			egress: { mode: 'none', hosts: [] },
			approval: { mode: 'off', riskTiers: [] }
		},
		inside: {
			world: { id: 'fs-bank', name: 'The Bank (synthetic)', view: 'desk' },
			counterparts: []
		},
		outside: bankServiceLines.map((line) => ({
			kind: 'service-line' as const,
			id: line.id,
			name: line.name,
			hosts: [],
			sends: []
		})),
		human: { approvals: 0 }
	};

	/**
	 * **Where this bank's shape comes from, and the bank at scale** (WP74
	 * stage C, `66-CALIBRATION.md` §4.4): the calibration table the
	 * population draws from — every row with its publication, edition and
	 * retrieval date, or its stated assumption, and whether a reviewer has
	 * read it — and a population made here from a seed and a size, with its
	 * digest and its marginals beside the rows' targets. Nothing is stored:
	 * the population is regenerated from its seed every time.
	 */
	const sourceOf = (row: CalibrationRow): string =>
		row.source.kind === 'publication'
			? `${row.source.publisher} — ${row.source.title} (${row.source.edition}); ${row.source.table}`
			: `stated assumption — ${row.note ?? ''}`;
	const calibrationColumns = [
		{ id: 'row', label: 'Row', kind: 'text' as const },
		{ id: 'kind', label: 'Kind', kind: 'text' as const },
		{ id: 'distribution', label: 'Distribution', kind: 'text' as const },
		{ id: 'source', label: 'Source', kind: 'text' as const },
		{ id: 'retrieved', label: 'Retrieved', kind: 'text' as const },
		{ id: 'review', label: 'Reviewed', kind: 'status' as const }
	];
	const calibrationRows = CALIBRATION.rows.map((row) => ({
		id: row.id,
		cells: {
			row: `${row.title} (${row.id})`,
			kind: row.kind,
			distribution: Object.entries(row.distribution)
				.map(([category, weight]) => `${category} ${weight}`)
				.join(' · '),
			source: sourceOf(row),
			retrieved: row.source.retrieved,
			review: row.review === 'pending' ? ('inconclusive' as const) : ('pass' as const)
		}
	}));
	const pendingRows = $derived(CALIBRATION.rows.filter((row) => row.review === 'pending').length);

	let popSeed = $state(1);
	let popSize = $state(2000);
	// Raw: thousands of customers that never change once made.
	let pop = $state.raw<Population | undefined>(undefined);
	let popMs = $state(0);
	function generatePopulation(): void {
		const started = performance.now();
		pop = population(popSeed, { size: Math.max(1, Math.floor(popSize)) });
		popMs = Math.round(performance.now() - started);
	}
	const over65 = (entry: PopulationCustomer) =>
		entry.customer.cohort.ageBand === '65-74' || entry.customer.cohort.ageBand === '75+';
	/** The rows the bank page reads off a population, with how each is read. */
	const MARGINALS: Array<{
		rowId: string;
		draw: (entry: PopulationCustomer) => string | undefined;
	}> = [
		{ rowId: 'age-band', draw: (entry) => entry.customer.cohort.ageBand },
		{
			rowId: 'employment-25-64',
			draw: (entry) =>
				over65(entry) || entry.customer.cohort.ageBand === '18-24'
					? undefined
					: entry.customer.employment
		},
		{ rowId: 'income-band', draw: (entry) => entry.customer.cohort.incomeBand },
		{ rowId: 'literacy-band', draw: (entry) => entry.customer.cohort.literacyBand },
		{ rowId: 'preferred-channel', draw: (entry) => entry.customer.consent.preferredChannel }
	];
	const marginalColumns = [
		{ id: 'row', label: 'Row', kind: 'text' as const },
		{ id: 'category', label: 'Category', kind: 'text' as const },
		{ id: 'target', label: 'Target', kind: 'number' as const },
		{ id: 'observed', label: 'Observed', kind: 'number' as const },
		{ id: 'within', label: 'Within tolerance', kind: 'status' as const }
	];
	const marginalRows = $derived.by(() => {
		if (!pop) return [];
		const out: Array<{ id: string; cells: Record<string, string | number | 'pass' | 'fail'> }> = [];
		for (const { rowId, draw } of MARGINALS) {
			const row = CALIBRATION.rows.find((candidate) => candidate.id === rowId);
			if (!row) continue;
			const observed = marginalOf(pop, rowId, draw);
			const total = Object.values(row.distribution).reduce((sum, w) => sum + w, 0);
			const counted = pop.customers.filter((entry) => draw(entry) !== undefined).length;
			for (const [category, weight] of Object.entries(row.distribution)) {
				const target = weight / total;
				// The row's tolerance plus the sampling margin at this size — a 2,000-customer population is allowed its noise.
				const margin =
					row.tolerance + 1.96 * Math.sqrt((target * (1 - target)) / Math.max(1, counted));
				out.push({
					id: `${rowId}:${category}`,
					cells: {
						row: rowId,
						category,
						target: Math.round(target * 1000) / 10,
						observed: Math.round((observed[category] ?? 0) * 1000) / 10,
						within: Math.abs((observed[category] ?? 0) - target) <= margin ? 'pass' : 'fail'
					}
				});
			}
		}
		return out;
	});

	const hidden = $derived(records?.hidden ?? []);
	const truthRecords = $derived(records?.truth.records ?? []);
	const truthFacts = $derived(records?.truth.facts);
</script>

<svelte:head><title>Playground — Workshop</title></svelte:head>

<h1>The Retail Bank Playground</h1>
<p class="lede">
	A synthetic high-street bank: customers, accounts, a product shelf and nine service lines, every
	one generated from a seed and none of it real. Three desks work this bank — <a
		href={resolve('/workshop/playground/advice')}
		data-testid="playground-advice-link">the Advice Desk</a
	>
	and
	<a href={resolve('/workshop/playground/fraud')} data-testid="playground-fraud-link"
		>the Fraud Desk</a
	>
	and
	<a href={resolve('/workshop/playground/lending')} data-testid="playground-lending-link"
		>the Lending Desk</a
	>
	— and
	<a href={resolve('/workshop/playground/complaints')} data-testid="playground-complaints-link"
		>the Complaints Desk</a
	>
	works its complaints. This page shows the bank itself.
</p>
<p class="simulation" data-testid="playground-simulation-only">FOR SIMULATION ONLY</p>

<section class="generate" aria-label="Generate a case">
	<Strip label="A case" icon="desk">
		<label class="seed">
			Seed
			<input type="number" min="1" step="1" bind:value={seed} data-testid="playground-seed" />
		</label>
		<button type="button" onclick={generate} data-testid="playground-generate">Generate</button>
		{#if bank}
			<Readout label="Customer" value={bank.customer.name.full} testId="playground-customer" />
			<Readout label="Accounts" value={bank.accounts.length} testId="playground-accounts" />
			<Readout label="Transactions" value={bank.transactions.length} />
			<Readout label="Complaints" value={bank.complaints.length} />
		{/if}
	</Strip>
</section>

{#if records}
	<div class="panes">
		<section aria-label="On the desk">
			<h2>On the desk</h2>
			<CaseFile records={records.revealed} testId="playground-revealed" />
		</section>
		<section aria-label="On file">
			<h2>On file — what a look-up would earn</h2>
			<CaseFile
				records={hidden}
				truth={truthRecords}
				facts={truthFacts}
				testId="playground-hidden"
			/>
		</section>
	</div>
{/if}

<section class="calibration" aria-label="Where this bank's shape comes from">
	<Strip label="Where this bank's shape comes from" icon="cohort">
		<p class="hint">
			The distributions the population draws from, each set to a published UK aggregate and cited —
			publisher, title, edition, table, the date it was read — or stated as an assumption that says
			why. {pendingRows} of {CALIBRATION.rows.length} rows are awaiting a reviewer's reading against their
			source. The desks' designed cases draw from the WP59 weights instead.
		</p>
		<CaseTable
			columns={calibrationColumns}
			rows={calibrationRows}
			testId="playground-calibration"
		/>
	</Strip>
</section>

<section class="population" aria-label="The bank at scale">
	<Strip label="The bank at scale" icon="cohort">
		<label class="seed">
			Seed
			<input
				type="number"
				min="1"
				step="1"
				bind:value={popSeed}
				data-testid="playground-population-seed"
			/>
		</label>
		<label class="seed">
			Customers
			<input
				type="number"
				min="100"
				max="50000"
				step="100"
				bind:value={popSize}
				data-testid="playground-population-size"
			/>
		</label>
		<button type="button" onclick={generatePopulation} data-testid="playground-population-generate"
			>Generate the population</button
		>
		{#if pop}
			<Readout
				label="Digest"
				value={pop.digest.slice(0, 12)}
				testId="playground-population-digest"
			/>
			<Readout label="Customers" value={pop.customers.length} />
			<Readout label="Made in" value={`${popMs} ms`} />
		{/if}
	</Strip>
	{#if pop}
		<p class="hint">
			A population is never stored: this one is customer 0 to {pop.customers.length - 1} of the seed's
			population at any size, regenerated from the seed in the time shown; its digest is over the options,
			the table's rows and a canonical sample. The marginals below sit beside the rows' targets, within
			the row's tolerance plus the sampling margin at this size.
		</p>
		<CaseTable columns={marginalColumns} rows={marginalRows} testId="playground-marginals" />
	{/if}
</section>

<section class="lines" aria-label="The service lines">
	<h2>The nine lines</h2>
	<p>
		What a desk's Connector brick can reach: each answers from the bank's own state, declares a tier
		on every operation, and is recorded on the trace as any tool is.
	</p>
	<div data-testid="playground-boundary">
		<Boundary {map} testId="playground-map" />
	</div>
	<ul class="line-list">
		{#each bankServiceLines as line (line.id)}
			<li data-testid="playground-line-{line.id.replace('/', '-')}">
				<strong>{line.name}</strong> <code>{line.id}</code> — {line.description}
				<span class="ops">
					{#each line.operations as op (op.id)}
						<span class="op" data-tier={op.riskTier}>{op.name}</span>
					{/each}
				</span>
			</li>
		{/each}
	</ul>
</section>

<style>
	h1 {
		margin: 0 0 var(--cab-space-2);
	}
	.calibration,
	.population {
		margin: var(--cab-space-4) 0;
	}
	.hint {
		font-size: var(--cab-text-sm);
		margin: var(--cab-space-2) 0;
	}

	.lede {
		max-width: 70ch;
		color: var(--cab-ink-muted);
	}

	.simulation {
		display: inline-block;
		margin: 0 0 var(--cab-space-3);
		padding: var(--cab-space-1) var(--cab-space-2);
		font-size: var(--cab-text-xs);
		font-weight: 700;
		letter-spacing: 0.08em;
		border: 2px solid var(--cab-ink);
		border-radius: var(--cab-radius-pill);
	}

	.seed {
		display: inline-flex;
		align-items: center;
		gap: var(--cab-space-2);
		font-size: var(--cab-text-sm);
	}

	.seed input {
		width: 6rem;
	}

	.panes {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: var(--cab-space-3);
		margin: var(--cab-space-3) 0;
	}

	@media (max-width: 900px) {
		.panes {
			grid-template-columns: 1fr;
		}
	}

	.line-list {
		margin: var(--cab-space-3) 0 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: var(--cab-space-2);
	}

	.line-list li {
		padding: var(--cab-space-2);
		background: var(--cab-cream);
		border: var(--cab-border-part) solid var(--cab-ink);
		border-radius: var(--cab-radius-part);
	}

	.ops {
		display: block;
		margin-top: var(--cab-space-1);
	}

	.op {
		display: inline-block;
		margin: 0 var(--cab-space-1) 0 0;
		padding: 0 var(--cab-space-1);
		font-size: var(--cab-text-xs);
		border: 1px solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-pill);
	}

	.op[data-tier='irreversible'] {
		border-color: var(--cab-fail);
		color: var(--cab-fail);
	}

	.op[data-tier='reversible'] {
		border-color: var(--cab-inconclusive);
		color: var(--cab-inconclusive);
	}
</style>
