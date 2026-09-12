<script lang="ts">
	import { page } from '$app/state';
	import Lamp from '$lib/components/control-room/Lamp.svelte';
	import { statusOfOutcome } from '$lib/control-room/outcome.js';
	import { resolve } from '$app/paths';
	import type { EngineEvent, RunRecord, StoredCampaignReport } from '@craftabot/core';
	import type { CampaignReport } from '@craftabot/evals';
	import type { Status } from '$lib/control-room/dataviz.js';
	import { reportFrom } from '$lib/workshop/campaign-cells.js';
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
	/**
	 * The fork point (WP66, `54-…` §4.5): when `b` was forked from `a` after
	 * this tick, `b`'s panel folds `a`'s events through it before `b`'s own,
	 * so the two worlds share every turn up to the fork and the scrubber
	 * opens there. Honoured only when `b`'s record says so — a `from` on
	 * two unrelated runs is ignored.
	 */
	const from = $derived.by(() => {
		const raw = page.url.searchParams.get('from');
		return raw === null || raw === '' || Number.isNaN(Number(raw)) ? undefined : Number(raw);
	});
	let forkPoint = $state<number | undefined>(undefined);

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
		const [left, right] = await Promise.all([loadPanel(a), loadPanel(b)]);
		const forked = right.run?.forkedFrom;
		if (forked && forked.runId === a && from === forked.tick) {
			forkPoint = forked.tick;
			right.events = [
				...left.events.filter((event) => event.tick <= forked.tick),
				...right.events.filter((event) => event.tick > forked.tick)
			];
			right.lastTick = right.events.at(-1)?.tick ?? 0;
		} else {
			forkPoint = undefined;
		}
		panelA = left;
		panelB = right;
		tick = forkPoint ?? Math.max(panelA.lastTick, panelB.lastTick);
		loaded = true;
	}

	const overallLastTick = $derived(Math.max(panelA?.lastTick ?? 0, panelB?.lastTick ?? 0));
	const tokens = (record: RunRecord) => record.usage.inputTokens + record.usage.outputTokens;

	/**
	 * **Two reports side by side** (WP87, `78-LENSES.md` §4; GAP-6): with
	 * `reportA` and `reportB`, Compare loads two stored campaign reports and
	 * aligns their gates by id — one row per gate either report has, each
	 * report's verdict as a lamp and its observed value beside it — and the
	 * fairness rows likewise. The run panels are untouched.
	 */
	const reportIdA = $derived(page.url.searchParams.get('reportA') ?? '');
	const reportIdB = $derived(page.url.searchParams.get('reportB') ?? '');
	let reportA = $state<CampaignReport | undefined>(undefined);
	let reportB = $state<CampaignReport | undefined>(undefined);
	let storedA = $state<StoredCampaignReport | undefined>(undefined);
	let storedB = $state<StoredCampaignReport | undefined>(undefined);
	let reportsLoaded = $state(false);
	const reportMode = $derived(reportIdA !== '' || reportIdB !== '');

	$effect(() => {
		if (reportMode) void loadReports(reportIdA, reportIdB);
	});

	async function loadReports(a: string, b: string): Promise<void> {
		const storage = await appStorage();
		storedA = a ? await storage.getCampaignReport(a) : undefined;
		storedB = b ? await storage.getCampaignReport(b) : undefined;
		reportA = storedA ? reportFrom(storedA) : undefined;
		reportB = storedB ? reportFrom(storedB) : undefined;
		reportsLoaded = true;
	}

	const gateRows = $derived.by(() => {
		if (!reportA || !reportB) return [];
		const ids = [...new Set([...reportA.gates, ...reportB.gates].map((gate) => gate.id))];
		const find = (report: CampaignReport, id: string) =>
			report.gates.find((gate) => gate.id === id);
		return ids.map((id) => ({ id, a: find(reportA!, id), b: find(reportB!, id) }));
	});
	const fairnessRows = $derived.by(() => {
		if (!reportA || !reportB) return [];
		const rowsA = reportA.summary?.fairness ?? [];
		const rowsB = reportB.summary?.fairness ?? [];
		const ids = [...new Set([...rowsA, ...rowsB].map((row) => row.gateId))];
		return ids.map((id) => ({
			id,
			a: rowsA.find((row) => row.gateId === id),
			b: rowsB.find((row) => row.gateId === id)
		}));
	});
	type Gate = CampaignReport['gates'][number];
	type FairnessRow = NonNullable<CampaignReport['summary']>['fairness'][number];
	const gateLamp = (gate: Gate | undefined): Status =>
		gate === undefined
			? 'inconclusive'
			: gate.inconclusive
				? 'inconclusive'
				: gate.passed
					? 'pass'
					: 'fail';
	const gateWord = (gate: Gate | undefined): string =>
		gate === undefined
			? 'absent'
			: gate.inconclusive
				? 'inconclusive'
				: gate.passed
					? 'pass'
					: 'fail';
	const observed = (gate: Gate | undefined): string =>
		gate === undefined
			? 'not in this report'
			: gate.observed !== undefined
				? String(Math.round(gate.observed * 1000) / 1000)
				: (gate.reason ?? '—');
	const fairnessWord = (row: FairnessRow | undefined): string =>
		row
			? `${row.metric} ${row.value.toFixed(3)} [${row.interval[0].toFixed(3)}, ${row.interval[1].toFixed(3)}] n=${row.n}${row.underpowered ? ' underpowered' : ''}`
			: 'not in this report';
