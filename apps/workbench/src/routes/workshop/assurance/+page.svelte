<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { AgentRecord } from '@craftabot/core';
	import {
		assurancePackFromStorage,
		principalLine,
		renderAssurancePackHtml,
		renderAssurancePackMarkdown,
		type AssuranceCampaignReportLike,
		type AssurancePack
	} from '@craftabot/governance/reports';
	import CaseTable from '$lib/components/control-room/CaseTable.svelte';
	import Readout from '$lib/components/control-room/Readout.svelte';
	import Strip from '$lib/components/control-room/Strip.svelte';
	import { createRegistry } from '$lib/packs.js';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import { reportFrom } from '$lib/workshop/campaign-cells.js';

	/**
	 * **The assurance pack** (WP67 stage C, `53-ASSURANCE-PACK.md` §4.3): one
	 * bot's evidence filed against the control maps, sectioned by SS1/23's
	 * principles — the same fold `craftabot assurance` writes, read from this
	 * browser's store, with the JSON, the markdown and the self-contained HTML
	 * to download. Relevance, never compliance: the posture sentence rides at
	 * the head and the foot of every rendering, including this one.
	 */
	const registry = createRegistry();

	let agents = $state<AgentRecord[]>([]);
	let selectedId = $state('');
	let pack = $state<AssurancePack | undefined>(undefined);
	let missing = $state(false);
	let loaded = $state(false);

	const queryAgentId = $derived(page.url.searchParams.get('agent') ?? '');

	$effect(() => {
		void loadAgents();
	});
	$effect(() => {
		if (queryAgentId) selectedId = queryAgentId;
	});
	$effect(() => {
		void loadPack(selectedId);
	});

	async function loadAgents(): Promise<void> {
		agents = await (await appStorage()).listAgents();
		loaded = true;
	}

	/** A stored report as the pack reads it — the Workshop's own reader, so a report this version cannot parse is skipped, never fabricated. */
	const parseReport = (raw: unknown): AssuranceCampaignReportLike | undefined =>
		reportFrom({ report: raw } as never) as unknown as AssuranceCampaignReportLike | undefined;

	async function loadPack(id: string): Promise<void> {
		if (!id) {
			pack = undefined;
			missing = false;
			return;
		}
		const storage = await appStorage();
		if (!(await storage.getAgent(id))) {
			pack = undefined;
			missing = true;
			return;
		}
		missing = false;
		pack = await assurancePackFromStorage(id, storage, registry, { parseReport });
	}

	function download(text: string, filename: string, type: string): void {
		const url = URL.createObjectURL(new Blob([text], { type }));
		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		link.click();
		URL.revokeObjectURL(url);
	}
	const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
	const downloadJson = () =>
		pack &&
		download(
			JSON.stringify(pack, null, '\t'),
			`${slug(pack.bot.name)}.craftabot-assurance-pack.json`,
			'application/json'
		);
	const downloadMarkdown = () =>
		pack &&
		download(
			renderAssurancePackMarkdown(pack),
			`${slug(pack.bot.name)}.assurance-pack.md`,
			'text/markdown'
		);
	const downloadHtml = () =>
		pack &&
		download(
			renderAssurancePackHtml(pack),
			`${slug(pack.bot.name)}.assurance-pack.html`,
			'text/html'
		);

	const rowColumns = [
		{ id: 'map', label: 'Map', kind: 'text' as const },
		{ id: 'framework', label: 'Framework', kind: 'text' as const },
		{ id: 'ref', label: 'Ref', kind: 'text' as const },
		{ id: 'obligation', label: 'Obligation', kind: 'text' as const },
		{ id: 'evidence', label: 'Evidence (presence)', kind: 'text' as const },
		{ id: 'status', label: 'Status', kind: 'text' as const }
	];
	const controlRows = $derived(
		(pack?.controlMaps ?? []).flatMap((map) =>
			map.rows.map((row) => ({
				id: `${map.id}/${row.ref}`,
				cells: {
					map: map.title,
					framework: row.framework,
					ref: row.ref,
					obligation: row.obligation,
					evidence:
						row.status === 'pending'
							? `pending — ${row.note ?? ''}`
							: row.evidence.map((item) => `${item.id} (${item.presence})`).join('; '),
					status: row.status ?? 'reviewed'
				}
			}))
		)
	);
	const evaluationColumns = [
		{ id: 'evaluator', label: 'Evaluator', kind: 'text' as const },
		{ id: 'pass', label: 'Pass', kind: 'text' as const },
		{ id: 'fail', label: 'Fail', kind: 'text' as const },
		{ id: 'inconclusive', label: 'Inconclusive', kind: 'text' as const },
		{ id: 'runs', label: 'Runs', kind: 'text' as const }
	];
	const evaluationRows = $derived(
		(pack?.validation.evaluations ?? []).map((row) => ({
			id: row.evaluatorId,
			cells: {
				evaluator: row.evaluatorId,
				pass: String(row.pass),
				fail: String(row.fail),
				inconclusive: String(row.inconclusive),
				runs: row.runIds.join(', ')
			}
		}))
	);
	const campaignColumns = [
		{ id: 'title', label: 'Campaign', kind: 'text' as const },
		{ id: 'report', label: 'Report', kind: 'text' as const },
		{ id: 'verdict', label: 'Verdict', kind: 'text' as const },
		{ id: 'gates', label: 'Gates', kind: 'text' as const },
		{ id: 'parity', label: 'Parity', kind: 'text' as const },
		{ id: 'runs', label: 'Runs', kind: 'text' as const }
	];
	const campaignRows = $derived(
		(pack?.development.campaigns ?? []).map((campaign) => ({
			id: campaign.reportId,
			cells: {
				title: campaign.title,
				report: campaign.reportId,
				verdict: campaign.passed ? 'passed' : 'failed',
				gates: `${campaign.gates.filter((gate) => gate.passed).length} of ${campaign.gates.length} passed`,
				parity:
					campaign.parity.length === 0
						? 'none'
						: campaign.parity
								.map(
									(gate) =>
										`${gate.id}: ${gate.passed ? 'pass' : 'fail'} (${gate.matched ? 'matched' : 'unmatched cohorts'})`
								)
								.join('; '),
				runs: campaign.runIds.length === 0 ? 'none' : `${campaign.runIds.length} runs`
			}
		}))
	);
