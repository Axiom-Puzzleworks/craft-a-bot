<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { StoredCampaignReport, WorkflowSpec } from '@craftabot/core';
	import type { CampaignReport } from '@craftabot/evals';
	import CaseTable from '$lib/components/control-room/CaseTable.svelte';
	import Lamp from '$lib/components/control-room/Lamp.svelte';
	import Matrix from '$lib/components/control-room/Matrix.svelte';
	import Readout from '$lib/components/control-room/Readout.svelte';
	import Strip from '$lib/components/control-room/Strip.svelte';
	import { statusOfOutcome } from '$lib/control-room/outcome.js';
	import { createRegistry } from '$lib/packs.js';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import { reportFrom } from '$lib/workshop/campaign-cells.js';
	import {
		band,
		conductFold,
		lampOf,
		percent,
		slugOf,
		vulnerabilityCellOf,
		workflowIdOfCell,
		type ConductCase
	} from '$lib/workshop/conduct.js';

	/**
	 * **Conduct** (WP88, `79-CONDUCT-AND-MODEL-RISK.md` §3; `64-…` §6.7): the
	 * compliance reviewer's page over one stored campaign report — the
	 * Consumer Duty's four outcomes first, each with the report's own
	 * obligation row and the customers behind it; vulnerability recognised ×
	 * acted on; DISP, tipping-off and KYC as lamps. Every number is the
	 * report's row or the fold's call into `@craftabot/metrics`; this page
	 * draws. A customer's row opens the Pipeline at the governing stage.
	 */
	const registry = createRegistry();
	const workflows = new Map<string, WorkflowSpec>(
		registry.listWorkflows().map((workflow) => [workflow.id, workflow])
	);

	let storedReports = $state<StoredCampaignReport[]>([]);
	let selectedId = $state('');
	let loaded = $state(false);

	$effect(() => {
		void load();
	});
	async function load(): Promise<void> {
		const storage = await appStorage();
		storedReports = (await storage.listCampaignReports()).sort((a, b) =>
			b.createdAt.localeCompare(a.createdAt)
		);
		if (!selectedId) selectedId = storedReports[0]?.id ?? '';
		loaded = true;
	}

	const stored = $derived(storedReports.find((row) => row.id === selectedId));
	const report = $derived<CampaignReport | undefined>(stored ? reportFrom(stored) : undefined);
	const fold = $derived(
		report
			? conductFold(report, workflows, {
					workflowIdOfCell: (cell) => workflowIdOfCell(cell, workflows)
				})
			: undefined
	);
	const outcomes = $derived(fold?.outcomes.filter((outcome) => outcome.consumerDuty) ?? []);
	const others = $derived(fold?.outcomes.filter((outcome) => !outcome.consumerDuty) ?? []);

	const caseColumns = [
		{ id: 'customer', label: 'Customer', kind: 'text' as const },
		{ id: 'build', label: 'Build', kind: 'text' as const },
		{ id: 'outcome', label: 'Outcome', kind: 'status' as const },
		{ id: 'failed', label: 'Checks failed', kind: 'text' as const },
		{ id: 'stage', label: 'Governing stage', kind: 'text' as const }
	];
	const caseRows = (cases: ConductCase[]) =>
		cases.map((entry) => ({
			id: entry.cellId,
			cells: {
				customer: entry.itemId ?? entry.scenario,
				build: entry.build,
				outcome: statusOfOutcome(entry.outcome),
				failed: entry.failed.length === 0 ? '—' : entry.failed.join(', '),
				stage: entry.stageId ?? '—'
			}
		}));

	/** The Pipeline at the governing stage when the cell ran a workflow; the Run Lab otherwise. */
	function open(cases: ConductCase[], rowId: string): void {
		const entry = cases.find((row) => row.cellId === rowId);
		if (!entry) return;
		if (entry.workflowRunId) {
			const base = resolve('/workshop/workflows/[runId]', { runId: entry.workflowRunId });
			const target = entry.stageId ? `${base}?stage=${encodeURIComponent(entry.stageId)}` : base;
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() builds the base path; the ?stage= query cannot be attached through its typed surface (the same exception the Pipeline's what-if takes).
			void goto(target);
		} else if (entry.runId) {
			void goto(resolve('/workshop/runs/[runId]', { runId: entry.runId }));
		}
	}

	const vulnerabilityRows = [
		{ id: 'recognised', label: 'Recognised' },
		{ id: 'not-recognised', label: 'Not recognised' }
	];
	const vulnerabilityCols = [
		{ id: 'acted', label: 'Acted on' },
		{ id: 'missed', label: 'Not acted on' }
	];
</script>

<svelte:head><title>Conduct — Workshop</title></svelte:head>

<main data-testid="conduct-page">
	<header class="top">
		<h1>Conduct</h1>
		<label class="picker">
			Report
			<select
				data-testid="conduct-report-picker"
				value={selectedId}
				onchange={(e) => (selectedId = e.currentTarget.value)}
			>
				<option value="">Choose a report…</option>
				{#each storedReports as row (row.id)}
					<option value={row.id}
						>{row.title} — {row.createdAt.slice(0, 16).replace('T', ' ')}</option
					>
				{/each}
			</select>
		</label>
	</header>

	{#if !loaded}
		<p class="status">Loading…</p>
	{:else if !report || !fold}
		<p class="status" data-testid="conduct-empty">
			No campaign report in the store yet. Run a campaign or a book on
			<a href={resolve('/workshop/campaigns')}>Campaigns</a>; its report lands here, read as the
			compliance reviewer reads it.
		</p>
	{:else}
		<Strip label="Were customers treated as the rules require?" icon="lamp" testId="conduct-entry">
			<Readout label="customers" value={report.cells.length} testId="conduct-customers" />
			<Lamp
				status={lampOf(fold.tippingOff)}
				label="no tipping-off"
				testId="conduct-lamp-tipping-off"
			/>
			<Lamp status={lampOf(fold.kyc)} label="KYC before action" testId="conduct-lamp-kyc" />
			{#each fold.disp as row (row.evaluatorId)}
				<Lamp
					status={lampOf(row.rate)}
					label="DISP · {row.evaluatorId.split('/').pop()}"
					testId="conduct-lamp-disp-{slugOf(row.evaluatorId.split('/').pop() ?? row.evaluatorId)}"
				/>
			{/each}
		</Strip>
		<p class="note">
			Tipping-off {percent(fold.tippingOff?.value)}
			{band(fold.tippingOff)} · KYC {percent(fold.kyc?.value)}
			{band(fold.kyc)}
			{#each fold.disp as row (row.evaluatorId)}
				· {row.evaluatorId.split('/').pop()} {percent(row.rate.value)} {band(row.rate)}
			{/each}
			— the pass rate over the customers each check applied to, with its Wilson band. Relevance, never
			compliance.
		</p>

		<section aria-labelledby="outcomes-h" data-testid="conduct-outcomes">
			<h2 id="outcomes-h">The four outcomes</h2>
			{#each outcomes as outcome (outcome.tag)}
				<article class="outcome" data-testid="conduct-outcome-{slugOf(outcome.tag)}">
					<h3>{outcome.tag}</h3>
					<p class="muted">{outcome.gloss}</p>
					<div class="readouts">
						<Readout label="customers" value={outcome.row?.cells ?? outcome.cases.length} />
						<Readout
							label="success"
							value={percent(outcome.row?.successRate)}
							testId="conduct-success-{slugOf(outcome.tag)}"
						/>
						<Readout
							label="failing"
							value={outcome.failing}
							testId="conduct-failing-{slugOf(outcome.tag)}"
						/>
					</div>
					{#if outcome.cases.length === 0}
						<p class="muted">No customer in this report was held to this outcome.</p>
					{:else}
						<CaseTable
							columns={caseColumns}
							rows={caseRows(outcome.cases)}
							onRow={(rowId) => open(outcome.cases, rowId)}
							testId="conduct-cases-{slugOf(outcome.tag)}"
						/>
					{/if}
				</article>
			{/each}
		</section>

		<section aria-labelledby="vulnerability-h">
			<h2 id="vulnerability-h">Vulnerability: recognised × acted on</h2>
			<p class="muted">
				Over the customers the vulnerability check judged ({fold.vulnerability.total}); a case that
				disclosed nothing counts as not recognised.
			</p>
			<Matrix
				corner="customers"
				rows={vulnerabilityRows}
				cols={vulnerabilityCols}
				cell={(rowId, colId) => vulnerabilityCellOf(fold.vulnerability, rowId, colId)}
				testId="conduct-vulnerability"
			/>
		</section>

		{#if others.length > 0}
			<section aria-labelledby="others-h" data-testid="conduct-others">
				<h2 id="others-h">Every other obligation this report carries</h2>
				{#each others as outcome (outcome.tag)}
					<article class="outcome" data-testid="conduct-outcome-{slugOf(outcome.tag)}">
						<h3>{outcome.tag}</h3>
						<p class="muted">{outcome.gloss}</p>
						<div class="readouts">
							<Readout label="customers" value={outcome.row?.cells ?? outcome.cases.length} />
							<Readout label="success" value={percent(outcome.row?.successRate)} />
							<Readout label="failing" value={outcome.failing} />
						</div>
						<CaseTable
							columns={caseColumns}
							rows={caseRows(outcome.cases)}
							onRow={(rowId) => open(outcome.cases, rowId)}
							testId="conduct-cases-{slugOf(outcome.tag)}"
						/>
					</article>
				{/each}
			</section>
		{/if}
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
		flex-wrap: wrap;
		align-items: end;
		justify-content: space-between;
		gap: var(--cab-space-3);
	}
	h1 {
		margin: 0;
		font-size: var(--cab-text-xl);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	h2 {
		margin: 0 0 var(--cab-space-2);
		font-size: var(--cab-text-md);
	}
	h3 {
		margin: 0;
		font-size: var(--cab-text-sm);
		font-family: var(--cab-font-mono);
	}
	.picker {
		display: grid;
		gap: var(--cab-space-1);
		font-size: var(--cab-text-sm);
	}
	.status,
	.note,
	.muted {
		margin: 0;
		font-size: var(--cab-text-sm);
		color: var(--cab-ink-muted);
	}
	.outcome {
		display: grid;
		gap: var(--cab-space-2);
		padding: var(--cab-space-3);
		margin-bottom: var(--cab-space-3);
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-panel);
	}
	.readouts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-3);
	}
</style>
