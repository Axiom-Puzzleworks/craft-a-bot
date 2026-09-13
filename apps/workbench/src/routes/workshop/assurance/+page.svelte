<script lang="ts">
	import {
		CONTENT_SCHEMA_VERSION,
		controlReviewSlug,
		controlReviewSchema,
		localContentId,
		type ControlReview,
		type ControlReviewStatus
	} from '@craftabot/core';
	import { contentStore } from '$lib/state/content.svelte.js';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type {
		AgentRecord,
		EvaluationRecord,
		ExperimentResult,
		RunRecord,
		RunSummary,
		StoredCampaignReport
	} from '@craftabot/core';
	import { capabilitiesOf } from '@craftabot/core';
	import {
		controlEffectiveness,
		driftIn,
		incidentsFromSummaries,
		safetyCaseFromSummaries,
		telemetrySeries,
		coverageSummary
	} from '@craftabot/governance/reports';
	import { GUARDRAIL_CATALOGUE } from '@craftabot/governance';
	import Lamp from '$lib/components/control-room/Lamp.svelte';
	import { ensureRunSummaries } from '$lib/state/run-summaries.js';
	import {
		assurancePackFromStorage,
		principalLine,
		renderAssurancePackHtml,
		renderAssurancePackMarkdown,
		type AssuranceCampaignReportLike,
		type AssurancePack
	} from '@craftabot/governance/reports';
	import CaseTable from '$lib/components/control-room/CaseTable.svelte';
	import JourneyCanvas from '$lib/components/control-room/JourneyCanvas.svelte';
	import { journeyLayout, renderJourneySvg } from '@craftabot/workflow';
	import Readout from '$lib/components/control-room/Readout.svelte';
	import Strip from '$lib/components/control-room/Strip.svelte';
	import { createRegistry } from '$lib/packs.js';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import { preferences } from '$lib/state/preferences.svelte.js';
	import { browserPrincipalId } from '$lib/state/principal.js';
	import { agentOptionLabel, mostRecentAgent } from '$lib/workshop/agent-labels.js';
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
	/** WP100 (`87-JOURNEY-CANVAS.md` §7): every journey laid out once; the fold keeps the bot's world's. */
	const journeys = registry.listWorkflows().map((workflow) => {
		const layout = journeyLayout(workflow, undefined, undefined, { registry });
		return {
			workflowId: workflow.id,
			worldId: workflow.worldId,
			name: workflow.name,
			layout,
			svg: renderJourneySvg(layout)
		};
	});

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

	/**
	 * **The Assurance entry** (WP87, `78-LENSES.md` §4; `64-…` §6.7): the
	 * board's landing over the same stored facts — the safety case's claims
	 * as lamps, incidents this period, drift flags, the register (untested
	 * until WP90 folds one), and two stored reports into Compare.
	 */
	let runs = $state<RunRecord[]>([]);
	let summaries = $state<Map<string, RunSummary>>(new Map());
	let evaluations = $state<EvaluationRecord[]>([]);
	let storedReports = $state<StoredCampaignReport[]>([]);
	let compareA = $state('');
	let compareB = $state('');
	const botRuns = $derived(runs.filter((run) => run.agentId === selectedId));
	const safety = $derived.by(() => {
		const agent = agents.find((entry) => entry.id === selectedId);
		if (!agent) return undefined;
		const world = registry.getWorld(registry.getGoalCard(agent.spec.goalCardId)?.worldId ?? '');
		return safetyCaseFromSummaries(
			{ id: agent.id, name: agent.spec.name, goalCardId: agent.spec.goalCardId },
			capabilitiesOf(agent.spec, registry),
			world,
			registry.listTools(),
			botRuns,
			summaries,
			evaluations,
			storedReports
				.map((row) => reportFrom(row))
				.filter((report): report is NonNullable<typeof report> => report !== undefined)
		);
	});
	const claims = $derived(
		safety
			? [
					{ id: 'inability', label: 'inability stated', ok: safety.inability.length > 0 },
					{ id: 'reach', label: 'reach named', ok: safety.reach.length > 0 },
					{ id: 'guardrails', label: 'guardrails installed', ok: safety.guardrails.length > 0 },
					{ id: 'finished', label: 'runs finished', ok: safety.trustworthiness.finishedRuns > 0 }
				]
			: []
	);
	const incidents = $derived(incidentsFromSummaries(botRuns, summaries));
	const driftFlags = $derived(driftIn(telemetrySeries(botRuns, summaries, { evaluations })));
	/**
	 * **The Control Effectiveness Register** (WP90, `80-…` §3): every control
	 * the maps list with its measured effect — folded from the stored
	 * experiment results — or *untested*; a row opens the result behind it.
	 */
	let experimentResults = $state.raw<ExperimentResult[]>([]);
	const register = $derived(controlEffectiveness(experimentResults, registry.listControlMaps()));
	// WP98 (`86-…` §7): the catalogue's coverage beneath the register — the counts, and what is not claimed.
	const coverage = coverageSummary(GUARDRAIL_CATALOGUE);
	const registerColumns = [
		{ id: 'control', label: 'Control', kind: 'text' as const },
		{ id: 'obligation', label: 'Obligation', kind: 'text' as const },
		{ id: 'changed', label: 'What it changed', kind: 'text' as const },
		{ id: 'effect', label: 'By how much', kind: 'text' as const },
		{ id: 'confidence', label: 'How sure', kind: 'text' as const },
		{ id: 'coverage', label: 'Coverage', kind: 'text' as const },
		{ id: 'status', label: 'Status', kind: 'text' as const }
	];
	const signed = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(3)}`;
	const registerRows = $derived(
		register.map((row) => ({
			id: row.controlId,
			cells: {
				control: row.controlMapRow?.title ?? row.controlId,
				obligation: row.controlMapRow?.obligation ?? row.obligations.join(', '),
				changed: row.headline ? `${row.headline.metricId}: ${signed(row.headline.delta)}` : '—',
				effect: row.headline
					? `${signed(row.headline.interval[0])} – ${signed(row.headline.interval[1])}`
					: '—',
				confidence: row.headline
					? `n = ${row.headline.n}${row.headline.underpowered ? ', underpowered' : ''}`
					: '—',
				coverage: `${row.coverage.experiments} experiment${row.coverage.experiments === 1 ? '' : 's'}${row.coverage.workflows.length > 0 ? ` · ${row.coverage.workflows.join(', ')}` : ''}`,
				status: row.status
			}
		}))
	);
	function openRegisterRow(controlId: string): void {
		const row = register.find((entry) => entry.controlId === controlId);
		if (!row?.headline) return;
		const target = `${resolve('/workshop/experiments')}?result=${encodeURIComponent(row.headline.resultId)}`;
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() builds the base path; the ?result= query cannot be attached through its typed surface.
		void goto(target);
	}
	const compareHref = $derived(
		compareA && compareB && compareA !== compareB
			? `${resolve('/workshop/compare')}?reportA=${encodeURIComponent(compareA)}&reportB=${encodeURIComponent(compareB)}`
			: undefined
	);

	async function loadAgents(): Promise<void> {
		const storage = await appStorage();
		agents = await storage.listAgents();
		runs = await storage.listRuns();
		summaries = await ensureRunSummaries(storage, runs);
		evaluations = await storage.listAllEvaluations();
		storedReports = await storage.listCampaignReports();
		experimentResults = await storage.listExperimentResults();
		loaded = true;
		// Nobody chose (UX-20): open on the bot most recently run, as Evaluators
		// opens on the most recent run, rather than on an empty page.
		if (!queryAgentId && !selectedId) selectedId = mostRecentAgent(agents)?.id ?? '';
	}

	/**
	 * **Who this pack will say ran it** (UX-3). Every run started from this
	 * browser carries its principal; without a name in Settings that is a bare
	 * id, which is the least useful thing section 2 can tell a reviewer. Asked
	 * here, at the point of value — once answered, it stays in Settings.
	 */
	let nameDraft = $state('');
	const needsName = $derived(preferences.displayName.trim() === '');
	const shortPrincipalId = $derived(browserPrincipalId().slice(0, 8));
	function saveName(): void {
		if (nameDraft.trim() === '') return;
		preferences.setDisplayName(nameDraft.trim());
		nameDraft = '';
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
		pack = await assurancePackFromStorage(id, storage, registry, { parseReport, journeys });
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
		{ id: 'status', label: 'Status', kind: 'text' as const },
		{ id: 'review', label: 'Review', kind: 'text' as const }
	];
	/**
	 * WP110 (`97-ACCESS.md` §1, decision 4; GAP-1): a reader's review of a row is
	 * content — saved beside the pack's row under the reader's name, never an
	 * edit to the pack. The table shows it; the pack files it; the form below
	 * writes it.
	 */
	const reviews = $derived(
		new Map(
			contentStore
				.of('control-review')
				.flatMap((entry) => {
					const parsed = controlReviewSchema.safeParse(entry.record);
					return parsed.success ? [parsed.data] : [];
				})
				.map((review) => [`${review.mapId}/${review.ref}`, review])
		)
	);
	const reviewWord = (review: ControlReview | undefined): string =>
		review
			? `${review.status} by ${review.by} (${review.reviewedAt.slice(0, 10)})${review.note ? ` — ${review.note}` : ''}`
			: '—';
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
					status: row.status ?? 'reviewed',
					review: reviewWord(reviews.get(`${map.id}/${row.ref}`))
				}
			}))
		)
	);
	let reviewTarget = $state('');
	let reviewStatus = $state<ControlReviewStatus>('reviewed');
	let reviewNote = $state('');
	let reviewSaved = $state('');
	async function saveReview(): Promise<void> {
		const [mapId, ref] = [
			reviewTarget.slice(0, reviewTarget.lastIndexOf('/')),
			reviewTarget.slice(reviewTarget.lastIndexOf('/') + 1)
		];
		if (!mapId || !ref) return;
		const id = localContentId('control-review', controlReviewSlug(mapId, ref));
		const review: ControlReview = {
			id,
			mapId,
			ref,
			status: reviewStatus,
			by: preferences.displayName.trim() || 'the reader',
			note: reviewNote.trim(),
			reviewedAt: new Date().toISOString(),
			schemaVersion: 1
		};
		await contentStore.save({
			id,
			kind: 'control-review',
			title: `${mapId} ${ref}: ${reviewStatus}`,
			record: review,
			savedAt: review.reviewedAt,
			schemaVersion: CONTENT_SCHEMA_VERSION
		});
		reviewSaved = `${ref} ${reviewStatus}.`;
		reviewNote = '';
		// The pack files the review beside the row: rebuild it.
		if (selectedId) await loadPack(selectedId);
	}
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
					<option value={agent.id}>{agentOptionLabel(agent, agents)}</option>
				{/each}
			</select>
		</label>
	</header>

	<!-- The Assurance entry (WP87): is it under control? — over the selected bot. -->
	<Strip label="Is it under control?" icon="lamp" testId="assurance-entry">
		{#each claims as claim (claim.id)}
			<Lamp
				status={claim.ok ? 'pass' : 'inconclusive'}
				label={claim.label}
				testId="assurance-claim-{claim.id}"
			/>
		{/each}
		<Readout label="incidents" value={incidents.length} testId="assurance-entry-incidents" />
		<Readout label="drift flags" value={driftFlags.length} testId="assurance-entry-drift" />
		<Readout label="runs" value={botRuns.length} testId="assurance-entry-runs" />
		{#snippet actions()}
			{#if pack}
				<button type="button" onclick={downloadHtml} data-testid="assurance-entry-download"
					>Download the pack</button
				>
			{/if}
		{/snippet}
	</Strip>

	<section aria-labelledby="register-h" data-testid="assurance-register">
		<h2 id="register-h">Control Effectiveness Register</h2>
		{#if experimentResults.length === 0}
			<p class="status" data-testid="assurance-register-untested">
				<strong>Untested.</strong> No experiment has run here: the register — which controls changed what,
				by how much, and how sure — is folded from stored experiment results, and every control is untested
				until one lands. The pack says so.
			</p>
		{:else}
			<p class="status" data-testid="assurance-register-note">
				{register.filter((row) => row.status === 'evidenced').length} evidenced, {register.filter(
					(row) => row.status === 'inconclusive'
				).length} inconclusive, {register.filter((row) => row.status === 'untested').length} untested
				over
				{experimentResults.length} stored result{experimentResults.length === 1 ? '' : 's'}. A row
				opens the experiment behind it.
			</p>
		{/if}
		<CaseTable
			columns={registerColumns}
			rows={registerRows}
			onRow={openRegisterRow}
			testId="assurance-register-table"
		/>
	</section>

	<section aria-labelledby="coverage-h" data-testid="assurance-coverage">
		<h2 id="coverage-h">Coverage</h2>
		<p class="status" data-testid="assurance-coverage-note">
			The Guardrail Catalogue, edition {coverage.edition}: {coverage.byStatus.shipped} shipped, {coverage
				.byStatus.connectable} connectable, {coverage.byStatus.bespoke} bespoke, {coverage.byStatus
				.blueprint} blueprint, {coverage.byStatus['not-applicable']} not applicable — {coverage.pending}
			of
			{coverage.entries} pending review.
			<a href={resolve('/workshop/catalogue')} data-testid="assurance-open-catalogue"
				>Open the catalogue</a
			>.
		</p>
		<ul class="not-claimed" data-testid="assurance-not-claimed">
			<li><strong>Blueprint only:</strong> {coverage.blueprint.join('; ')}.</li>
			<li><strong>Not applicable to a simulator:</strong> {coverage.notApplicable.join('; ')}.</li>
		</ul>
	</section>

	{#if storedReports.length >= 2}
		<section class="compare" aria-labelledby="compare-h" data-testid="assurance-compare">
			<h2 id="compare-h">Compare two reports</h2>
			<label class="picker">
				A
				<select bind:value={compareA} data-testid="assurance-compare-a">
					<option value="">Choose a report…</option>
					{#each storedReports as row (row.id)}
						<option value={row.id}
							>{row.title} — {row.createdAt.slice(0, 16).replace('T', ' ')}</option
						>
					{/each}
				</select>
			</label>
			<label class="picker">
				B
				<select bind:value={compareB} data-testid="assurance-compare-b">
					<option value="">Choose a report…</option>
					{#each storedReports as row (row.id)}
						<option value={row.id}
							>{row.title} — {row.createdAt.slice(0, 16).replace('T', ' ')}</option
						>
					{/each}
				</select>
			</label>
			{#if compareHref}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() builds the base path; the ?reportA=&reportB= query cannot be attached through its typed surface. -->
				<a href={compareHref} data-testid="assurance-compare-open">Open side by side →</a>
			{/if}
		</section>
	{/if}

	{#if needsName}
		<!-- The principal's name, asked for where it is worth something (UX-3). -->
		<form
			class="name-prompt"
			data-testid="assurance-name-prompt"
			onsubmit={(event) => {
				event.preventDefault();
				saveName();
			}}
		>
			<p>
				Runs started from this browser are recorded as <code>person {shortPrincipalId}…</code> with no
				name. A pack a reviewer reads should say who. Runs already stored keep the id they were written
				with.
			</p>
			<label>
				Your name, on the trace
				<input
					type="text"
					maxlength="60"
					autocomplete="name"
					data-testid="assurance-name-input"
					bind:value={nameDraft}
				/>
			</label>
			<button type="submit" data-testid="assurance-name-save" disabled={nameDraft.trim() === ''}>
				Save to Settings
			</button>
		</form>
	{/if}

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
				<!-- Its own id: the entry strip above already carries `assurance-entry-incidents`, and two of one id is a strict-mode violation the lenses e2e trips over. -->
				<Readout
					label="Incidents"
					value={pack.monitoring.incidents.length}
					testId="assurance-pack-incidents"
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
			{#each pack.development.journeys ?? [] as journey (journey.workflowId)}
				<h3>The {journey.name} journey</h3>
				<JourneyCanvas
					layout={journey.layout}
					testId="assurance-journey-{journey.workflowId.replace('/', '-')}"
				/>
				<ul
					class="points"
					data-testid="assurance-journey-points-{journey.workflowId.replace('/', '-')}"
				>
					{#each journey.layout.points as point (point.id)}
						<li>
							<code>{point.id}</code> — {point.components.length === 0
								? 'nothing fitted'
								: point.components.join(', ')}
						</li>
					{/each}
				</ul>
			{/each}
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
			<form
				class="review"
				aria-label="Review a row"
				data-testid="assurance-review"
				onsubmit={(event) => {
					event.preventDefault();
					void saveReview();
				}}
			>
				<label class="field">
					<span>Row</span>
					<select bind:value={reviewTarget} data-testid="assurance-review-row" required>
						<option value="">choose a row…</option>
						{#each controlRows as row (row.id)}
							<option value={row.id}>{row.cells.map} · {row.cells.ref}</option>
						{/each}
					</select>
				</label>
				<label class="field">
					<span>Verdict</span>
					<select bind:value={reviewStatus} data-testid="assurance-review-status">
						<option value="reviewed">reviewed — the row is relevant as claimed</option>
						<option value="disputed">disputed — the row's claim is questioned</option>
					</select>
				</label>
				<label class="field">
					<span>Note</span>
					<input type="text" bind:value={reviewNote} data-testid="assurance-review-note" />
				</label>
				<button type="submit" data-testid="assurance-review-save">Record the review</button>
				{#if reviewSaved}<span class="hint" data-testid="assurance-review-saved">{reviewSaved}</span
					>{/if}
			</form>
		</section>

		<p class="posture">{pack.posture}</p>
	{/if}
</main>

<style>
	.compare {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--cab-space-3);
	}

	main {
		padding: var(--cab-space-4);
	}
	.name-prompt {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--cab-space-3);
		margin-bottom: var(--cab-space-3);
		padding: var(--cab-space-3);
		background: var(--cab-graph);
		border: var(--cab-border-part) solid var(--cab-engrave);
		border-radius: var(--cab-radius-panel);
	}
	.name-prompt p {
		flex: 1 1 24rem;
		margin: 0;
		font-size: var(--cab-text-sm);
	}
	.name-prompt label {
		display: grid;
		gap: var(--cab-space-1);
		font-size: var(--cab-text-sm);
	}
	.name-prompt input {
		font: inherit;
		padding: var(--cab-space-1) var(--cab-space-2);
		border: var(--cab-border-part) solid var(--cab-engrave);
		border-radius: var(--cab-radius-pill);
		background: var(--cab-cream);
	}
	.name-prompt button {
		font: inherit;
		font-size: var(--cab-text-sm);
		padding: var(--cab-space-1) var(--cab-space-3);
		background: var(--cab-blue);
		color: var(--cab-cream);
		border: var(--cab-border-part) solid var(--cab-blue);
		border-radius: var(--cab-radius-pill);
		cursor: pointer;
	}
	.name-prompt button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.top {
		display: flex;
		align-items: baseline;
		gap: var(--cab-space-4);
		margin-bottom: var(--cab-space-3);
	}
	/* The Workshop's engraved heading (UX-18): the same register as every other screen. */
	h1 {
		margin: 0;
		font-size: var(--cab-text-xl);
		letter-spacing: 0.06em;
		text-transform: uppercase;
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
