<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		contextSpecFor,
		type ContextSpec,
		type StageRecord,
		type StoredWorkflowRun,
		type WorkflowSpec
	} from '@craftabot/core';
	import { workflowRing } from '@craftabot/governance/reports';
	import Boundary from '$lib/components/control-room/Boundary.svelte';
	import CaseFile from '$lib/components/control-room/CaseFile.svelte';
	import Lamp from '$lib/components/control-room/Lamp.svelte';
	import Readout from '$lib/components/control-room/Readout.svelte';
	import Roundel from '$lib/components/control-room/Roundel.svelte';
	import Strip from '$lib/components/control-room/Strip.svelte';
	import { createRegistry } from '$lib/packs.js';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import { whatIf } from '$lib/state/what-if-app.svelte.js';
	import { boundaryFor } from '$lib/workshop/boundary.js';
	import {
		EXECUTOR_ICON,
		describeExecutor,
		executorChoices,
		paneRecords,
		stageNameOf,
		statusOfStage
	} from '$lib/workshop/pipeline.js';
	import { specFor } from '@craftabot/evals';

	/**
	 * **The Pipeline** (WP86, `77-PIPELINE-AND-BOUNDARY.md` §4; `64-…` §6.2.4):
	 * one workflow run as a rail of stage cards — the executor as a roundel,
	 * the status as a lamp, the duration, the guard tally — and beneath the
	 * selected stage two panes, *In* and *Out*, on the case file. A bot
	 * stage opens the Run Lab at the stage's first tick. The **What if**
	 * drawer re-runs from a stage under one change and opens the result
	 * beside the original, the rails synchronised on the selected stage.
	 * The Boundary map beneath draws the workflow's ring lit by this run.
	 */
	const registry = createRegistry();
	const specs = new Map<string, WorkflowSpec>(
		registry.listWorkflows().map((workflow) => [workflow.id, workflow])
	);

	const runId = $derived(page.params.runId ?? '');
	const againstId = $derived(page.url.searchParams.get('against') ?? '');

	// Raw, not deep: the run and its item cross to the Worker for a what-if, and a deep-state proxy cannot be structured-cloned.
	let stored = $state.raw<StoredWorkflowRun | undefined>(undefined);
	let against = $state.raw<StoredWorkflowRun | undefined>(undefined);
	let storedRunIds = $state<string[]>([]);
	let loaded = $state(false);
	let selected = $state<string | undefined>(undefined);

	$effect(() => {
		void load(runId, againstId);
	});

	async function load(id: string, other: string): Promise<void> {
		const storage = await appStorage();
		stored = await storage.getWorkflowRun(id);
		against = other ? await storage.getWorkflowRun(other) : undefined;
		const ids: string[] = [];
		for (const entry of [stored, against]) {
			for (const stage of entry?.run.stages ?? []) {
				if (stage.runId && (await storage.getRun(stage.runId))) ids.push(stage.runId);
			}
		}
		storedRunIds = ids;
		// The Conduct lens opens the Pipeline at the governing stage (WP88, `79-…` §3): `?stage=` when the run has it.
		const asked = page.url.searchParams.get('stage') ?? '';
		selected ??=
			stored?.run.stages.find((entry) => entry.stageId === asked)?.stageId ??
			stored?.run.stages[0]?.stageId;
		loaded = true;
	}

	const spec = $derived(stored ? specs.get(stored.run.workflowId) : undefined);
	const stage = $derived(stored?.run.stages.find((entry) => entry.stageId === selected));
	const otherStage = $derived(against?.run.stages.find((entry) => entry.stageId === selected));
	const stageName = (stageId: string) => stageNameOf(spec, stageId);

	/** The Boundary map: the desk's bot as the campaign seats it, the run's ring over it. */
	const map = $derived.by(() => {
		if (!stored || !spec) return undefined;
		const world = registry.getWorld(spec.worldId);
		// The desk's own card, so the map draws the desk and its lines around the bot the journey seats.
		const card = registry.listGoalCards().find((entry) => entry.worldId === spec.worldId);
		const botSpec = specFor({
			scenario: {
				id: 'pipeline',
				goalCardId: card?.id ?? spec.id,
				tags: [],
				injections: [],
				fit: []
			},
			build: {
				id: stored.source?.build ?? 'pipeline',
				base: { kind: 'starter-default' },
				overrides: {
					senses: (world?.senses ?? []).map((sense) => sense.id),
					actions: (world?.actions ?? []).map((action) => action.id)
				}
			},
			guard: { id: 'none', fit: [] }
		});
		return boundaryFor(botSpec, registry, undefined, undefined, [
			workflowRing(spec, { run: stored.run })
		]);
	});

	// ── What if ──────────────────────────────────────────────────────────
	let drawerOpen = $state(false);
	let choice = $state('default');
	let knobKey = $state('');
	let knobValue = $state('');
	let contextRung = $state<'' | ContextSpec['level']>('');
	let configuration = $state('');
	const choices = $derived(spec && selected ? executorChoices(spec, selected) : []);
	const configurationIds = $derived(Object.keys(spec?.configurations ?? {}));

	async function reRun(): Promise<void> {
		if (!stored || !spec || !selected || !stored.item) return;
		const picked = choices.find((entry) => entry.id === choice);
		const knobs =
			knobKey.trim() !== '' ? { [knobKey.trim()]: knobValueParsed(knobValue) } : undefined;
		const result = await whatIf.run({
			workflowId: stored.run.workflowId,
			item: stored.item,
			from: stored.run,
			stageId: selected,
			...(configuration !== '' ? { configuration } : {}),
			...(picked && picked.id !== 'default' ? { executors: { [selected]: picked.record } } : {}),
			...(knobs ? { knobs } : {}),
			...(contextRung !== '' ? { context: contextSpecFor(contextRung) } : {}),
			build: configuration !== '' ? configuration : `what-if:${selected}`
		});
		drawerOpen = false;
		const target = `${resolve('/workshop/workflows/[runId]', { runId: result.run.id })}?against=${encodeURIComponent(stored.run.id)}`;
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() builds the base path here; its typed surface has no way to attach the ?against= query the rule can verify statically (the same exception workshop/export's safety-case link takes).
		await goto(target);
	}
	const knobValueParsed = (raw: string): number | string | boolean => {
		const trimmed = raw.trim();
		if (trimmed === 'true') return true;
		if (trimmed === 'false') return false;
		const asNumber = Number(trimmed);
		return trimmed !== '' && Number.isFinite(asNumber) ? asNumber : trimmed;
	};

	const ms = (value: number) => `${Math.round(value)} ms`;
	const guardTally = (entry: StageRecord) =>
		`${entry.guards.checked} checked · ${entry.guards.tripped.length} tripped`;
	const runLabHref = (entry: StageRecord) =>
		entry.runId
			? `${resolve('/workshop/runs/[runId]', { runId: entry.runId })}?tick=0&stage=${encodeURIComponent(entry.stageId)}`
			: undefined;
</script>

<svelte:head><title>Pipeline — Workshop</title></svelte:head>

<main data-testid="pipeline-page">
	<header class="head">
		<h1>Pipeline</h1>
		<a href={resolve('/workshop/workflows')} data-testid="pipeline-back">← Workflows</a>
	</header>

	{#if !loaded}
		<p class="status">Reading the store…</p>
	{:else if !stored}
		<p class="status" data-testid="pipeline-missing">
			No workflow run with id {runId} in the store.
		</p>
	{:else}
		<Strip label={spec?.name ?? stored.run.workflowId} icon="pipeline" testId="pipeline-strip">
			<Readout label="run" value={stored.run.id.slice(0, 8)} testId="pipeline-run" />
			<Readout label="item" value={stored.run.itemId} testId="pipeline-item" />
			<Readout label="stages" value={stored.run.stages.length} testId="pipeline-stages" />
			<Readout label="configuration" value={stored.source?.build ?? '—'} />
			<Readout
				label="started (simulated)"
				value={stored.run.startedAt.slice(0, 16).replace('T', ' ')}
			/>
			<Lamp
				status={stored.run.outcome === 'completed' ? 'pass' : 'fail'}
				label={stored.run.outcome}
				testId="pipeline-outcome"
			/>
			{#if stored.forkedFrom}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() builds the base path here; its typed surface has no way to attach the ?against= query the rule can verify statically. -->
				<a
					href="{resolve('/workshop/workflows/[runId]', {
						runId: stored.forkedFrom.runId
					})}?against={encodeURIComponent(stored.run.id)}"
					data-testid="pipeline-forked-from"
					>forked from {stored.forkedFrom.runId.slice(0, 8)} at {stageName(
						stored.forkedFrom.stageId
					)}</a
				>
			{/if}
			{#snippet actions()}
				<button
					type="button"
					onclick={() => (drawerOpen = !drawerOpen)}
					disabled={!stored?.item || !spec}
					title={stored?.item
						? undefined
						: 'This run was stored without its item, so it cannot be re-run.'}
					data-testid="pipeline-what-if">What if…</button
				>
			{/snippet}
		</Strip>

		{#snippet rail(entry: StoredWorkflowRun, testId: string, label: string)}
			<section class="rail" aria-label={label} data-testid={testId}>
				<h2>{label}</h2>
				<ol>
					{#each entry.run.stages as record (record.stageId)}
						<li>
							<button
								type="button"
								class="card"
								class:card--selected={record.stageId === selected}
								onclick={() => (selected = record.stageId)}
								aria-pressed={record.stageId === selected}
								data-testid="{testId}-stage-{record.stageId}"
								data-status={record.status}
							>
								<span class="card-head">
									<Roundel icon={EXECUTOR_ICON[record.executor.kind]} size={18} />
									<b>{stageName(record.stageId)}</b>
								</span>
								<Lamp status={statusOfStage(record.status)} label={record.status} />
								<span class="meta">{describeExecutor(record.executor)}</span>
								<span class="meta">{ms(record.durationMs)} · {guardTally(record)}</span>
								{#if record.approval}
									<span class="meta"
										>approval: {record.approval.decision}{record.approval.by
											? ` by ${record.approval.by.name ?? record.approval.by.id}`
											: ''}</span
									>
								{/if}
								{#if record.finding}
									<span class="meta finding">{record.finding}</span>
								{/if}
							</button>
						</li>
					{/each}
				</ol>
			</section>
		{/snippet}

		{@render rail(stored, 'pipeline-rail', against ? 'This run' : 'The stages')}
		{#if against}
			{@render rail(against, 'pipeline-rail-against', `Against ${against.run.id.slice(0, 8)}`)}
		{/if}

		{#if stage}
			<section class="panes" data-testid="pipeline-panes">
				<div class="pane" data-testid="pipeline-in">
					<h3>In · {stageName(stage.stageId)}</h3>
					<CaseFile
						records={paneRecords(stage, 'input', stageName(stage.stageId))}
						testId="pipeline-in-file"
					/>
				</div>
				<div class="pane" data-testid="pipeline-out">
					<h3>Out · {stageName(stage.stageId)}</h3>
					<CaseFile
						records={paneRecords(stage, 'output', stageName(stage.stageId))}
						testId="pipeline-out-file"
					/>
					{#if stage.guards.tripped.length > 0}
						<ul class="trips" data-testid="pipeline-trips">
							{#each stage.guards.tripped as trip, index (index)}
								<li>
									{trip.guardrailId} — {trip.disposition}{trip.cause ? ` (${trip.cause})` : ''}
								</li>
							{/each}
						</ul>
					{/if}
				</div>
				{#if otherStage}
					<div class="pane" data-testid="pipeline-out-against">
						<h3>Out · {stageName(otherStage.stageId)} (against)</h3>
						<CaseFile
							records={paneRecords(otherStage, 'output', stageName(otherStage.stageId))}
							testId="pipeline-out-against-file"
						/>
						<p class="status">
							{otherStage.output.digest === stage.output.digest
								? 'The same output on both runs.'
								: 'The outputs differ.'}
						</p>
					</div>
				{/if}
			</section>
			<p class="links">
				{#if stage.executor.kind === 'agent'}
					{#if stage.runId && storedRunIds.includes(stage.runId)}
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() builds the base path; the ?tick=&stage= query cannot be attached through its typed surface. -->
						<a href={runLabHref(stage)} data-testid="pipeline-run-lab"
							>Open the bot's run in the Run Lab at this stage's first tick</a
						>
					{:else}
						<span class="status" data-testid="pipeline-run-lab-missing"
							>The bot's run at this stage is not in the store.</span
						>
					{/if}
				{:else}
					<span class="status">This stage was {describeExecutor(stage.executor)} — no bot ran.</span
					>
				{/if}
			</p>
		{/if}

		{#if drawerOpen && spec && selected}
			<section class="drawer" aria-label="What if" data-testid="pipeline-drawer">
				<h2>What if — from {stageName(selected)}</h2>
				<p class="status">
					The stages before {stageName(selected)} run again under this run's configuration and seeds;
					from {stageName(selected)} on, under the change below. The result opens beside this run.
				</p>
				<div class="row">
					<label class="field">
						<span>Configuration</span>
						<select bind:value={configuration} data-testid="what-if-configuration">
							<option value="">this run's</option>
							{#each configurationIds as id (id)}
								<option value={id}>{id}</option>
							{/each}
						</select>
					</label>
					<label class="field">
						<span>Executor at {stageName(selected)}</span>
						<select bind:value={choice} data-testid="what-if-executor">
							{#each choices as entry (entry.id)}
								<option value={entry.id}>{entry.label}</option>
							{/each}
						</select>
					</label>
					<label class="field"
						><span>Knob</span><input
							type="text"
							bind:value={knobKey}
							placeholder="e.g. referRatioPercent"
							data-testid="what-if-knob"
						/></label
					>
					<label class="field"
						><span>Value</span><input
							type="text"
							bind:value={knobValue}
							data-testid="what-if-knob-value"
						/></label
					>
					<label class="field">
						<span>Context rung</span>
						<select bind:value={contextRung} data-testid="what-if-context">
							<option value="">this run's</option>
							<option value="minimal">minimal</option>
							<option value="case-file">case-file</option>
							<option value="relational">relational</option>
							<option value="ontology">ontology</option>
						</select>
					</label>
					<button
						type="button"
						onclick={reRun}
						disabled={whatIf.status === 'running'}
						data-testid="what-if-run"
					>
						{whatIf.status === 'running' ? 'Re-running…' : 'Re-run from here'}
					</button>
					{#if whatIf.status === 'failed'}<span class="finding" data-testid="what-if-error"
							>{whatIf.error}</span
						>{/if}
				</div>
			</section>
		{/if}

		{#if map}
			<section aria-label="The boundary with the workflow ring">
				<h2>The Boundary</h2>
				<Boundary {map} testId="pipeline-boundary" />
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

	.head {
		display: flex;
		justify-content: space-between;
		align-items: end;
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
		margin: 0 0 var(--cab-space-1);
		font-size: var(--cab-text-sm);
	}

	.status,
	.links {
		margin: 0;
		font-size: var(--cab-text-sm);
		color: var(--cab-ink-muted);
	}

	.rail ol {
		display: flex;
		gap: var(--cab-space-2);
		overflow-x: auto;
		margin: 0;
		padding: var(--cab-space-2) 0;
		list-style: none;
	}

	.card {
		display: grid;
		gap: var(--cab-space-1);
		min-width: 13rem;
		padding: var(--cab-space-2) var(--cab-space-3);
		text-align: left;
		font: inherit;
		color: var(--cab-ink);
		background: var(--cab-metal);
		background-image: var(--cab-finish-metal, none);
		border: var(--cab-border-part) solid var(--cab-ink);
		border-radius: var(--cab-radius-part);
		cursor: pointer;
	}

	.card--selected {
		outline: 3px solid var(--cab-scope);
		outline-offset: 2px;
	}

	.card-head {
		display: flex;
		align-items: center;
		gap: var(--cab-space-2);
	}

	.meta {
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted);
	}

	.finding {
		color: var(--cab-fail);
	}

	.panes {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
		gap: var(--cab-space-3);
	}

	.trips {
		margin: var(--cab-space-2) 0 0;
		padding-left: var(--cab-space-4);
		font-size: var(--cab-text-xs);
		color: var(--cab-fail);
	}

	.drawer {
		display: grid;
		gap: var(--cab-space-2);
		padding: var(--cab-space-3);
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-panel);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-3);
		align-items: end;
	}

	.field {
		display: grid;
		gap: var(--cab-space-1);
		font-size: var(--cab-text-sm);
	}
</style>
