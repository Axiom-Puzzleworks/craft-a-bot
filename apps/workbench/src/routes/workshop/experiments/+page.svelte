<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ExperimentResult, StoredCampaignReport } from '@craftabot/core';
	import { analyseExperiment, expandExperiment, type Experiment } from '@craftabot/evals';
	import Lamp from '$lib/components/control-room/Lamp.svelte';
	import Matrix from '$lib/components/control-room/Matrix.svelte';
	import Readout from '$lib/components/control-room/Readout.svelte';
	import Strip from '$lib/components/control-room/Strip.svelte';
	import { createRegistry } from '$lib/packs.js';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import { campaignRunner } from '$lib/state/campaign-runner-app.svelte.js';
	import { isoAt } from '$lib/workshop/pipeline.js';
	import {
		bandText,
		deltaText,
		designFor,
		effectMatrix,
		levelsFor,
		metricChoicesFor,
		metricIdsOf,
		reportsFor,
		runIdsOf,
		seedsOf,
		verdictLamp,
		type AuthorAxis
	} from '$lib/workshop/experiments.js';

	/**
	 * **Experiments** (WP89, `72-EXPERIMENTS.md` §5; `64-…` §6.8.1): author a
	 * design over a book — one factor, its levels and baseline, the metrics
	 * the pack answers — see it as the file it is, queue its campaigns on the
	 * runner, and when every report has landed read the result: one Matrix
	 * per metric (treatment levels × all cases and the cohort slices, the
	 * delta with its band), the verdict as a Lamp with the power note, every
	 * run behind it opening the Run Lab. Stored results reopen from the list.
	 * Every number is the result's own; this page draws.
	 */
	const registry = createRegistry();
	const workflows = registry.listWorkflows().filter((workflow) => workflow.book !== undefined);

	let workflowId = $state(
		workflows.find((workflow) => workflow.id === 'fs-lending/lending')?.id ?? workflows[0]?.id ?? ''
	);
	let axis = $state<AuthorAxis>('executors');
	let knob = $state('referRatioPercent');
	let knobLevels = $state('40, 55');
	let picked = $state<string[]>([]);
	let baseline = $state('');
	let metricIds = $state<string[]>(['success', 'tokens']);
	let title = $state('');
	let hypothesis = $state('');
	let seed = $state(1);
	let size = $state(60);
	let note = $state('');

	const workflow = $derived(workflows.find((entry) => entry.id === workflowId));
	const offered = $derived(workflow ? levelsFor(axis, workflow) : []);
	const levels = $derived(
		axis === 'knob'
			? knobLevels
					.split(',')
					.map((entry) => entry.trim())
					.filter((entry) => entry !== '')
			: picked.filter((level) => offered.includes(level)).length >= 2
				? picked.filter((level) => offered.includes(level))
				: offered
	);
	const baselineLevel = $derived(levels.includes(baseline) ? baseline : (levels[0] ?? ''));
	const choices = $derived(workflow ? metricChoicesFor(workflow, registry) : []);
	const metrics = $derived(
		choices.filter((choice) => metricIds.includes(choice.id)).map((choice) => choice.metric)
	);
	const design = $derived.by(() => {
		if (!workflow || levels.length < 2 || metrics.length === 0) return undefined;
		try {
			return designFor(
				{
					workflowId: workflow.id,
					title,
					hypothesis,
					axis,
					knob: axis === 'knob' ? knob.trim() : undefined,
					levels,
					baseline: baselineLevel,
					metrics,
					seed: Number(seed) || 1,
					size: Number(size) || 1
				},
				registry
			);
		} catch (error) {
			note = error instanceof Error ? error.message : String(error);
			return undefined;
		}
	});
	const designText = $derived(design ? JSON.stringify(design, null, '\t') : '');
	const expanded = $derived(design ? expandExperiment(design) : undefined);

	function toggleLevel(level: string): void {
		picked = picked.includes(level)
			? picked.filter((entry) => entry !== level)
			: [...picked, level];
	}
	function toggleMetric(id: string): void {
		metricIds = metricIds.includes(id)
			? metricIds.filter((entry) => entry !== id)
			: [...metricIds, id];
	}

	// ---- the run ------------------------------------------------------------
	/** The design whose campaigns are on the runner, with the queue ids to watch. */
	let pending = $state.raw<{ experiment: Experiment; queued: string[] } | undefined>(undefined);
	let results = $state.raw<ExperimentResult[]>([]);
	let selectedId = $state('');
	let loaded = $state(false);
	let analysing = false;

	$effect(() => {
		void loadResults();
	});
	async function loadResults(): Promise<void> {
		const storage = await appStorage();
		results = await storage.listExperimentResults();
		if (!selectedId) selectedId = results[0]?.id ?? '';
		loaded = true;
	}

	function runExperiment(): void {
		if (!expanded) return;
		const queued: string[] = [];
		for (const campaign of expanded.campaigns) {
			const entry = campaignRunner.enqueue(campaign);
			if (typeof entry === 'string') {
				note = entry;
				return;
			}
			queued.push(entry.id);
		}
		pending = { experiment: expanded.experiment, queued };
		note = `${expanded.campaigns.length} campaigns queued, ${seedsOf(expanded.campaigns)} seed(s) each; the result lands when every report has.`;
	}

	// When every queued campaign of the pending design is done, fold the stored reports into a result.
	$effect(() => {
		const watched = pending;
		if (!watched) return;
		const entries = campaignRunner.queue.filter((entry) => watched.queued.includes(entry.id));
		if (entries.length < watched.queued.length) return;
		if (entries.some((entry) => entry.status === 'queued' || entry.status === 'running')) return;
		if (entries.some((entry) => entry.status !== 'done')) {
			note = 'a campaign of the design did not finish; the result waits for a full run.';
			pending = undefined;
			return;
		}
		void analyse(watched.experiment);
	});
	async function analyse(experiment: Experiment): Promise<void> {
		if (analysing) return;
		analysing = true;
		try {
			const storage = await appStorage();
			const stored: StoredCampaignReport[] = await storage.listCampaignReports();
			const reports = reportsFor(experiment, stored);
			const result = analyseExperiment(experiment, reports, { ranAt: isoAt(Date.now()) });
			await storage.putExperimentResult(result);
			pending = undefined;
			await loadResults();
			selectedId = result.id;
			note = `${result.verdict}: ${result.note}`;
		} finally {
			analysing = false;
		}
	}

	const result = $derived(results.find((entry) => entry.id === selectedId));
	const running = $derived(campaignRunner.running);
	const progress = $derived(campaignRunner.progress);
