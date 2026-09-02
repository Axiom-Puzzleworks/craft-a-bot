<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { GroupRunRecord, RunRecord } from '@craftabot/core';
	import { createBrowserKeyVault } from '$lib/state/keys.js';
	import { bundleForGroup, bundleForRun, exportForGroup } from '$lib/workshop/bundles.js';
	import { agentsStore } from '$lib/state/agents.svelte.js';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import { otelTraceFor } from '$lib/workshop/otel-export.js';
	import { sinksStore } from '$lib/state/sinks.svelte.js';

	/**
	 * **The Audit Centre** (`17-…` §2, Phase F): "traces, reports, cards, OTel
	 * export" — the capstone screen WP34's own DoD names ("a full governance
	 * demo — build → policy → run → incident → report — runs end-to-end").
	 * Picks a run, the same `?run=` pattern the Test Bench and Compare use,
	 * and offers what a real audit actually asks for: this run's own trace,
	 * shaped against the OTel GenAI conventions (`19-…` #20,
	 * `$lib/workshop/otel-export.ts`); the bot's own Agent Card (WP33,
	 * unchanged — nothing new to build, only a place to reach it from); and
	 * the two screens that answer "was this safe" and "did anything go
	 * wrong" for the bot that made this run — the safety case (stage C) and
	 * the incident log (stage B). Nothing here computes anything new; it is
	 * the hub the rest of WP34 was building toward.
	 */

	let runs = $state<RunRecord[]>([]);
	let selectedId = $state('');
	let run = $state<RunRecord | undefined>(undefined);
	let loaded = $state(false);
	// Group episodes (WP48, `36-…` §4.4): picked as `group:<id>`, exported as one bundle.
	let groups = $state<GroupRunRecord[]>([]);
	let group = $state<GroupRunRecord | undefined>(undefined);

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
		groups = await storage.listGroupRuns();
		loaded = true;
	}

	async function loadSelected(id: string): Promise<void> {
		if (!id) {
			run = undefined;
			group = undefined;
			return;
		}
		const storage = await appStorage();
		if (id.startsWith('group:')) {
			run = undefined;
			group = await storage.getGroupRun(id.slice('group:'.length));
			return;
		}
		group = undefined;
		run = await storage.getRun(id);
	}

	async function downloadBundle(): Promise<void> {
		const storage = await appStorage();
		const secrets = createBrowserKeyVault().secrets();
		if (group) {
			const bundle = await bundleForGroup(storage, $state.snapshot(group), secrets);
			download(
				JSON.stringify(bundle, null, '\t'),
				`${slug(group.goalCardId)}.craftabot-bundle.json`
			);
		} else if (run) {
			const bundle = await bundleForRun(storage, $state.snapshot(run), secrets);
			download(JSON.stringify(bundle, null, '\t'), `${slug(run.agentName)}.craftabot-bundle.json`);
		}
	}

	async function sendGroupTo(sinkId: string): Promise<void> {
		if (!group) return;
		const storage = await appStorage();
		const result = await sinksStore.send(
			sinkId,
			await exportForGroup(storage, $state.snapshot(group))
		);
		sendNote = {
			...sendNote,
			[sinkId]: result.ok ? `Sent ${result.sent} spans.` : `Could not send: ${result.error}`
		};
	}

	let sendNote = $state<Record<string, string>>({});

	// "Send to…" (WP47, `35-…` §4.5): the same trace the download builds, to a configured sink.
	async function sendTo(sinkId: string): Promise<void> {
		if (!run) return;
		const storage = await appStorage();
		const events = (await storage.getEvents(run.id)).map((row) => row.event);
		const evaluations = await storage.listEvaluations(run.id);
		const result = await sinksStore.send(sinkId, { run, events, evaluations });
		sendNote = {
			...sendNote,
			[sinkId]: result.ok ? `Sent ${result.sent} spans.` : `Could not send: ${result.error}`
		};
	}

	function download(json: string, filename: string): void {
		const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		link.click();
		URL.revokeObjectURL(url);
	}

	const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

	async function downloadTrace(): Promise<void> {
		if (!run) return;
		const storage = await appStorage();
		const events = (await storage.getEvents(run.id)).map((row) => row.event);
		const trace = otelTraceFor(run, events);
		download(JSON.stringify(trace, null, '\t'), `${slug(run.agentName)}.otel-trace.json`);
	}

	async function downloadCard(): Promise<void> {
		if (!run) return;
		const json = await agentsStore.exportAgentCard(run.agentId);
		if (json === undefined) return;
		download(json, `${slug(run.agentName)}.craftabot-card.json`);
	}

	const tokens = (record: RunRecord) => record.usage.inputTokens + record.usage.outputTokens;
	const when = (iso: string) => new Date(iso).toLocaleString();
