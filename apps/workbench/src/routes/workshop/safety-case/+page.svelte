<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import {
		capabilitiesOf,
		type AgentRecord,
		type EvaluationRecord,
		type RunRecord,
		type RunSummary
	} from '@craftabot/core';
	import type { CampaignReport } from '@craftabot/evals';
	import { safetyCaseFromSummaries, type SafetyCase } from '@craftabot/governance/reports';
	import { createRegistry } from '$lib/packs.js';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import { ensureRunSummaries } from '$lib/state/run-summaries.js';
	import { reportFrom } from '$lib/workshop/campaign-cells.js';

	/**
	 * **The safety-case worksheet** (`19-…` #28, WP34 stage C): "why is this
	 * bot safe?", auto-assembled per bot from evidence this app already has —
	 * never authored, never invented.
	 *
	 * Picks a bot rather than a run, unlike the Test Bench and Compare —
	 * every other question this app answers is "what happened in this run";
	 * this one is "what is true of this build", which only means something
	 * held against one bot's full history at once.
	 */

	const registry = createRegistry();

	let agents = $state<AgentRecord[]>([]);
	let selectedId = $state('');
	let record = $state<AgentRecord | undefined>(undefined);
	let runs = $state<RunRecord[]>([]);
	let summaries = $state<Map<string, RunSummary>>(new Map());
	/** The evidence sections' inputs (WP49, `37-…` §4.2): the store's evaluations and its campaign reports; the fold keeps this bot's. */
	let evaluations = $state<EvaluationRecord[]>([]);
	let campaignReports = $state<CampaignReport[]>([]);
	let loaded = $state(false);

	const queryAgentId = $derived(page.url.searchParams.get('agent') ?? '');

	$effect(() => {
		void loadAgents();
	});

	$effect(() => {
		if (queryAgentId) selectedId = queryAgentId;
	});

	$effect(() => {
		void loadSelected(selectedId);
	});

	async function loadAgents(): Promise<void> {
		const storage = await appStorage();
		agents = await storage.listAgents();
		loaded = true;
	}

	async function loadSelected(id: string): Promise<void> {
		if (!id) {
			record = undefined;
			runs = [];
			summaries = new Map();
			return;
		}
		const storage = await appStorage();
		const agent = await storage.getAgent(id);
		if (!agent) {
			record = undefined;
			runs = [];
			summaries = new Map();
			return;
		}
		const allRuns = await storage.listRuns();
		const mine = allRuns.filter((run) => run.agentId === id);
		// One summary row per run rather than one whole trace per run (WP36 stage C).
		const folded = await ensureRunSummaries(storage, mine);
		evaluations = await storage.listAllEvaluations();
		campaignReports = (await storage.listCampaignReports())
			.map(reportFrom)
			.filter((report) => report !== undefined);
		record = agent;
		runs = mine;
		summaries = folded;
	}

	const worksheet = $derived<SafetyCase | undefined>(
		record
			? safetyCaseFromSummaries(
					{ id: record.id, name: record.spec.name, goalCardId: record.spec.goalCardId },
					capabilitiesOf(record.spec, registry),
					registry.getWorld(registry.getGoalCard(record.spec.goalCardId)?.worldId ?? ''),
					registry.listTools(),
					runs,
					summaries,
					evaluations,
					campaignReports
				)
			: undefined
	);
	const score = (value: number | undefined) => (value === undefined ? '—' : value.toFixed(2));
	const when = (iso: string) => new Date(iso).toLocaleString();

	const pct = (rate: number | undefined) =>
		rate === undefined ? '—' : `${Math.round(rate * 100)}%`;
</script>

<svelte:head><title>Safety case — Workshop</title></svelte:head>

