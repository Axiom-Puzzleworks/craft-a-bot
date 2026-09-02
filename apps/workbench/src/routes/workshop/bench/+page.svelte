<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { RunRecord } from '@craftabot/core';
	import { evaluateAssertion, type AssertionResult } from '@craftabot/evals';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import { createRegistry } from '$lib/packs.js';
	import { testBenchCards } from '$lib/workshop/assertion-cards.js';
	import { assertionCardSchema, contentRecordFor } from '@craftabot/core';
	import { contentStore } from '$lib/state/content.svelte.js';

	// Rebuilt whenever the content store changes, so a saved card is on the bench at once (WP46).
	const registry = $derived.by(() => {
		void contentStore.records;
		return createRegistry();
	});
	let cardText = $state('');
	let cardProblem = $state('');

	async function saveCard(): Promise<void> {
		cardProblem = '';
		let raw: unknown;
		try {
			raw = JSON.parse(cardText);
		} catch {
			cardProblem = 'Not JSON.';
			return;
		}
		const parsed = assertionCardSchema.safeParse({
			id: 'local/testbench/pending',
			...(raw as object)
		});
		if (!parsed.success) {
			cardProblem = `Not an assertion card: ${parsed.error.issues[0]?.message ?? 'invalid'}`;
			return;
		}
		await contentStore.save(
			contentRecordFor('assertion-card', parsed.data, { savedAt: new Date().toISOString() })
		);
		cardText = '';
		if (selectedId) await loadSelected(selectedId);
	}

	/**
	 * **The Test Bench** (`14-…` §5.7, WP27): "Check your robot's homework."
	 *
	 * A bench accessory, not a chassis brick — nothing here fits onto a bot, so
	 * there is no tray entry, no socket, no core brick-kind registration
	 * (`14-…` §5.7's own row says so). It runs a fixed set of assertion cards
	 * (`$lib/workshop/assertion-cards.ts`) against one stored run's trace and
	 * shows which ones the run actually satisfied — "did this happen" rather
	 * than "would this be allowed", the after-the-fact half of what a policy
	 * card checks mid-run (`17-…` §4.5).
	 *
	 * Picking a run copies the Compare page's pattern: a `?run=` query param
	 * pre-selects one, and a dropdown lets a visitor switch without a trip back
	 * to the Runs table — this screen has no table of its own to check boxes
	 * in, unlike Compare's pair-picker.
	 */

	let runs = $state<RunRecord[]>([]);
	let selectedId = $state('');
	let run = $state<RunRecord | undefined>(undefined);
	let results = $state<AssertionResult[]>([]);
	let loaded = $state(false);

	const queryRunId = $derived(page.url.searchParams.get('run') ?? '');

	$effect(() => {
		void loadRuns();
	});

	$effect(() => {
		if (queryRunId) selectedId = queryRunId;
	});

	$effect(() => {
		void loadSelected(selectedId);
	});

	async function loadRuns(): Promise<void> {
		const storage = await appStorage();
		runs = await storage.listRuns();
		loaded = true;
	}

	async function loadSelected(id: string): Promise<void> {
		if (!id) {
			run = undefined;
			results = [];
			return;
		}
		const storage = await appStorage();
		const record = await storage.getRun(id);
		if (!record) {
			run = undefined;
			results = [];
			return;
		}
		const events = (await storage.getEvents(id)).map((row) => row.event);
		run = record;
		results = testBenchCards(registry).map((card) => evaluateAssertion(card, events, record));
	}

	const tokens = (record: RunRecord) => record.usage.inputTokens + record.usage.outputTokens;
	const when = (iso: string) => new Date(iso).toLocaleString();
</script>

<svelte:head><title>Test Bench — Workshop</title></svelte:head>