</script>

<svelte:head><title>Audit centre — Workshop</title></svelte:head>

<main data-testid="export-page">
	<header class="top">
		<h1>Audit centre</h1>
		<label class="picker">
			Run
			<select
				data-testid="export-run-picker"
				value={selectedId}
				onchange={(e) => (selectedId = e.currentTarget.value)}
			>
				<option value="">Choose a run…</option>
				{#each runs as candidate (candidate.id)}
					<option value={candidate.id}
						>{candidate.agentName} — {candidate.goalCardId} — {when(candidate.startedAt)}</option
					>
				{/each}
				{#each groups as candidate (candidate.id)}
					<option value={`group:${candidate.id}`} data-testid="export-group-option-{candidate.id}"
						>Episode — {candidate.goalCardId} — {candidate.memberRunIds.length} robots — {when(
							candidate.startedAt
						)}</option
					>
				{/each}
			</select>
		</label>
	</header>

	{#if !loaded}
		<p class="status">Reading the run store…</p>
	{:else if runs.length === 0 && groups.length === 0}
		<p class="status" data-testid="export-empty">
			No runs stored yet. Play a run in the Kit and it will appear here.
		</p>
	{:else if !selectedId}
		<p class="status" data-testid="export-unselected">Pick a run to build its audit bundle.</p>
	{:else if group}
		<section class="run-head" data-testid="export-group-head">
			<h2>Episode — {group.goalCardId}</h2>
			<span class="chip" data-outcome={group.outcome}>{group.outcome}</span>
			<dl>
				<dt>Robots</dt>
				<dd>{group.memberRunIds.length}</dd>
				<dt>Rounds</dt>
				<dd>{group.rounds}</dd>
			</dl>
		</section>
		<section class="bundle" aria-labelledby="group-bundle-h">
			<h3 id="group-bundle-h">Trace bundle</h3>
			<ul class="items">
				<li>
					<div>
						<strong>Bundle</strong>
						<p>
							Every robot's own trace, the merged stream, the evaluations — and a digest over every
							digest inside (<code>craftabot-bundle</code> v1).
						</p>
					</div>
					<button type="button" data-testid="export-download-bundle" onclick={downloadBundle}
						>Download bundle</button
					>
				</li>
				{#each sinksStore.configurations as entry (entry.sinkId)}
					<li>
						<div>
							<strong>Send to {sinksStore.sinkById(entry.sinkId)?.name ?? entry.sinkId}</strong>
							<p>
								The episode as one trace, to a sink configured on the Sinks page.
								{#if sendNote[entry.sinkId]}<span data-testid="export-sent-{entry.sinkId}"
										>{sendNote[entry.sinkId]}</span
									>{/if}
							</p>
						</div>
						<button
							type="button"
							data-testid="export-send-group-{entry.sinkId}"
							onclick={() => sendGroupTo(entry.sinkId)}>Send to sink</button
						>
					</li>
				{/each}
			</ul>
		</section>
	{:else if !run}
		<p class="status" data-testid="export-missing-run">That run is no longer in the store.</p>
	{:else}
		<section class="run-head" data-testid="export-run-head">
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

		<section class="bundle" aria-labelledby="bundle-h">
			<h3 id="bundle-h">Trace and reports</h3>
			<ul class="items">
				<li>
					<div>
						<strong>OTel trace</strong>
						<p>
							This run's own trace, shaped against the OpenTelemetry GenAI conventions (<code
								>invoke_agent</code
							>, <code>chat</code>, <code>execute_tool</code> spans; guardrail catches as
							<code>gen_ai.evaluation.result</code> events).
						</p>
					</div>
					<button type="button" data-testid="export-download-trace" onclick={downloadTrace}
						>Download OTel trace</button
					>
				</li>
				<li>
					<div>
						<strong>Trace bundle</strong>
						<p>
							This run's trace file inside a <code>craftabot-bundle</code> — the same wrapper an episode
							gets, with a digest over the whole.
						</p>
					</div>
					<button type="button" data-testid="export-download-bundle" onclick={downloadBundle}
						>Download bundle</button
					>
				</li>
				{#each sinksStore.configurations as entry (entry.sinkId)}
					<li>
						<div>
							<strong>Send to {sinksStore.sinkById(entry.sinkId)?.name ?? entry.sinkId}</strong>
							<p>
								The same trace, to a sink configured on the Sinks page.
								{#if sendNote[entry.sinkId]}<span data-testid="export-sent-{entry.sinkId}"
										>{sendNote[entry.sinkId]}</span
									>{/if}
							</p>
						</div>
						<button
							type="button"
							data-testid="export-send-{entry.sinkId}"
							onclick={() => sendTo(entry.sinkId)}>Send to sink</button
						>
					</li>
				{/each}
				<li>
					<div>
						<strong>Agent Card</strong>
						<p>{run.agentName}'s own machine-readable card: bricks, permissions, provenance.</p>
					</div>
					<button type="button" data-testid="export-download-card" onclick={downloadCard}
						>Download Agent Card</button
					>
				</li>
				<li>
					<div>
						<strong>Safety case</strong>
						<p>Why {run.agentName} is safe — inability, control and trustworthiness, per bot.</p>
					</div>
					<!-- eslint-disable svelte/no-navigation-without-resolve -- resolve() builds the base path here; its typed surface has no way to attach the ?agent= query the rule can verify statically (same exception workshop/runs/+page.svelte's own compareHref already takes for the identical shape). -->
					<a
						class="report-link"
						data-testid="export-safety-case-link"
						href={`${resolve('/workshop/safety-case')}?agent=${encodeURIComponent(run.agentId)}`}
						>See the worksheet →</a
					>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				</li>
				<li>
					<div>
						<strong>Incidents</strong>
						<p>Every stored run whose trace actually went wrong, across the whole fleet.</p>
					</div>
					<a
						class="report-link"
						data-testid="export-incidents-link"
						href={resolve('/workshop/incidents')}>See the incident log →</a
					>
				</li>
			</ul>
		</section>
	{/if}
</main>

<style>
	main {
		display: grid;
		gap: var(--cab-space-4);
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

	.chip[data-outcome='OUT_OF_STEPS'],
	.chip[data-outcome='STOPPED_BY_GUARDRAIL'],
	.chip[data-outcome='STOPPED_BY_USER'],
	.chip[data-outcome='ERROR'] {
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

	h3 {
		margin: 0 0 var(--cab-space-2);
		font-size: var(--cab-text-md);
	}

	.items {
		display: grid;
		gap: var(--cab-space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.items li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--cab-space-3);
		padding: var(--cab-space-2) var(--cab-space-3);
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-panel);
	}

	.items strong {
		font-size: var(--cab-text-sm);
	}

	.items p {
		margin: 2px 0 0;
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted);
		max-width: 46em;
	}

	.items code {
		font-family: var(--cab-font-mono);
	}

	button,
	.report-link {
		flex: none;
		font: inherit;
		font-size: var(--cab-text-xs);
		font-weight: 600;
		white-space: nowrap;
		padding: var(--cab-space-1) var(--cab-space-2);
		color: var(--cab-ink);
		background: var(--cab-paper);
		border: 1px solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-part);
		cursor: pointer;
	}

	button:hover,
	.report-link:hover {
		background: var(--cab-cream);
	}

	:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}
</style>
