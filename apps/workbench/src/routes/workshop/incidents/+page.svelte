<script lang="ts">
	import { resolve } from '$app/paths';
	import type { RunRecord, RunSummary } from '@craftabot/core';
	import { incidentsFromSummaries, type Incident } from '@craftabot/governance/reports';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import { ensureRunSummaries } from '$lib/state/run-summaries.js';

	/**
	 * **The incident log** (`19-…` #31, WP34 stage B): derived, not authored.
	 *
	 * Every stored run carrying at least one failing event (`timeline.ts`'s own
	 * `isFailure`), broken into findings tagged by kind, newest run first. No
	 * separate store, no way to log or dismiss one by hand — the trace is the
	 * one source of truth, the same discipline the Test Bench's assertion
	 * cards already follow (`17-…` §4.7).
	 */

	let runs = $state<RunRecord[]>([]);
	let summaries = $state<Map<string, RunSummary>>(new Map());
	let loaded = $state(false);

	$effect(() => {
		void load();
	});

	/*
	 * One summary row per run rather than one whole trace per run (WP36 stage
	 * C): the findings this screen lists are folded once, when the run ends,
	 * and kept beside its record.
	 */
	async function load(): Promise<void> {
		const storage = await appStorage();
		const stored = await storage.listRuns();
		summaries = await ensureRunSummaries(storage, stored);
		runs = stored;
		loaded = true;
	}

	const incidents = $derived<Incident[]>(incidentsFromSummaries(runs, summaries));

	const KIND_LABEL: Record<Incident['findings'][number]['kind'], string> = {
		error: 'Error',
		'guardrail-catch': 'Guardrail catch',
		'action-failure': 'Action failure',
		'approval-denied': 'Approval denied',
		'run-failure': 'Run failure'
	};

	const when = (iso: string) => new Date(iso).toLocaleString();
</script>

<svelte:head><title>Incidents — Workshop</title></svelte:head>

<main data-testid="incidents-page">
	<h1>Incidents</h1>

	{#if !loaded}
		<p class="status">Reading the run store…</p>
	{:else if runs.length === 0}
		<p class="status" data-testid="incidents-no-runs">
			No runs stored yet. Play a run in the Kit and this log will report on it.
		</p>
	{:else if incidents.length === 0}
		<p class="status" data-testid="incidents-clean">
			No incidents. Every stored run's trace is clean — {runs.length} run{runs.length === 1
				? ''
				: 's'} checked.
		</p>
	{:else}
		<ul class="incidents" data-testid="incidents-list">
			{#each incidents as incident (incident.runId)}
				<li class="incident" data-testid="incident-{incident.runId}">
					<div class="head">
						<h2>{incident.agentName}</h2>
						<span class="chip" data-outcome={incident.outcome}>{incident.outcome}</span>
						<span class="card mono">{incident.goalCardId}</span>
						<time class="when">{when(incident.startedAt)}</time>
						<a class="lab" href={resolve('/workshop/runs/[runId]', { runId: incident.runId })}
							>Open full Run Lab →</a
						>
					</div>
					<ul class="findings">
						{#each incident.findings as finding, i (i)}
							<li>
								<span class="kind" data-kind={finding.kind}>{KIND_LABEL[finding.kind]}</span>
								<span class="tick">tick {finding.tick}</span>
								<span class="summary">{finding.summary}</span>
							</li>
						{/each}
					</ul>
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

	h1 {
		margin: 0;
		font-size: var(--cab-text-xl);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.status {
		margin: 0;
		font-size: var(--cab-text-sm);
		color: var(--cab-ink-muted);
	}

	.incidents {
		display: grid;
		gap: var(--cab-space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.incident {
		display: grid;
		gap: var(--cab-space-1);
		padding: var(--cab-space-2) var(--cab-space-3);
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-panel);
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--cab-space-3);
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

	.chip[data-outcome='OUT_OF_STEPS'],
	.chip[data-outcome='STOPPED_BY_GUARDRAIL'],
	.chip[data-outcome='STOPPED_BY_USER'],
	.chip[data-outcome='ERROR'] {
		color: var(--cab-red-text);
	}

	.card,
	.when {
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted);
	}

	.mono {
		font-family: var(--cab-font-mono);
	}

	.lab {
		margin-left: auto;
		font-size: var(--cab-text-xs);
	}

	.findings {
		display: grid;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.findings li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--cab-space-2);
		padding: 2px 0;
		font-size: var(--cab-text-sm);
	}

	.kind {
		font-size: var(--cab-text-xs);
		font-weight: 600;
		letter-spacing: 0.03em;
		text-transform: uppercase;
		color: var(--cab-ink-muted);
	}

	.tick {
		font-size: var(--cab-text-xs);
		font-variant-numeric: tabular-nums;
		color: var(--cab-ink-muted);
	}

	.summary {
		flex: 1;
		min-width: 0;
	}

	:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}
</style>