<main data-testid="bench-page">
	<header class="top">
		<h1>Test Bench</h1>
		<label class="picker">
			Run
			<select
				data-testid="bench-run-picker"
				value={selectedId}
				onchange={(e) => (selectedId = e.currentTarget.value)}
			>
				<option value="">Choose a run…</option>
				{#each runs as candidate (candidate.id)}
					<option value={candidate.id}
						>{candidate.agentName} — {candidate.goalCardId} — {when(candidate.startedAt)}</option
					>
				{/each}
			</select>
		</label>
	</header>

	<section class="author" aria-label="Your cards">
		<h2>Your cards</h2>
		<p class="hint">
			Paste an assertion card as JSON — title, description, predicate; the id is minted from the
			title.
		</p>
		<textarea
			rows="4"
			bind:value={cardText}
			data-testid="assertion-card-text"
			aria-label="Assertion card JSON"></textarea>
		<button
			type="button"
			disabled={cardText.trim() === ''}
			data-testid="assertion-card-save"
			onclick={saveCard}>Save card</button
		>
		{#if cardProblem}<p class="status" data-testid="assertion-card-problem">{cardProblem}</p>{/if}
		{#if contentStore.of('assertion-card').length > 0}
			<ul data-testid="local-assertion-cards">
				{#each contentStore.of('assertion-card') as entry (entry.id)}
					<li data-testid="local-assertion-{entry.id}">
						{entry.title} <span class="hint">{entry.id}</span>
						<button type="button" onclick={() => contentStore.remove(entry.id)}>Delete</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if !loaded}
		<p class="status">Reading the run store…</p>
	{:else if runs.length === 0}
		<p class="status" data-testid="bench-empty">
			No runs stored yet. Play a run in the Kit and it will appear here.
		</p>
	{:else if !selectedId}
		<p class="status" data-testid="bench-unselected">Pick a run to check it against the bench.</p>
	{:else if !run}
		<p class="status" data-testid="bench-missing-run">
			That run is no longer in the store. <a href={resolve('/workshop/runs')}>Back to the runs</a>.
		</p>
	{:else}
		<section class="run-head" data-testid="bench-run-head">
			<h2>{run.agentName}</h2>
			<span class="chip" data-outcome={run.outcome}>{run.outcome}</span>
			<dl>
				<div>
					<dt>Card</dt>
					<dd class="mono">{run.goalCardId}</dd>
				</div>
				<div>
					<dt>Used</dt>
					<dd class="mono">{run.ticks} turns · {tokens(run)} tokens</dd>
				</div>
			</dl>
			<a class="lab" href={resolve('/workshop/runs/[runId]', { runId: run.id })}
				>Open full Run Lab →</a
			>
		</section>

		<ul class="cards" data-testid="bench-results">
			{#each results as result (result.card.id)}
				<li class="card" data-testid="bench-card-{result.card.id}">
					<div class="card-head">
						<span class="pass" data-pass={result.pass} data-testid="bench-pass-{result.card.id}">
							{result.pass ? '✓ pass' : '✗ fail'}
						</span>
						<h3>{result.card.title}</h3>
					</div>
					{#if result.card.description}
						<p class="description">{result.card.description}</p>
					{/if}
					{#if result.matches.length > 0}
						<p class="matches">
							Matched at turn{result.matches.length > 1 ? 's' : ''}:
							{result.matches.map((m) => m.tick).join(', ')}
						</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	main {
		display: grid;
		gap: var(--cab-space-3);
		align-content: start;
	}

	.top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--cab-space-3);
	}

	h1 {
		margin: 0;
		font-size: var(--cab-text-xl);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.picker {
		display: flex;
		align-items: center;
		gap: var(--cab-space-2);
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--cab-ink-muted);
	}

	.picker select {
		font: inherit;
		font-size: var(--cab-text-sm);
		text-transform: none;
		letter-spacing: 0;
		padding: 2px var(--cab-space-1);
		color: var(--cab-ink);
		background: var(--cab-paper);
		border: 1px solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-part);
	}

	.status {
		margin: 0;
		font-size: var(--cab-text-sm);
		color: var(--cab-ink-muted);
	}

	.run-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--cab-space-3);
		padding: var(--cab-space-2) var(--cab-space-3);
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-panel);
	}

	h2 {
		margin: 0;
		font-size: var(--cab-text-md);
	}

	.chip {
		font-size: var(--cab-text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		padding: 1px var(--cab-space-2);
		border: 1px solid currentcolor;
		border-radius: var(--cab-radius-pill);
	}

	.chip[data-outcome='SUCCESS'] {
		color: var(--cab-green-text);
	}

	.chip[data-outcome='STOPPED_BY_GUARDRAIL'] {
		color: var(--cab-red-text);
	}

	.run-head dl {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-3);
		margin: 0;
	}

	dt {
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--cab-ink-muted);
	}

	dd {
		margin: 0;
	}

	.mono {
		font-family: var(--cab-font-mono);
		font-size: var(--cab-text-xs);
	}

	.lab {
		margin-left: auto;
		font-size: var(--cab-text-xs);
	}

	.cards {
		display: grid;
		gap: var(--cab-space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.card {
		display: grid;
		gap: 2px;
		padding: var(--cab-space-2) var(--cab-space-3);
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-panel);
	}

	.card-head {
		display: flex;
		align-items: baseline;
		gap: var(--cab-space-2);
	}

	.card-head h3 {
		margin: 0;
		font-size: var(--cab-text-sm);
	}

	/*
	 * The word carries it — `04-…` §7, never colour alone — the pill just
	 * agrees with what it already says.
	 */
	.pass {
		font-size: var(--cab-text-xs);
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		padding: 1px var(--cab-space-2);
		border: 1px solid currentcolor;
		border-radius: var(--cab-radius-pill);
	}

	.pass[data-pass='true'] {
		color: var(--cab-green-text);
	}

	.pass[data-pass='false'] {
		color: var(--cab-red-text);
	}

	.description,
	.matches {
		margin: 0;
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted);
	}

	:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}
</style>
