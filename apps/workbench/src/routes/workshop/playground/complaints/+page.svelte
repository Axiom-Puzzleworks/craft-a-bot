<script lang="ts">
	import { resolve } from '$app/paths';
	import type { DeskWorldState } from '@craftabot/core';
	import { seededRandom, type DeskTruth } from '@craftabot/desk';
	import {
		complaintsDesk,
		complaintsEvaluators,
		complaintsScenarios,
		REDRESS_NEEDS_APPROVAL,
		unmark,
		type ComplaintsDeskState
	} from '@craftabot/pack-fs-advice';
	import CaseFile from '$lib/components/control-room/CaseFile.svelte';
	import CaseTable from '$lib/components/control-room/CaseTable.svelte';
	import Readout from '$lib/components/control-room/Readout.svelte';
	import Strip from '$lib/components/control-room/Strip.svelte';

	/**
	 * **The complaints desk's page** (WP72, `61-LAST-DECKS.md` §5): the desk,
	 * read. A layout and a seed make a case on `CaseFile` — the complaint,
	 * the transaction it concerns, the customer's bands, and under the flap
	 * the finding and the fair redress range; the deck's seven scenarios; the
	 * three evaluators and the one card. Nothing runs here.
	 */
	let layoutId = $state(complaintsDesk.layouts[0]?.id ?? 'charges-error');
	let seed = $state(7);
	let snapshot = $state<ComplaintsDeskState | undefined>(undefined);
	let truth = $state<DeskTruth | undefined>(undefined);

	function generate(): void {
		const world = complaintsDesk.create(layoutId, { random: seededRandom(seed) });
		snapshot = world.snapshot() as unknown as ComplaintsDeskState;
		truth = world.truth?.() as DeskTruth | undefined;
	}

	const deckColumns = [
		{ id: 'title', label: 'Scenario', kind: 'text' as const },
		{ id: 'card', label: 'Card', kind: 'text' as const },
		{ id: 'tags', label: 'Tags', kind: 'text' as const }
	];
	const deckRows = complaintsScenarios.map((scenario) => ({
		id: scenario.id,
		cells: {
			title: scenario.title,
			card: scenario.goalCardId.replace('fs-advice/', ''),
			tags: scenario.tags.join(' ')
		}
	}));
	const records = $derived((snapshot as DeskWorldState | undefined)?.records ?? []);
	const facts = $derived(truth?.facts);
</script>

<svelte:head><title>The Complaints Desk — Workshop</title></svelte:head>

<p class="crumb"><a href={resolve('/workshop/playground')}>← The Playground</a></p>
<h1>The Complaints Desk</h1>
<p class="lede">
	The bank’s complaints handler: acknowledge promptly, find what the file supports, answer with the
	reason, redress within the rules — once, and never on a complaint the file does not support. Five
	cards, seven scenarios, one policy card, three evaluators, one campaign — none of it real.
</p>
<p class="simulation" data-testid="complaints-simulation-only">FOR SIMULATION ONLY</p>

<section aria-label="Generate a case">
	<Strip label="A case" icon="desk">
		<label class="pick">
			Layout
			<select bind:value={layoutId} data-testid="complaints-layout">
				{#each complaintsDesk.layouts as layout (layout.id)}
					<option value={layout.id}>{layout.name}</option>
				{/each}
			</select>
		</label>
		<label class="pick">
			Seed
			<input type="number" min="1" step="1" bind:value={seed} data-testid="complaints-seed" />
		</label>
		<button type="button" onclick={generate} data-testid="complaints-generate">Generate</button>
		{#if snapshot && facts}
			<Readout
				label="Acknowledge by"
				value={`turn ${unmark(String(facts['ack_by_tick']))}`}
				testId="complaints-ack-by"
			/>
			<Readout
				label="Fair redress"
				value={`£${unmark(String(facts['redress_min']))}–£${unmark(String(facts['redress_max']))}`}
				testId="complaints-bounds"
			/>
		{/if}
	</Strip>
	{#if snapshot}
		<div class="file" data-testid="complaints-case">
			<CaseFile {records} truth={truth?.records} {facts} testId="complaints-case-file" />
		</div>
	{/if}
</section>

<section aria-label="The deck">
	<h2>The complaints-and-redress deck</h2>
	<p>
		<a
			class="run-campaign"
			href={`${resolve('/workshop/campaigns')}?baseline=fs-complaints-baseline`}
			data-testid="complaints-run-campaign">Run this desk’s campaign →</a
		>
	</p>
	<CaseTable columns={deckColumns} rows={deckRows} testId="complaints-deck" />
</section>

<section aria-label="The card and the evaluators">
	<h2>The card, and what judges a run</h2>
	<ul class="list" data-testid="complaints-cards">
		<li><strong>{REDRESS_NEEDS_APPROVAL.title}</strong> — {REDRESS_NEEDS_APPROVAL.description}</li>
	</ul>
	<ul class="list" data-testid="complaints-evaluators">
		{#each complaintsEvaluators as evaluator (evaluator.id)}
			<li>
				<strong>{evaluator.name}</strong> <span class="mono">{evaluator.id}</span> — {evaluator.description}
			</li>
		{/each}
	</ul>
</section>

<style>
	h1 {
		margin: 0;
		font-size: var(--cab-text-xl);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	h2 {
		margin: 0 0 var(--cab-space-2);
		font-size: var(--cab-text-sm);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--cab-ink-muted);
	}

	.crumb {
		margin: 0 0 var(--cab-space-2);
		font-size: var(--cab-text-sm);
	}

	.lede {
		max-width: 70ch;
	}

	.simulation {
		font-size: var(--cab-text-xs);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--cab-ink-muted);
	}

	section {
		margin-top: var(--cab-space-4);
	}

	.pick {
		display: grid;
		gap: var(--cab-space-1);
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--cab-ink-muted);
	}

	.file {
		margin-top: var(--cab-space-3);
	}

	.list {
		margin: 0;
		padding-left: var(--cab-space-4);
		font-size: var(--cab-text-sm);
	}

	.list li + li {
		margin-top: var(--cab-space-1);
	}

	.mono {
		font-family: var(--cab-font-mono);
		font-size: var(--cab-text-xs);
	}
</style>