</script>

<svelte:head><title>Experiments — Workshop</title></svelte:head>

<main data-testid="experiments-page">
	<header class="top">
		<h1>Experiments</h1>
		{#if results.length > 0}
			<label class="picker">
				Result
				<select
					data-testid="experiment-result-picker"
					value={selectedId}
					onchange={(e) => (selectedId = e.currentTarget.value)}
				>
					{#each results as row (row.id)}
						<option value={row.id}>{row.title} — {row.ranAt.slice(0, 16).replace('T', ' ')}</option>
					{/each}
				</select>
			</label>
		{/if}
	</header>

	<section class="author" aria-labelledby="author-h" data-testid="experiment-author">
		<h2 id="author-h">Design an experiment</h2>
		<p class="muted">
			One factor over a book: its levels, the baseline, and the metrics the pack answers. The design
			is a file; every level combination is a campaign the runner queues; the result is the
			difference each level makes against the baseline, with its interval and n — never a pass or
			fail.
		</p>
		<div class="row">
			<label class="picker">
				Workflow
				<select data-testid="experiment-workflow" bind:value={workflowId}>
					{#each workflows as entry (entry.id)}
						<option value={entry.id}>{entry.name}</option>
					{/each}
				</select>
			</label>
			<label class="picker">
				Factor
				<select data-testid="experiment-axis" bind:value={axis}>
					<option value="executors">executors (the configurations)</option>
					<option value="knob">a knob of the world</option>
					<option value="context">the context rung</option>
				</select>
			</label>
			{#if axis === 'knob'}
				<label class="picker">
					Knob
					<input data-testid="experiment-knob" bind:value={knob} />
				</label>
				<label class="picker">
					Values
					<input data-testid="experiment-knob-levels" bind:value={knobLevels} />
				</label>
			{/if}
			<label class="picker">
				Seed
				<input type="number" min="1" data-testid="experiment-seed" bind:value={seed} />
			</label>
			<label class="picker">
				Customers
				<input type="number" min="1" data-testid="experiment-size" bind:value={size} />
			</label>
		</div>
		{#if axis !== 'knob'}
			<fieldset class="levels">
				<legend>Levels (every one when none is ticked)</legend>
				{#each offered as level (level)}
					<label>
						<input
							type="checkbox"
							checked={picked.includes(level)}
							onchange={() => toggleLevel(level)}
							data-testid="experiment-level-{level}"
						/>
						{level}
					</label>
				{/each}
			</fieldset>
		{/if}
		<div class="row">
			<label class="picker">
				Baseline
				<select data-testid="experiment-baseline" bind:value={baseline}>
					{#each levels as level (level)}
						<option value={level}>{level}</option>
					{/each}
				</select>
			</label>
			<label class="picker wide">
				Title
				<input data-testid="experiment-title" bind:value={title} placeholder="named for the file" />
			</label>
			<label class="picker wide">
				Hypothesis (pre-registered)
				<input
					data-testid="experiment-hypothesis"
					bind:value={hypothesis}
					placeholder="one sentence"
				/>
			</label>
		</div>
		<fieldset class="levels">
			<legend>Metrics</legend>
			{#each choices as choice (choice.id)}
				<label>
					<input
						type="checkbox"
						checked={metricIds.includes(choice.id)}
						onchange={() => toggleMetric(choice.id)}
						data-testid="experiment-metric-{choice.id.replace(/[^a-z0-9]+/gi, '-')}"
					/>
					{choice.label}
				</label>
			{/each}
		</fieldset>
		<div class="row">
			<button
				type="button"
				onclick={runExperiment}
				disabled={!expanded || pending !== undefined}
				data-testid="run-experiment"
			>
				{running ? 'Queue the experiment' : 'Run the experiment'}
			</button>
			{#if expanded}
				<span class="hint" data-testid="experiment-expansion"
					>{expanded.campaigns.length} campaigns, sharing seeds</span
				>
			{/if}
			{#if pending}
				<span class="hint" data-testid="experiment-pending"
					>running {progress.done} / {progress.total} of the current campaign…</span
				>
			{/if}
			{#if note}<span class="hint" data-testid="experiment-note">{note}</span>{/if}
		</div>
		<details>
			<summary>The design as a file</summary>
			<pre data-testid="experiment-design">{designText}</pre>
		</details>
	</section>

	{#if !loaded}
		<p class="status">Loading…</p>
	{:else if !result}
		<p class="status" data-testid="experiments-empty">No experiment has run here yet.</p>
	{:else}
		<section aria-labelledby="result-h" data-testid="experiment-result">
			<Strip label={result.title} icon="meter" testId="experiment-strip">
				<Lamp
					status={verdictLamp(result.verdict)}
					label={result.verdict}
					testId="experiment-verdict"
				/>
				<Readout label="effects" value={result.effects.length} testId="experiment-effects" />
				<Readout label="campaigns" value={result.campaignIds.length} />
				<Readout label="runs" value={runIdsOf(result).length} testId="experiment-runs" />
			</Strip>
			<p class="muted" data-testid="experiment-hypothesis-line">
				<strong>Hypothesis.</strong>
				{result.hypothesis}
			</p>
			<p class="muted" data-testid="experiment-result-note">{result.note}</p>
			{#each metricIdsOf(result) as metricId (metricId)}
				{@const matrix = effectMatrix(result, metricId)}
				<article
					class="metric"
					data-testid="experiment-result-metric-{metricId.replace(/[^a-z0-9]+/gi, '-')}"
				>
					<h3>{metricId}</h3>
					<Matrix
						corner="treatment vs baseline"
						rows={matrix.rows}
						cols={matrix.cols}
						cell={matrix.cell}
						testId="experiment-matrix-{metricId.replace(/[^a-z0-9]+/gi, '-')}"
					/>
					<ul class="effects">
						{#each result.effects.filter((effect) => effect.metricId === metricId) as effect (effect.factor.treatment)}
							<li>
								<strong>{effect.factor.treatment}</strong> vs {effect.factor.baseline}: {deltaText(
									effect,
									effect.delta
								)}
								({bandText(effect, effect.interval)}; n {effect.baseline.n} / {effect.treatment.n};
								{#if effect.p !== undefined}p {effect.p.toFixed(3)};
								{/if}{effect.method}{effect.underpowered ? '; underpowered' : ''}). Cost: tokens {effect.cost.tokensPerCase.baseline.toFixed(
									0
								)} → {effect.cost.tokensPerCase.treatment.toFixed(0)} per case, approvals {effect.cost.approvalsPerCase.baseline.toFixed(
									2
								)} → {effect.cost.approvalsPerCase.treatment.toFixed(2)}.
							</li>
						{/each}
					</ul>
				</article>
			{/each}
			<details>
				<summary>Every run behind this result</summary>
				<ul class="runs" data-testid="experiment-run-list">
					{#each runIdsOf(result) as runId (runId)}
						<li><a href={resolve('/workshop/runs/[runId]', { runId })}>{runId.slice(0, 8)}</a></li>
					{/each}
				</ul>
			</details>
			<p class="muted">
				Evidence about this synthetic bank under these configurations, and nothing else. Digest
				<code>{result.digest.slice(0, 16)}…</code>.
			</p>
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
	h3 {
		margin: 0;
		font-size: var(--cab-text-sm);
		font-family: var(--cab-font-mono);
	}
	.author {
		display: grid;
		gap: var(--cab-space-3);
		padding: var(--cab-space-3);
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-panel);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--cab-space-3);
	}
	.picker {
		display: grid;
		gap: var(--cab-space-1);
		font-size: var(--cab-text-sm);
	}
	.picker.wide {
		flex: 1 1 18rem;
	}
	.levels {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-3);
		margin: 0;
		padding: var(--cab-space-2) var(--cab-space-3);
		border: var(--cab-border-part) solid var(--cab-engrave);
		border-radius: var(--cab-radius-panel);
		font-size: var(--cab-text-sm);
	}
	.status,
	.muted,
	.hint {
		margin: 0;
		font-size: var(--cab-text-sm);
		color: var(--cab-ink-muted);
	}
	.metric {
		display: grid;
		gap: var(--cab-space-2);
		margin-bottom: var(--cab-space-3);
	}
	.effects,
	.runs {
		margin: 0;
		padding-left: var(--cab-space-4);
		font-size: var(--cab-text-sm);
	}
	pre {
		max-height: 24rem;
		overflow: auto;
		font-size: var(--cab-text-xs);
	}
</style>