</script>

<svelte:head><title>Assurance pack — Workshop</title></svelte:head>

<main data-testid="assurance-page">
	<header class="top">
		<h1>Assurance pack</h1>
		<label class="picker">
			Bot
			<select
				data-testid="assurance-agent-picker"
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
		<p class="status" data-testid="assurance-no-agents">
			No bots on the shelf yet. Build one in the Kit and its pack will appear here.
		</p>
	{:else if !selectedId}
		<p class="status" data-testid="assurance-unselected">Pick a bot to file its evidence.</p>
	{:else if missing}
		<p class="status" data-testid="assurance-missing">That bot is no longer on the shelf.</p>
	{:else if !pack}
		<p class="status">Folding the evidence…</p>
	{:else}
		<p class="posture" data-testid="assurance-posture">{pack.posture}</p>
		<section aria-label="At a glance">
			<Strip label={pack.bot.name} icon="case">
				<Readout label="Control rows" value={pack.review.rows} testId="assurance-rows" />
				<Readout label="Unreviewed" value={pack.review.unreviewed} testId="assurance-unreviewed" />
				<Readout label="Pending" value={pack.review.pending} testId="assurance-pending" />
				<Readout label="Runs" value={pack.runs.length} testId="assurance-runs" />
				<Readout
					label="Campaigns"
					value={pack.development.campaigns.length}
					testId="assurance-campaigns"
				/>
				<Readout
					label="Incidents"
					value={pack.monitoring.incidents.length}
					testId="assurance-incidents"
				/>
			</Strip>
			<p class="meta mono" data-testid="assurance-digest">digest {pack.digest}</p>
			<div class="downloads">
				<button type="button" onclick={downloadHtml} data-testid="assurance-download-html"
					>Download the report (HTML)</button
				>
				<button type="button" onclick={downloadMarkdown} data-testid="assurance-download-markdown"
					>Download as markdown</button
				>
				<button type="button" onclick={downloadJson} data-testid="assurance-download-json"
					>Download the pack (JSON)</button
				>
				<a href={resolve('/workshop/safety-case')}>The safety case</a>
			</div>
		</section>

		<section aria-labelledby="inventory-h">
			<h2 id="inventory-h">1. Identification and classification — the inventory entry</h2>
			<ul class="mono" data-testid="assurance-inventory">
				<li>
					agent card: {pack.inventory.agentCard.name} on {pack.inventory.agentCard.goalCardId}
				</li>
				<li>requires core {pack.inventory.requires.core}</li>
				{#each Object.entries(pack.inventory.requires.packs) as [id, range] (id)}
					<li>requires {id} {range}</li>
				{/each}
				{#if pack.inventory.world}
					<li>
						world {pack.inventory.world.id}{pack.inventory.world.purpose
							? ` (purpose ${pack.inventory.world.purpose})`
							: ''}
					</li>
				{/if}
			</ul>
		</section>

		<section aria-labelledby="governance-h">
			<h2 id="governance-h">2. Governance</h2>
			<ul data-testid="assurance-governance">
				<li>
					Safety stack: <span class="mono">{pack.governance.guardrails.join(', ') || 'none'}</span>
				</li>
				<li>
					Approvals: {pack.governance.approvals.requested} requested, {pack.governance.approvals
						.granted} granted (runs: {pack.governance.approvals.runIds.join(', ') || 'none'})
				</li>
				<li>
					Egress: {pack.governance.egress.hosts.join(', ') || 'no hosts'}; {pack.governance.egress
						.recordedRuns} runs recorded, {pack.governance.egress.noNetworkRuns} allowed none
				</li>
				{#if pack.governance.principal.recorded}
					<!-- Who started the runs (WP65): every distinct principal, the chain rendered, with its runs. -->
					<li data-testid="assurance-principals">
						Principal: {#each pack.governance.principal.principals as entry, index (index)}{index >
							0
								? '; '
								: ''}{principalLine(entry.principal)} (runs: {entry.runIds.join(', ')}){/each}
					</li>
				{:else}
					<li class="not-recorded">{pack.governance.principal.note}</li>
				{/if}
			</ul>
		</section>

		<section aria-labelledby="development-h">
			<h2 id="development-h">3. Development, implementation and use — the campaigns</h2>
			{#if pack.development.note}
				<p class="status" data-testid="assurance-no-campaigns">{pack.development.note}</p>
			{:else}
				<CaseTable
					columns={campaignColumns}
					rows={campaignRows}
					testId="assurance-campaign-table"
				/>
			{/if}
		</section>

		<section aria-labelledby="validation-h">
			<h2 id="validation-h">4. Independent validation</h2>
			{#if pack.validation.validatedBy.recorded}
				<p data-testid="assurance-validators">
					Validated by: {#each pack.validation.validatedBy.validators as entry, index (index)}{index >
						0
							? '; '
							: ''}{principalLine(entry.principal)} (runs: {entry.runIds.join(', ')}){/each}
				</p>
				<p class="not-recorded">{pack.validation.validatedBy.note}</p>
			{:else}
				<p class="not-recorded">{pack.validation.validatedBy.note}</p>
			{/if}
			{#if pack.validation.note}
				<p class="status" data-testid="assurance-no-evaluations">{pack.validation.note}</p>
			{:else}
				<CaseTable
					columns={evaluationColumns}
					rows={evaluationRows}
					testId="assurance-evaluation-table"
				/>
			{/if}
		</section>

		<section aria-labelledby="mitigants-h">
			<h2 id="mitigants-h">5. Risk mitigants</h2>
			<ul data-testid="assurance-mitigants">
				<li>Cannot: {pack.mitigants.inability.join('; ') || 'none'}</li>
				<li>Can reach (irreversible): {pack.mitigants.reach.join('; ') || 'none'}</li>
				<li>Kill switch: {pack.mitigants.killSwitch}</li>
			</ul>
		</section>

		<section aria-labelledby="monitoring-h">
			<h2 id="monitoring-h">6. Ongoing monitoring</h2>
			{#if pack.monitoring.note}
				<p class="status" data-testid="assurance-no-runs">{pack.monitoring.note}</p>
			{/if}
			<ul data-testid="assurance-monitoring">
				<li>
					Series: {pack.monitoring.series.length} days; drift flags: {pack.monitoring.drift.length}
				</li>
				<li>Incidents: {pack.monitoring.incidents.length}</li>
				<li class="not-recorded">{pack.monitoring.explanations.note}</li>
			</ul>
		</section>

		<section aria-labelledby="outcomes-h">
			<h2 id="outcomes-h">7. The Consumer Duty outcomes</h2>
			<ul data-testid="assurance-outcomes">
				{#each pack.outcomes as outcome (outcome.tag)}
					<li>
						<strong>{outcome.title}</strong> — {outcome.rows.length} control rows; {outcome
							.evaluations.length} evaluators with evidence over this bot’s runs
					</li>
				{/each}
			</ul>
		</section>

		<section aria-labelledby="map-h">
			<h2 id="map-h">8. The control map</h2>
			<CaseTable columns={rowColumns} rows={controlRows} testId="assurance-control-table" />
		</section>

		<p class="posture">{pack.posture}</p>
	{/if}
</main>

<style>
	main {
		padding: var(--cab-space-4);
	}
	.top {
		display: flex;
		align-items: baseline;
		gap: var(--cab-space-4);
		margin-bottom: var(--cab-space-3);
	}
	h1 {
		margin: 0;
	}
	h2 {
		margin: var(--cab-space-4) 0 var(--cab-space-2);
		font-size: var(--cab-text-lg);
	}
	.picker {
		display: inline-flex;
		align-items: center;
		gap: var(--cab-space-2);
		font-size: var(--cab-text-sm);
	}
	.status,
	.meta {
		color: var(--cab-ink-muted);
	}
	.posture {
		padding: var(--cab-space-2) var(--cab-space-3);
		border: 2px solid var(--cab-ink);
		background: var(--cab-paper);
		font-weight: 600;
		max-width: 70ch;
	}
	.mono {
		font-family: var(--cab-font-mono);
		font-size: var(--cab-text-sm);
	}
	.downloads {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-2);
		align-items: center;
		margin: var(--cab-space-2) 0;
	}
	.not-recorded {
		color: var(--cab-ink-muted);
		font-style: italic;
	}
	ul {
		margin: 0;
		padding-left: var(--cab-space-4);
	}
</style>
