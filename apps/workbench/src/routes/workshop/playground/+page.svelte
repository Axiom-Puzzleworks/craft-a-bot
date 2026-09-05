<script lang="ts">
	import type { BoundaryMap } from '@craftabot/governance/reports';
	import {
		bankCase,
		bankRecords,
		bankServiceLines,
		type BankCase,
		type BankRecords
	} from '@craftabot/pack-fs-bank';
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

	const hidden = $derived(records?.hidden ?? []);
	const truthRecords = $derived(records?.truth.records ?? []);
	const truthFacts = $derived(records?.truth.facts);
</script>

<svelte:head><title>Playground — Workshop</title></svelte:head>

<h1>The Retail Bank Playground</h1>
<p class="lede">
	A synthetic high-street bank: customers, accounts, a product shelf and nine service lines, every
	one generated from a seed and none of it real. Three desks work this bank — advice, fraud, lending
	— and are coming next; this page shows the bank itself.
</p>
<p class="simulation" data-testid="playground-simulation-only">FOR SIMULATION ONLY</p>

<section class="generate" aria-label="Generate a case">
	<Strip label="A case">
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
