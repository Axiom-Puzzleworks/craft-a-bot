<script lang="ts">
	import { resolve } from '$app/paths';
	import { SvelteMap } from 'svelte/reactivity';
	import type {
		EvaluationRecord,
		RunRecord,
		RunSummary,
		StoredCampaignReport,
		StoredWorkflowRun
	} from '@craftabot/core';
	import type { CampaignReport } from '@craftabot/evals';
	import { driftIn, telemetrySeries } from '@craftabot/governance/reports';
	import { validationReport, type ValidationReport } from '@craftabot/metrics/validation';
	import CaseTable from '$lib/components/control-room/CaseTable.svelte';
	import Lamp from '$lib/components/control-room/Lamp.svelte';
	import Meter from '$lib/components/control-room/Meter.svelte';
	import Readout from '$lib/components/control-room/Readout.svelte';
	import Strip from '$lib/components/control-room/Strip.svelte';
	import Tape, { type TapeSeries } from '$lib/components/control-room/Tape.svelte';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import { ensureRunSummaries } from '$lib/state/run-summaries.js';
	import { reportFrom } from '$lib/workshop/campaign-cells.js';
	import {
		agreementOverTime,
		cohortAttributes,
		counterfactualFlips,
		detector,
		driftWorkbench,
		fairnessWorkbench,
		fixed,
		hazardBaseRate,
		lampOfDetector,
		lampOfPsi,
		percent,
		windowOf
	} from '$lib/workshop/model-risk.js';

	/**
	 * **Model risk** (WP88, `79-CONDUCT-AND-MODEL-RISK.md` §4; `64-…` §6.7): the
	 * data scientist's page — the fairness workbench over a stored report's
	 * cells (attribute, window, stratum), the counterfactual flip rate over
	 * the Pipeline's forks, the drift workbench against a reference report
	 * with the telemetry's flags and a detector, rule agreement over time,
	 * the synthetic hazard's base rate, and the validation suite run on
	 * demand. Every number is the fold's call into `@craftabot/metrics`;
	 * this page draws.
	 */
	let storedReports = $state<StoredCampaignReport[]>([]);
	const reports = new SvelteMap<string, CampaignReport>();
	let storedRuns = $state.raw<StoredWorkflowRun[]>([]);
	let runs = $state<RunRecord[]>([]);
	let summaries = $state<Map<string, RunSummary>>(new Map());
	let evaluations = $state<EvaluationRecord[]>([]);
	let selectedId = $state('');
	let referenceId = $state('');
	let across = $state('');
	let stratify = $state('');
	let windowText = $state('');
	let loaded = $state(false);

	$effect(() => {
		void load();
	});
	async function load(): Promise<void> {
		const storage = await appStorage();
		storedReports = (await storage.listCampaignReports()).sort((a, b) =>
			b.createdAt.localeCompare(a.createdAt)
		);
		reports.clear();
		for (const row of storedReports) {
			const report = reportFrom(row);
			if (report) reports.set(row.id, report);
		}
		storedRuns = await storage.listWorkflowRuns();
		runs = await storage.listRuns();
		summaries = await ensureRunSummaries(storage, runs);
		evaluations = await storage.listAllEvaluations();
		if (!selectedId) selectedId = storedReports[0]?.id ?? '';
		loaded = true;
	}

	const report = $derived(reports.get(selectedId));
	const reference = $derived(reports.get(referenceId));
	const attributes = $derived(report ? cohortAttributes(report.cells) : []);
	const attribute = $derived(attributes.includes(across) ? across : (attributes[0] ?? ''));
	const window = $derived(windowOf(windowText));
	const fairness = $derived(
		report && attribute
			? fairnessWorkbench(report, {
					across: attribute,
					window,
					stratify: stratify && attributes.includes(stratify) ? stratify : undefined
				})
			: undefined
	);
	const flips = $derived(counterfactualFlips(storedRuns));
	const drift = $derived(report ? driftWorkbench(report, reference) : []);
	const buckets = $derived(
		telemetrySeries(runs, summaries, { evaluations, reports: [...reports.values()] })
	);
	const driftFlags = $derived(driftIn(buckets));
	const detected = $derived(detector(buckets.map((bucket) => bucket.runs)));
	const runsTape = $derived<TapeSeries[]>([
		{
			id: 'runs',
			label: 'runs per day',
			lane: 'action',
			points: buckets.map((bucket, i) => ({ x: i, y: bucket.runs }))
		}
	]);
	const agreement = $derived(
		attribute
			? agreementOverTime(
					storedReports.flatMap((stored) => {
						const parsed = reports.get(stored.id);
						return parsed ? [{ stored, report: parsed }] : [];
					}),
					attribute
				)
			: []
	);
	const agreementTape = $derived<TapeSeries[]>([
		{
			id: 'agreement',
			label: 'rule-agreement spread',
			lane: 'action',
			points: agreement.flatMap((point, i) =>
				point.value === undefined ? [] : [{ x: i, y: point.value }]
			)
		}
	]);
	const hazard = $derived(report ? hazardBaseRate(report.cells) : undefined);

	const fairnessColumns = [
		{ id: 'metric', label: 'Metric', kind: 'text' as const },
		{ id: 'value', label: 'Value', kind: 'text' as const },
		{ id: 'interval', label: 'Interval', kind: 'text' as const },
		{ id: 'n', label: 'n', kind: 'text' as const },
		{ id: 'note', label: 'Why no reading', kind: 'text' as const }
	];
	const fairnessRows = $derived(
		fairness
			? [...fairness.rows, fairness.matched].map((row) => ({
					id: row.metric,
					cells: {
						metric: row.metric,
						value: fixed(row.result?.value),
						interval: row.result
							? `${fixed(row.result.interval[0])} – ${fixed(row.result.interval[1])}`
							: '—',
						n: row.result
							? Object.entries(row.result.n)
									.map(([group, count]) => `${group}: ${count}`)
									.join(' · ')
							: '—',
						note: row.reason ?? ''
					}
				}))
			: []
	);
	const driftColumns = [
		{ id: 'feature', label: 'Feature', kind: 'text' as const },
		{ id: 'psi', label: 'PSI', kind: 'text' as const },
		{ id: 'flag', label: 'Flag', kind: 'status' as const },
		{ id: 'note', label: 'Note', kind: 'text' as const }
	];
	const driftRows = $derived(
		drift.map((row) => ({
			id: row.feature,
			cells: {
				feature: row.feature,
				psi: fixed(row.psi?.value),
				flag: lampOfPsi(row.psi),
				note: row.reason ?? ''
			}
		}))
	);

	let validation = $state<ValidationReport | undefined>(undefined);
	function runValidation(): void {
		// Small on purpose: the shipped run in docs/metrics.md is the one at full seed count.
		validation = validationReport({ seeds: 20 });
	}
	const validationColumns = [
		{ id: 'family', label: 'Family', kind: 'text' as const },
		{ id: 'metric', label: 'Metric', kind: 'text' as const },
		{ id: 'hand', label: 'Hand', kind: 'status' as const },
		{ id: 'planted', label: 'Planted', kind: 'status' as const },
		{ id: 'null', label: 'Null', kind: 'status' as const },
		{ id: 'rate', label: 'False-alarm rate', kind: 'text' as const }
	];
	const validationRows = $derived(
		(validation?.rows ?? []).map((row) => ({
			id: `${row.family}/${row.metric}`,
			cells: {
				family: row.family,
				metric: row.metric,
				hand: row.hand.ok ? 'pass' : 'fail',
				planted: row.planted.ok ? 'pass' : 'fail',
				null: row.null.ok ? 'pass' : 'fail',
				rate: `${fixed(row.null.rate)} ≤ ${fixed(row.null.bound)}`
			}
		}))
	);
