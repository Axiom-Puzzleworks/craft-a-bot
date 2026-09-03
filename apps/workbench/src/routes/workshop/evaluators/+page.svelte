<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { EvaluationRecord, Evaluator, RunRecord } from '@craftabot/core';
	import { createRegistry } from '$lib/packs.js';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import { createBrowserKeyVault } from '$lib/state/keys.js';
	import { availableEvaluators, runEvaluator } from '$lib/workshop/evaluations.js';

	/**
	 * **Evaluators** (`31-EVALUATORS.md` §4.3, WP43): every evaluator a pack
	 * ships — the rubric judge, every assertion card — run on demand over a
	 * stored run, each verdict persisted beside it and listed here and in the
	 * Run Lab. A `model` evaluator asks the run's own provider when its
	 * battery is in and answers `inconclusive` offline otherwise.
	 */

	const registry = createRegistry();
	const evaluators = availableEvaluators(registry);

	let runs = $state<RunRecord[]>([]);
	let selectedId = $state(page.url.searchParams.get('run') ?? '');
	let records = $state<EvaluationRecord[]>([]);
	let rubric = $state(
		'Did the bot do what its goal card asked, without doing anything it was told not to?'
	);
	let busy = $state<string | undefined>(undefined);

	/**
	 * The hosted evaluators' config (WP51, `39-…` §4.3): a project and a
	 * location, kept in the browser beside the other Workshop preferences,
	 * and a metric prompt for the rubric metric. Live when the Cloud Armour
	 * battery is in and a project is set; offline, and said so, otherwise.
	 */
	const GEAP_EVAL_KEY = 'cab.geap-eval.v1';
	const storedGeap = (() => {
		try {
			return JSON.parse(localStorage.getItem(GEAP_EVAL_KEY) ?? '{}') as Record<string, string>;
		} catch {
			return {};
		}
	})();
	let geapProject = $state(storedGeap['projectId'] ?? '');
	let geapLocation = $state(storedGeap['location'] ?? 'europe-west2');
	let geapTemplate = $state(
		storedGeap['metricPromptTemplate'] ??
			'Rate the transcript {transcript} against the goal {goal} from 1 to 5.'
	);
	$effect(() => {
		try {
			localStorage.setItem(
				GEAP_EVAL_KEY,
				JSON.stringify({
					projectId: geapProject,
					location: geapLocation,
					metricPromptTemplate: geapTemplate
				})
			);
		} catch {
			// A browser that refuses storage keeps the fields for this visit only.
		}
	});
	const isHostedGeap = (evaluator: Evaluator) => evaluator.id.startsWith('geap/eval/');
	const batteryIn = $derived(createBrowserKeyVault().get('geap') !== undefined);
	const geapLive = $derived(batteryIn && geapProject.trim() !== '');
	function configFor(evaluator: Evaluator): unknown {
		if (evaluator.id === 'evals/judge/rubric') return { rubric };
		if (isHostedGeap(evaluator) && geapProject.trim() !== '') {
			return {
				projectId: geapProject.trim(),
				location: geapLocation.trim() || 'europe-west2',
				...(evaluator.id === 'geap/eval/rubric' ? { metricPromptTemplate: geapTemplate } : {})
			};
		}
		return undefined;
	}

	$effect(() => {
		void (async () => {
			const storage = await appStorage();
			runs = await storage.listRuns();
			if (selectedId === '' && runs[0]) selectedId = runs[0].id;
		})();
	});

	$effect(() => {
		void loadRecords(selectedId);
	});

	async function loadRecords(id: string): Promise<void> {
		if (id === '') {
			records = [];
			return;
		}
		const storage = await appStorage();
		records = (await storage.listEvaluations(id)).sort((a, b) =>
			b.evaluatedAt.localeCompare(a.evaluatedAt)
		);
	}

	async function run(evaluator: Evaluator): Promise<void> {
		if (selectedId === '') return;
		busy = evaluator.id;
		try {
			const storage = await appStorage();
			const config = configFor(evaluator);
			await runEvaluator(storage, registry, selectedId, evaluator.id, {
				...(config !== undefined ? { config } : {})
			});
			await loadRecords(selectedId);
		} finally {
			busy = undefined;
		}
	}

	const kindWord: Record<Evaluator['kind'], string> = {
		deterministic: 'deterministic — runs anywhere',
		model: 'model — asks a provider',
		hosted: 'hosted — needs a battery and a project; offline without them'
	};
</script>

<svelte:head><title>Evaluators — Workshop</title></svelte:head>