<main data-testid="safety-case-page">
	<header class="top">
		<h1>Safety case</h1>
		<label class="picker">
			Bot
			<select
				data-testid="safety-case-agent-picker"
				value={selectedId}
				onchange={(e) => (selectedId = e.currentTarget.value)}
			>
				<option value="">Choose a bot…</option>
				{#each agents as agent (agent.id)}
					<option value={agent.id}>{agent.spec.name}</option>
				{/each}
			</select>
		</label>
	</header>

	{#if !loaded}
		<p class="status">Reading the fleet…</p>
	{:else if agents.length === 0}
		<p class="status" data-testid="safety-case-no-agents">
			No bots on the shelf yet. Build one in the Kit and its worksheet will appear here.
		</p>
	{:else if !selectedId}
		<p class="status" data-testid="safety-case-unselected">Pick a bot to see its worksheet.</p>
	{:else if !record || !worksheet}
		<p class="status" data-testid="safety-case-missing">That bot is no longer on the shelf.</p>
	{:else}
		<section class="head" data-testid="safety-case-head">
			<h2>{worksheet.agentName}</h2>
			<span class="card mono">{worksheet.goalCardId}</span>
		</section>

		<section aria-labelledby="inability-h">
			<h3 id="inability-h">Inability</h3>
			<p class="lead">What this build genuinely cannot do.</p>
			{#if worksheet.inability.length === 0}
				<p class="status" data-testid="inability-empty">
					No inability claim holds — every irreversible action or tool in scope is reachable.
				</p>
			{:else}
				<ul data-testid="inability-list">
					{#each worksheet.inability as claim, i (i)}
						<li>{claim}</li>
					{/each}
				</ul>
			{/if}
			{#if worksheet.reach.length > 0}
				<p class="lead reach-note">Reachable, and irreversible — named rather than hidden:</p>
				<ul data-testid="reach-list">
					{#each worksheet.reach as claim, i (i)}
						<li>{claim}</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section aria-labelledby="control-h">
			<h3 id="control-h">Control</h3>
			<p class="lead">Every rule this build's fitted bricks actually install.</p>
			{#if worksheet.guardrails.length === 0}
				<p class="status" data-testid="control-empty">No guardrail is installed on this build.</p>
			{:else}
				<ul class="mono" data-testid="control-list">
					{#each worksheet.guardrails as guardrailId (guardrailId)}
						<li>{guardrailId}</li>
					{/each}
				</ul>
			{/if}
			{#if worksheet.hostedScreening}
				<p class="status" data-testid="hosted-screening">
					Hosted content screening ran on {worksheet.hostedScreening.fired} of {worksheet
						.hostedScreening.decisions} decisions.
				</p>
			{/if}
			<!-- Where the bot was allowed to call (WP41, `26-…` §6.6): one control row per declared host. -->
			<h3 class="sub">Where it may call</h3>
			{#if worksheet.egress.recordedRuns === 0}
				<p class="status" data-testid="egress-unrecorded">No run has recorded its egress yet.</p>
			{:else if worksheet.egress.hosts.length === 0}
				<p class="status" data-testid="egress-none">
					Nowhere — every recorded run allowed no network at all.
				</p>
			{:else}
				<ul class="mono" data-testid="egress-hosts">
					{#each worksheet.egress.hosts as host (host)}
						<li>{host}</li>
					{/each}
				</ul>
				{#if worksheet.egress.noNetworkRuns > 0}
					<p class="status">
						{worksheet.egress.noNetworkRuns} of {worksheet.egress.recordedRuns} recorded runs allowed
						no network at all.
					</p>
				{/if}
			{/if}
		</section>

		<section aria-labelledby="trust-h">
			<h3 id="trust-h">Trustworthiness</h3>
			<p class="lead">This build's own run history.</p>
			<dl class="trust" data-testid="trustworthiness">
				<div>
					<dt>Success rate</dt>
					<dd>
						{pct(worksheet.trustworthiness.successRate)}
						<span class="denominator">
							{#if worksheet.trustworthiness.finishedRuns > 0}
								of {worksheet.trustworthiness.finishedRuns} finished
							{:else}
								nothing finished yet
							{/if}
						</span>
					</dd>
				</div>
				<div>
					<dt>Incidents on record</dt>
					<dd>
						{worksheet.trustworthiness.incidentRuns}
						<span class="denominator">of {worksheet.trustworthiness.runs} runs</span>
					</dd>
				</div>
			</dl>
			<a class="lab" href={resolve('/workshop/incidents')}>See the full incident log →</a>
		</section>

		<section aria-labelledby="evaluation-h">
			<h3 id="evaluation-h">Evaluation evidence</h3>
			<p class="lead">
				Every evaluator that has judged one of this build's runs, verdicts as stored.
			</p>
			{#if worksheet.evaluations.length === 0}
				<p class="status" data-testid="evaluation-evidence-empty">
					Nothing has evaluated a run of this build yet.
				</p>
			{:else}
				<table data-testid="evaluation-evidence">
					<thead>
						<tr>
							<th scope="col">Evaluator</th>
							<th scope="col">Pass</th>
							<th scope="col">Fail</th>
							<th scope="col">Inconclusive</th>
							<th scope="col">Mean score</th>
						</tr>
					</thead>
					<tbody>
						{#each worksheet.evaluations as row (row.evaluatorId)}
							<tr data-testid="evaluation-evidence-{row.evaluatorId}">
								<td class="mono">{row.evaluatorId}</td>
								<td>{row.pass}</td>
								<td>{row.fail}</td>
								<td>{row.inconclusive + row.noVerdict}</td>
								<td>{score(row.meanScore)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</section>

		<section aria-labelledby="campaign-h">
			<h3 id="campaign-h">Campaign results</h3>
			<p class="lead">
				Every stored campaign in which a build was this bot, and the gates that applied to it.
			</p>
			{#if worksheet.campaigns.length === 0}
				<p class="status" data-testid="campaign-evidence-empty">
					This build has not run in a campaign yet.
					<a href={resolve('/workshop/campaigns')}>Add it as a build →</a>
				</p>
			{:else}
				<ul class="campaigns" data-testid="campaign-evidence">
					{#each worksheet.campaigns as row (row.reportId + row.buildId)}
						<li data-testid="campaign-evidence-{row.reportId}">
							<p>
								<strong>{row.title}</strong>
								<span class="denominator"
									>{when(row.createdAt)} · build <span class="mono">{row.buildId}</span> · {row.cells}
									cells</span
								>
								<span class="verdict" data-passed={row.passed}
									>{row.passed ? '✅ passed' : '❌ failed'}</span
								>
							</p>
							<ul class="gates">
								{#each row.gates as gate (gate.id)}
									<li data-testid="campaign-gate-{gate.id}" data-passed={gate.passed}>
										{gate.passed ? '✅' : '❌'}
										<span class="mono">{gate.id}</span>
										{gate.required}{#if gate.observed !== undefined}
											— observed {Math.round(gate.observed * 100) / 100}{/if}
										{#if gate.scoped}<span class="denominator">(this build)</span>{/if}
									</li>
								{/each}
							</ul>
						</li>
					{/each}
				</ul>
			{/if}
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

	table {
		width: 100%;
		border-collapse: collapse;
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-panel);
		overflow: hidden;
		font-size: var(--cab-text-sm);
	}

	th,
	td {
		padding: var(--cab-space-1) var(--cab-space-2);
		text-align: left;
	}

	th {
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--cab-ink-muted);
		border-bottom: 1px solid var(--cab-ink-muted);
	}

	.campaigns,
	.gates {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: var(--cab-space-2);
	}

	.campaigns > li {
		padding: var(--cab-space-2);
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-panel);
		font-size: var(--cab-text-sm);
	}

	.campaigns p {
		margin: 0 0 var(--cab-space-1);
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-2);
		align-items: baseline;
	}

	.gates {
		gap: var(--cab-space-1);
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

	.head {
		display: flex;
		align-items: baseline;
		gap: var(--cab-space-3);
		padding: var(--cab-space-2) var(--cab-space-3);
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-panel);
	}

	.head h2 {
		margin: 0;
		font-size: var(--cab-text-md);
	}

	.card {
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted);
	}

	.mono {
		font-family: var(--cab-font-mono);
		font-size: var(--cab-text-xs);
	}

	h3 {
		margin: 0 0 2px;
		font-size: var(--cab-text-md);
	}

	.lead {
		margin: 0 0 var(--cab-space-2);
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted);
	}

	.reach-note {
		margin-top: var(--cab-space-2);
	}

	ul {
		display: grid;
		gap: 2px;
		margin: 0;
		padding-left: 1.1em;
		font-size: var(--cab-text-sm);
	}

	.trust {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-4);
		margin: 0 0 var(--cab-space-2);
	}

	.trust dt {
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--cab-ink-muted);
	}

	.trust dd {
		margin: 0;
		font-size: var(--cab-text-lg);
	}

	.denominator {
		font-size: var(--cab-text-xs);
		font-weight: 400;
		color: var(--cab-ink-muted);
	}

	.lab {
		font-size: var(--cab-text-xs);
	}

	:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}
</style>