</script>

<svelte:head><title>Model risk — Workshop</title></svelte:head>

<main data-testid="model-risk-page">
	<header class="top">
		<h1>Model risk</h1>
		<label class="picker">
			Report
			<select
				data-testid="model-risk-report-picker"
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
	{:else if !report}
		<p class="status" data-testid="model-risk-empty">
			No campaign report in the store yet. Run a campaign or a book on
			<a href={resolve('/workshop/campaigns')}>Campaigns</a>; its samples land here.
		</p>
	{:else}
		<Strip label="Is it fair, and is it moving?" icon="meter" testId="model-risk-entry">
			<Readout label="samples" value={report.cells.length} testId="model-risk-samples" />
			<Readout label="cohorts" value={fairness?.groups.length ?? 0} testId="model-risk-groups" />
			<Readout label="forks" value={flips.forks} testId="model-risk-forks" />
			<Readout label="drift flags" value={driftFlags.length} testId="model-risk-drift-flags" />
			<Lamp
				status={lampOfDetector(detected)}
				label="Page–Hinkley over runs per day"
				testId="model-risk-detector"
			/>
		</Strip>

		<section aria-labelledby="fairness-h" data-testid="model-risk-fairness">
			<h2 id="fairness-h">Fairness workbench</h2>
			<div class="controls">
				<label class="picker">
					Across
					<select data-testid="model-risk-across" bind:value={across}>
						{#each attributes as name (name)}
							<option value={name}>{name}</option>
						{/each}
					</select>
				</label>
				<label class="picker">
					Stratify by
					<select data-testid="model-risk-stratify" bind:value={stratify}>
						<option value="">—</option>
						{#each attributes.filter((name) => name !== attribute) as name (name)}
							<option value={name}>{name}</option>
						{/each}
					</select>
				</label>
				<label class="picker">
					Window (last n samples)
					<input
						type="number"
						min="1"
						placeholder="all"
						bind:value={windowText}
						data-testid="model-risk-window"
					/>
				</label>
			</div>
			{#if !fairness}
				<p class="muted" data-testid="model-risk-no-cohort">
					This report’s samples carry no cohort — a desk with truth writes one.
				</p>
			{:else}
				<p class="muted">
					{fairness.cases} decided samples across {attribute} ({fairness.groups.join(', ')}); every
					interval at 95%.
				</p>
				<CaseTable
					columns={fairnessColumns}
					rows={fairnessRows}
					testId="model-risk-fairness-table"
				/>
			{/if}
		</section>

		<section aria-labelledby="flips-h" data-testid="model-risk-flips">
			<h2 id="flips-h">Counterfactual flips, by fork</h2>
			{#if flips.result}
				<div class="readouts">
					<Meter
						value={flips.result.value}
						label="flip rate"
						min={0}
						max={1}
						range={[flips.result.interval[0], flips.result.interval[1]]}
						format={percent}
					/>
					<Readout
						label="forks compared"
						value={flips.compared}
						testId="model-risk-flips-compared"
					/>
					<Readout label="changed" value={flips.changed} testId="model-risk-flips-changed" />
				</div>
			{:else}
				<p class="muted" data-testid="model-risk-flips-reason">{flips.reason}</p>
			{/if}
		</section>

		<section aria-labelledby="drift-h" data-testid="model-risk-drift">
			<h2 id="drift-h">Drift workbench</h2>
			<label class="picker">
				Reference report
				<select data-testid="model-risk-reference" bind:value={referenceId}>
					<option value="">Choose a reference…</option>
					{#each storedReports.filter((row) => row.id !== selectedId) as row (row.id)}
						<option value={row.id}
							>{row.title} — {row.createdAt.slice(0, 16).replace('T', ' ')}</option
						>
					{/each}
				</select>
			</label>
			<CaseTable columns={driftColumns} rows={driftRows} testId="model-risk-drift-table" />
			{#if buckets.length > 0}
				<Tape series={runsTape} compact testId="model-risk-runs-tape" />
			{/if}
			{#if driftFlags.length > 0}
				<ul class="flags" data-testid="model-risk-drift-flag-list">
					{#each driftFlags as flag, i (i)}
						<li>{flag.day}: {flag.kind} — {flag.detail}</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section aria-labelledby="agreement-h" data-testid="model-risk-agreement">
			<h2 id="agreement-h">Rule agreement over time</h2>
			<p class="muted">
				The spread of P(decision = verdict) across {attribute || 'the cohort'} per stored report, oldest
				first — the bot’s fairness apart from the policy’s.
			</p>
			{#if agreement.length === 0}
				<p class="muted">No stored report carries {attribute || 'a cohort'}.</p>
			{:else}
				<Tape
					series={agreementTape}
					range={{ min: 0, max: 1 }}
					compact
					testId="model-risk-agreement-tape"
				/>
				<ul class="flags">
					{#each agreement as point (point.reportId)}
						<li>
							{point.createdAt.slice(0, 16).replace('T', ' ')} · {point.title}: {percent(
								point.value
							)}
							(n={point.n})
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section aria-labelledby="hazard-h" data-testid="model-risk-hazard">
			<h2 id="hazard-h">The synthetic hazard</h2>
			{#if hazard}
				<div class="readouts">
					<Readout
						label="base rate"
						value={percent(hazard.value)}
						testId="model-risk-hazard-rate"
					/>
					<Readout label="n" value={hazard.n} />
				</div>
				<p class="muted">
					Band {percent(hazard.interval[0])}–{percent(hazard.interval[1])}. The label is the
					synthetic bank’s own — <em>would not have performed</em>, as the hazard note labels it —
					never a real book’s default rate.
				</p>
			{:else}
				<p class="muted" data-testid="model-risk-hazard-none">
					No sample in this report carries the performance label.
				</p>
			{/if}
		</section>

		<section aria-labelledby="validation-h" data-testid="model-risk-validation">
			<h2 id="validation-h">The validation suite</h2>
			<p class="muted">
				Every metric against a hand count, a planted effect and a null; the shipped run at full seed
				count is in <code>docs/metrics.md</code>. This one runs here at twenty seeds.
			</p>
			<button type="button" onclick={runValidation} data-testid="model-risk-validate">
				Run the suite
			</button>
			{#if validation}
				<p class="muted" data-testid="model-risk-validation-note">
					{validation.rows.length} rows at {validation.seeds} seeds, n={validation.n}; null bound {fixed(
						validation.bound
					)}.
				</p>
				<CaseTable
					columns={validationColumns}
					rows={validationRows}
					testId="model-risk-validation-table"
				/>
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
	.picker {
		display: grid;
		gap: var(--cab-space-1);
		font-size: var(--cab-text-sm);
	}
	.controls,
	.readouts {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--cab-space-3);
		margin-bottom: var(--cab-space-2);
	}
	.status,
	.muted {
		margin: 0;
		font-size: var(--cab-text-sm);
		color: var(--cab-ink-muted);
	}
	.flags {
		margin: var(--cab-space-2) 0 0;
		padding-left: var(--cab-space-4);
		font-size: var(--cab-text-sm);
	}
</style>
