<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { EngineEvent, RunRecord } from '@craftabot/core';
	import { botExpression } from '$lib/bot-expression.js';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import { projectThrough } from '$lib/state/run-projection.js';
	import WorldStage from '$lib/components/play/WorldStage.svelte';

	/**
	 * **Compare** (`17-…` §4.3) — the Multi-Pack "compare" promise, delivered
	 * against runs rather than models first, because two stored runs already
	 * exist the moment anybody has played twice; nothing about comparing them
	 * needed a second provider to be true.
	 *
	 * Two panels, one scrubber. Each panel folds its own run through the
	 * *same* `projectThrough` reducer the Run Lab and the Kit's live view
	 * share (`run-projection.ts`) — there is one fold, so the two panels
	 * cannot disagree about what a tick looked like any more than the Kit and
	 * the Run Lab can. The scrubber holds one tick number and each panel
	 * clamps it to its own run's length, so two runs of different lengths
	 * both show "as far as it got" once the shorter one ends.
	 *
	 * Deliberately two, not N (`workshop/runs/+page.svelte`'s own note):
	 * "side by side" is a pair, and a third column would fight the one shared
	 * scrubber for space rather than share it.
	 */

	interface Panel {
		id: string;
		run: RunRecord | undefined;
		events: EngineEvent[];
		lastTick: number;
	}

	const idA = $derived(page.url.searchParams.get('a') ?? '');
	const idB = $derived(page.url.searchParams.get('b') ?? '');

	let panelA = $state<Panel | undefined>(undefined);
	let panelB = $state<Panel | undefined>(undefined);
	let loaded = $state(false);
	/** The one scrubber; each panel clamps it to its own run's length. */
	let tick = $state(0);

	$effect(() => {
		void load(idA, idB);
	});

	async function loadPanel(id: string): Promise<Panel> {
		const storage = await appStorage();
		const run = await storage.getRun(id);
		const events = (await storage.getEvents(id)).map((row) => row.event);
		return { id, run, events, lastTick: events.at(-1)?.tick ?? 0 };
	}

	async function load(a: string, b: string): Promise<void> {
		[panelA, panelB] = await Promise.all([loadPanel(a), loadPanel(b)]);
		tick = Math.max(panelA.lastTick, panelB.lastTick);
		loaded = true;
	}

	const overallLastTick = $derived(Math.max(panelA?.lastTick ?? 0, panelB?.lastTick ?? 0));
	const tokens = (record: RunRecord) => record.usage.inputTokens + record.usage.outputTokens;
</script>

<svelte:head><title>Compare — Workshop</title></svelte:head>

<main data-testid="compare-page">
	<header class="top">
		<a class="back" href={resolve('/workshop/runs')}>← Runs</a>
		<h1>Compare</h1>
	</header>

	{#if !loaded}
		<p class="status">Reading both runs…</p>
	{:else if !idA || !idB}
		<p class="status" data-testid="compare-missing-ids">
			Compare needs two runs. Go back to the runs table and check two boxes.
		</p>
	{:else if !panelA?.run || !panelB?.run}
		<p class="status" data-testid="compare-missing-run">
			One of those runs is no longer in the store. <a href={resolve('/workshop/runs')}
				>Back to the runs</a
			>.
		</p>
	{:else}
		<label class="scrubber">
			<span>Turn {tick} of {overallLastTick}</span>
			<input
				type="range"
				min="0"
				max={overallLastTick}
				value={tick}
				data-testid="compare-scrubber"
				oninput={(e) => (tick = Number(e.currentTarget.value))}
			/>
		</label>

		<div class="panels">
			{#each [panelA, panelB] as panel (panel.id)}
				{@const run = panel.run}
				{#if run}
					{@const shown = projectThrough(panel.events, Math.min(tick, panel.lastTick))}
					{@const expression = botExpression({
						tripped: shown.tripped,
						outcome: shown.outcome,
						thinking: shown.thinking,
						lastActionOk: shown.lastActionOk
					})}
					<section class="panel" data-testid="compare-panel-{panel.id}">
						<header class="panel-head">
							<h2>{run.agentName}</h2>
							<span class="chip" data-outcome={run.outcome}>{run.outcome}</span>
							<dl>
								<div>
									<dt>Card</dt>
									<dd class="mono">{run.goalCardId}</dd>
								</div>
								<div>
									<dt>Model</dt>
									<dd class="mono">{run.providerId} · {run.wireModel}</dd>
								</div>
								<div>
									<dt>Used</dt>
									<dd class="mono">{run.ticks} turns · {tokens(run)} tokens</dd>
								</div>
							</dl>
							<a
								class="lab"
								href={resolve('/workshop/runs/[runId]', { runId: run.id })}
								data-testid="compare-open-lab-{panel.id}">Open full Run Lab →</a
							>
						</header>
						<WorldStage
							world={shown.world}
							saying={shown.saying}
							{expression}
							outcome={shown.outcome}
							events={panel.events.filter((event) => event.tick <= Math.min(tick, panel.lastTick))}
						/>
					</section>
				{/if}
			{/each}
		</div>
	{/if}
</main>

<style>
	main {
		display: grid;
		gap: var(--cab-space-3);
		align-content: start;
	}

	.top {
		display: flex;
		align-items: baseline;
		gap: var(--cab-space-3);
	}

	h1 {
		margin: 0;
		font-size: var(--cab-text-xl);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.back {
		font-size: var(--cab-text-sm);
	}

	.status {
		margin: 0;
		font-size: var(--cab-text-sm);
		color: var(--cab-ink-muted);
	}

	.scrubber {
		display: grid;
		gap: 2px;
		padding: var(--cab-space-2) var(--cab-space-3);
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted);
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-panel);
	}

	.scrubber input {
		width: 100%;
	}

	.panels {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--cab-space-3);
		align-items: start;
	}

	.panel {
		display: grid;
		gap: var(--cab-space-2);
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-panel);
		padding: var(--cab-space-2);
	}

	.panel-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--cab-space-2);
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

	.chip[data-outcome='STOPPED_BY_GUARDRAIL'] {
		color: var(--cab-red-text);
	}

	.panel-head dl {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-3);
		margin: 0;
		flex: 1 1 100%;
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
		font-size: var(--cab-text-xs);
	}

	:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	@media (max-width: 900px) {
		.panels {
			grid-template-columns: 1fr;
		}
	}
</style>