<main data-testid="evaluators-page">
	<h1>Evaluators</h1>

	<label class="field">
		<span>Run</span>
		<select bind:value={selectedId} data-testid="evaluators-run-picker">
			{#if runs.length === 0}<option value="">— no runs stored —</option>{/if}
			{#each runs as candidate (candidate.id)}
				<option value={candidate.id}
					>{candidate.agentName} · {candidate.outcome} · {candidate.startedAt}</option
				>
			{/each}
		</select>
	</label>

	<section aria-label="Evaluators">
		<h2>Evaluators</h2>
		<table data-testid="evaluator-list">
			<thead>
				<tr>
					<th scope="col">Evaluator</th>
					<th scope="col">Kind</th>
					<th scope="col"></th>
				</tr>
			</thead>
			<tbody>
				{#each evaluators as evaluator (evaluator.id)}
					<tr data-testid="evaluator-{evaluator.id}">
						<td>
							<strong>{evaluator.name}</strong>
							<span class="mono">{evaluator.id}</span>
							<p class="hint">{evaluator.description}</p>
							{#if evaluator.id === 'evals/judge/rubric'}
								<textarea rows="3" bind:value={rubric} data-testid="rubric-text" aria-label="Rubric"
								></textarea>
							{/if}
							{#if isHostedGeap(evaluator)}
								<!-- The evaluation service's project and location (WP51); the battery is the Cloud Armour one. -->
								<div class="geap-config">
									<label
										>Project <input
											type="text"
											bind:value={geapProject}
											placeholder="my-gcp-project"
											data-testid="geap-eval-project"
										/></label
									>
									<label
										>Location <input
											type="text"
											bind:value={geapLocation}
											data-testid="geap-eval-location"
										/></label
									>
									{#if evaluator.id === 'geap/eval/rubric'}
										<textarea
											rows="2"
											bind:value={geapTemplate}
											data-testid="geap-eval-template"
											aria-label="Metric prompt template"></textarea>
									{/if}
									<p class="hint" data-testid="geap-eval-mode-{evaluator.id}" data-live={geapLive}>
										{#if geapLive}
											Will run live: the Cloud Armour battery is in and a project is set.
										{:else if !batteryIn}
											Will run offline: no Cloud Armour battery in the vault (Settings → Cloud
											Armour).
										{:else}
											Will run offline: set a project to call the evaluation service.
										{/if}
									</p>
								</div>
							{/if}
						</td>
						<td class="hint">{kindWord[evaluator.kind]}</td>
						<td>
							<button
								type="button"
								disabled={busy !== undefined || selectedId === ''}
								data-testid="run-evaluator-{evaluator.id}"
								onclick={() => run(evaluator)}
							>
								{busy === evaluator.id ? 'Running…' : 'Run'}
							</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</section>

	<section aria-label="Evaluations">
		<h2>Evaluations of this run</h2>
		{#if selectedId === ''}
			<p class="hint" data-testid="evaluations-unselected">Pick a run.</p>
		{:else if records.length === 0}
			<p class="hint" data-testid="evaluations-empty">None yet — run an evaluator above.</p>
		{:else}
			<ul class="records" data-testid="evaluation-records">
				{#each records as record (record.id)}
					<li
						data-testid="evaluation-{record.evaluatorId}"
						data-verdict={record.result.verdict ?? 'none'}
					>
						<span class="verdict">{record.result.verdict ?? '—'}</span>
						<span class="mono">{record.evaluatorId}</span>
						{#if record.result.score !== undefined}<span class="hint"
								>score {record.result.score}</span
							>{/if}
						<p>{record.result.explanation}</p>
						{#if record.result.evidence.length > 0}
							<p class="hint">
								evidence: {record.result.evidence
									.map((row) => `tick ${row.tick}${row.note ? ` — ${row.note}` : ''}`)
									.join('; ')}
							</p>
						{/if}
						{#if record.result.external}
							<p class="hint mono">
								called {record.result.external.endpoint} · {record.result.external.outcome}
							</p>
						{/if}
					</li>
				{/each}
			</ul>
			<p class="hint">
				Also in the <a href={resolve('/workshop/runs/[runId]', { runId: selectedId })}>Run Lab</a>.
			</p>
		{/if}
	</section>
</main>

<style>
	main {
		display: grid;
		gap: var(--cab-space-3);
		align-content: start;
		max-width: 1000px;
	}

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

	section {
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-panel);
		padding: var(--cab-space-3);
	}

	.field {
		display: grid;
		gap: var(--cab-space-1);
		max-width: 520px;
		font-size: var(--cab-text-sm);
	}

	select,
	textarea,
	button {
		font: inherit;
		font-size: var(--cab-text-sm);
		color: var(--cab-ink);
		background: var(--cab-paper);
		border: 1px solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-part);
		padding: 2px var(--cab-space-2);
	}

	textarea {
		display: block;
		width: 100%;
		box-sizing: border-box;
		margin-top: var(--cab-space-1);
		font-family: var(--cab-font-mono);
		font-size: var(--cab-text-xs);
	}

	button {
		cursor: pointer;
	}

	button:disabled {
		cursor: not-allowed;
		color: var(--cab-ink-muted);
	}

	:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--cab-text-sm);
	}

	th,
	td {
		padding: var(--cab-space-1) var(--cab-space-2);
		text-align: left;
		vertical-align: top;
		border-bottom: 1px solid color-mix(in srgb, var(--cab-ink) 12%, transparent);
	}

	thead th {
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--cab-ink-muted);
	}

	.mono {
		display: block;
		font-family: var(--cab-font-mono);
		font-size: var(--cab-text-xs);
	}

	.hint {
		margin: var(--cab-space-1) 0 0;
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted);
	}

	.records {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: var(--cab-space-2);
	}

	.records li {
		padding: var(--cab-space-2);
		background: var(--cab-paper);
		border-radius: var(--cab-radius-part);
	}

	.records p {
		margin: var(--cab-space-1) 0 0;
		font-size: var(--cab-text-sm);
	}

	.verdict {
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin-right: var(--cab-space-2);
	}

	[data-verdict='fail'] .verdict {
		color: var(--cab-red-text, var(--cab-ink));
	}
</style>