</script>

<svelte:head><title>Compare — Workshop</title></svelte:head>

<main data-testid="compare-page">
	<header class="top">
		{#if reportMode}
			<a class="back" href={resolve('/workshop/campaigns')}>← Campaigns</a>
		{:else}
			<a class="back" href={resolve('/workshop/runs')}>← Runs</a>
		{/if}
		<h1>Compare</h1>
	</header>

	{#if reportMode}
		{#if !reportsLoaded}
			<p class="status">Reading both reports…</p>
		{:else if !reportA || !reportB || !storedA || !storedB}
			<p class="status" data-testid="compare-missing-report">
				Compare needs two stored reports it can read. Pick two on the Assurance page.
			</p>
		{:else}
			<div class="reports" data-testid="compare-reports">
				{#each [{ id: reportIdA, report: reportA, stored: storedA }, { id: reportIdB, report: reportB, stored: storedB }] as panel (panel.id)}
					<section class="report-head" data-testid="compare-report-{panel.id}">
						<h2>{panel.stored.title}</h2>
						<Lamp
							status={panel.report.passed ? 'pass' : 'fail'}
							label={panel.report.passed ? 'passed' : 'failed'}
						/>
						<span class="mono"
							>{panel.report.cells.length} cells · {panel.stored.gatesPassed} of {panel.stored
								.gatesTotal} gates · {panel.stored.createdAt.slice(0, 16).replace('T', ' ')}</span
						>
					</section>
				{/each}
			</div>
			<section aria-labelledby="gates-h">
				<h2 id="gates-h">Gates, aligned by id</h2>
				<table data-testid="compare-gates">
					<thead>
						<tr>
							<th scope="col">Gate</th>
							<th scope="col">A</th>
							<th scope="col">A observed</th>
							<th scope="col">B</th>
							<th scope="col">B observed</th>
						</tr>
					</thead>
					<tbody>
						{#each gateRows as row (row.id)}
							<tr data-testid="compare-gate-{row.id}">
								<td class="mono">{row.id}</td>
								<td><Lamp status={gateLamp(row.a)} label={gateWord(row.a)} /></td>
								<td>{observed(row.a)}</td>
								<td><Lamp status={gateLamp(row.b)} label={gateWord(row.b)} /></td>
								<td>{observed(row.b)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</section>
			{#if fairnessRows.length > 0}
				<section aria-labelledby="fairness-h">
					<h2 id="fairness-h">Fairness, aligned by gate</h2>
					<table data-testid="compare-fairness">
						<thead>
							<tr><th scope="col">Gate</th><th scope="col">A</th><th scope="col">B</th></tr>
						</thead>
						<tbody>
							{#each fairnessRows as row (row.id)}
								<tr>
									<td class="mono">{row.id}</td>
									<td>{fairnessWord(row.a)}</td>
									<td>{fairnessWord(row.b)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</section>
			{/if}
		{/if}
	{:else if !loaded}
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
			<span
				>Turn {tick} of {overallLastTick}{#if forkPoint !== undefined}
					· <span data-testid="compare-forked">forked after turn {forkPoint}</span>{/if}</span
			>
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
							<span class="chip" data-outcome={run.outcome}
								><Lamp status={statusOfOutcome(run.outcome)} label={run.outcome} /></span
							>
							{#if forkPoint !== undefined && panel.id === idB}
								<span class="chip" data-testid="compare-fork-chip"
									>fork · shares turns 0–{forkPoint}</span
								>
							{/if}
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
							truth={shown.truth}
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

	.reports {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
		gap: var(--cab-space-3);
	}

	.report-head {
		display: grid;
		gap: var(--cab-space-1);
		padding: var(--cab-space-3);
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-panel);
	}

	.report-head h2 {
		margin: 0;
		font-size: var(--cab-text-md);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-panel);
		overflow: hidden;
	}

	th,
	td {
		padding: var(--cab-space-1) var(--cab-space-2);
		text-align: left;
		font-size: var(--cab-text-sm);
	}

	.mono {
		font-family: var(--cab-font-mono);
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
