<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { AgentSpec, EngineEvent } from '@craftabot/core';
	import {
		DEFAULT_NOISE,
		STANDARD_CARDS,
		matrixSize,
		runMatrix,
		type EvalCell,
		type EvalReport,
		type MatrixSpec
	} from '@craftabot/evals';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import { persistRunSummary } from '$lib/state/run-summaries.js';
	import { rampStep, recordForCell, summaryAt } from '$lib/workshop/eval-cells.js';

	/**
	 * **The Eval Matrix** (`17-…` §4.4), over WP19's harness.
	 *
	 * WP23's definition of done is this screen's whole job: *a matrix run
	 * configured, executed, drilled to a single trace without leaving the
	 * Workshop.* The runner is `@craftabot/evals` unchanged — the same code the
	 * CLI runs, so a number here and a number in `npm run evals` come from one
	 * implementation and cannot disagree.
	 *
	 * **It runs in the browser, on the main thread, and that is a real
	 * constraint.** The first version froze the tab: a scripted cell's awaits all
	 * settle on the microtask queue, so `runMatrix` runs the whole matrix in one
	 * uninterrupted turn of the event loop no matter how many `await`s it
	 * contains. `betweenCells` yields a macrotask so the progress count can
	 * actually paint — the runner takes it as an option precisely because the CLI
	 * must not pay for it.
	 *
	 * Even so the configuration starts small and the cell count is shown *before*
	 * the button. `13-…` §8's live tiers are not offered at all: they cost money,
	 * and a button that spends money needs a spend cap that does not exist yet.
	 */

	const TIERS = [
		{ id: 'scripted-optimal', label: 'Optimal', hint: 'the solvability floor' },
		{ id: 'scripted-noisy', label: 'Noisy', hint: 'a fixed amount of wrongness' }
	] as const;

	let cards = $state<string[]>(['starter/say-hello', 'starter/snack']);
	let tiers = $state<string[]>(['scripted-optimal', 'scripted-noisy']);
	let seedCount = $state(5);

	let running = $state(false);
	let progress = $state({ done: 0, total: 0 });
	let report = $state<EvalReport | undefined>(undefined);
	/**
	 * Traces kept for this visit only, so a cell can be opened without re-running.
	 *
	 * A plain record, not `$state` and not a `SvelteMap`: nothing renders from it.
	 * It is read once, in a click handler, and making it reactive would ask Svelte
	 * to track a few megabytes of events for no observable benefit.
	 */
	let traces: Record<string, { events: readonly EngineEvent[]; spec: AgentSpec }> = {};
	let openSquare = $state<{ goalCardId: string; brainId: string } | undefined>(undefined);

	const spec = $derived<MatrixSpec>({
		goalCardIds: cards,
		brains: tiers.map((id) => ({ id, tier: id as 'scripted-optimal' | 'scripted-noisy' })),
		configs: [{ id: 'default' }],
		seeds: Array.from({ length: seedCount }, (_, index) => index + 1)
	});
	const size = $derived(matrixSize(spec));
	const squareCells = $derived(
		openSquare === undefined
			? []
			: (report?.cells ?? []).filter(
					(cell) =>
						cell.goalCardId === openSquare?.goalCardId && cell.brainId === openSquare?.brainId
				)
	);

	function toggle(list: string[], value: string): string[] {
		return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
	}

	async function execute(): Promise<void> {
		running = true;
		openSquare = undefined;
		traces = {};
		progress = { done: 0, total: size };
		try {
			report = await runMatrix(spec, {
				// A macrotask, not a microtask: see the note above.
				betweenCells: () => new Promise((resolve) => setTimeout(resolve, 0)),
				onCell: (_cell, done, total) => (progress = { done, total }),
				onTrace: (cell, trace) => {
					if (cell.runId) traces[cell.runId] = trace;
				}
			});
		} finally {
			running = false;
		}
	}

	/**
	 * Open one cell's run in the Run Lab.
	 *
	 * The run is written to the store **here**, not when the matrix ran: a
	 * 240-cell matrix that persisted every cell would evict every run a child had
	 * made, because the store trims oldest-first. Only the one somebody asks to
	 * look at is kept.
	 */
	async function openInRunLab(cell: EvalCell): Promise<void> {
		const trace = cell.runId === undefined ? undefined : traces[cell.runId];
		if (!trace) return;
		const record = recordForCell(cell, trace.events, trace.spec);
		if (!record) return;

		const storage = await appStorage();
		await storage.putRun(record);
		await storage.appendEvents(record.id, trace.events);
		await persistRunSummary(storage, record.id, trace.events);
		await goto(resolve('/workshop/runs/[runId]', { runId: record.id }));
	}

	const pct = (value: number) => `${Math.round(value * 100)}%`;
	const short = (id: string) => id.replace(/^.*\//, '');
</script>

<svelte:head><title>Evals — Workshop</title></svelte:head>

<main>
	<h1>Eval Matrix</h1>

	<section class="config" aria-label="Configure the matrix">
		<fieldset>
			<legend>Goal cards</legend>
			<div class="chips">
				{#each STANDARD_CARDS as card (card)}
					<label class="chip">
						<input
							type="checkbox"
							checked={cards.includes(card)}
							data-testid="card-{short(card)}"
							onchange={() => (cards = toggle(cards, card))}
						/>
						{short(card)}
					</label>
				{/each}
			</div>
		</fieldset>

		<fieldset>
			<legend>Brains</legend>
			<div class="chips">
				{#each TIERS as tier (tier.id)}
					<label class="chip" title={tier.hint}>
						<input
							type="checkbox"
							checked={tiers.includes(tier.id)}
							data-testid="tier-{tier.id}"
							onchange={() => (tiers = toggle(tiers, tier.id))}
						/>
						{tier.label}
					</label>
				{/each}
			</div>
			<!--
				`13-…` §8's third tier is deliberately absent. It costs real money and
				a button that spends it needs a cap that does not exist yet.
			-->
			<p class="hint">
				Live cartridges are not offered here: they cost money, and this screen has no spend cap. Run
				them from the CLI.
			</p>
		</fieldset>

		<fieldset>
			<legend>Seeds</legend>
			<input
				type="number"
				min="1"
				max="20"
				bind:value={seedCount}
				data-testid="seed-count"
				aria-label="How many seeds"
			/>
			<p class="hint">Noise is seeded, so the same seed is always the same wrong bot.</p>
		</fieldset>

		<div class="go">
			<!-- The cost is shown before the button, not after. -->
			<p class="size" data-testid="matrix-size">{size} cells</p>
			<button
				type="button"
				disabled={running || size === 0}
				data-testid="run-matrix"
				onclick={execute}
			>
				{running ? `Running ${progress.done}/${progress.total}…` : 'Run matrix'}
			</button>
		</div>
	</section>

	{#if report}
		{@const brains = report.matrix.brains}
		<section aria-label="Success rate">
			<h2>Success rate</h2>
			<table class="grid" data-testid="success-grid">
				<thead>
					<tr>
						<th scope="col">Goal card</th>
						{#each brains as brain (brain.id)}<th scope="col">{brain.id}</th>{/each}
					</tr>
				</thead>
				<tbody>
					{#each report.matrix.goalCardIds as card (card)}
						<tr>
							<th scope="row" class="mono">{short(card)}</th>
							{#each brains as brain (brain.id)}
								{@const summary = summaryAt(report.summaries, card, brain.id)}
								<td class="cell">
									{#if summary}
										{@const step = rampStep(summary.successRate)}
										<!--
											The value is in the cell, always. Colour is the magnitude
											encoding and the number is the fact — `04-…` §7, and the
											reason every ramp step has a readable label colour.
										-->
										<button
											type="button"
											class="square"
											style="--fill: {step.fill}; --label: {step.ink
												? 'var(--cab-ink)'
												: 'var(--cab-cream)'}"
											data-testid="square-{short(card)}-{brain.id}"
											onclick={() => (openSquare = { goalCardId: card, brainId: brain.id })}
										>
											{pct(summary.successRate)}
										</button>
									{:else}
										<span class="none">—</span>
									{/if}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
			<p class="hint">Darker is more successful. Click a square for the runs behind it.</p>
		</section>

		<section aria-label="Scorecard">
			<h2>Scorecard</h2>
			<table data-testid="scorecard">
				<thead>
					<tr>
						<th scope="col">Card</th>
						<th scope="col">Brain</th>
						<th scope="col">Runs</th>
						<th scope="col">Success</th>
						<th scope="col">Median turns</th>
						<th scope="col">Wasted</th>
						<th scope="col">Loop</th>
						<th scope="col">Naming misses</th>
					</tr>
				</thead>
				<tbody>
					{#each report.summaries as summary (summary.goalCardId + summary.brainId)}
						<tr>
							<td class="mono">{short(summary.goalCardId)}</td>
							<td>{summary.brainId}</td>
							<td class="num">{summary.cells}</td>
							<td class="num">{pct(summary.successRate)}</td>
							<td class="num">{summary.medianTicks}</td>
							<td class="num">{pct(summary.meanWastedTickRatio)}</td>
							<td class="num">{summary.medianLoopStreak}</td>
							<td class="num">{summary.namingMisses}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>

		{#if openSquare}
			<section aria-label="Runs behind this square" data-testid="square-runs">
				<h2>{short(openSquare.goalCardId)} × {openSquare.brainId}</h2>
				<table>
					<thead>
						<tr>
							<th scope="col">Seed</th>
							<th scope="col">Outcome</th>
							<th scope="col">Turns</th>
							<th scope="col">Wasted</th>
							<th scope="col">Misses</th>
							<th scope="col"></th>
						</tr>
					</thead>
					<tbody>
						{#each squareCells as cell (cell.seed)}
							<tr>
								<td class="num">{cell.seed}</td>
								<td>{cell.metrics.outcome ?? (cell.error ? 'did not run' : '—')}</td>
								<td class="num">{cell.metrics.ticksUsed}</td>
								<td class="num">{pct(cell.metrics.wastedTickRatio)}</td>
								<td class="num">{cell.metrics.namingMisses}</td>
								<td>
									<button
										type="button"
										class="drill"
										data-testid="open-cell-{cell.seed}"
										onclick={() => openInRunLab(cell)}>Open in Run Lab →</button
									>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
				<p class="hint">
					Opening a run writes it to the run store so the Run Lab can read it. Matrix cells are not
					stored otherwise — a full matrix would evict everything else.
				</p>
			</section>
		{/if}
	{:else if !running}
		<p class="hint" data-testid="no-report">
			Nothing run yet. The noise rates are fixed at misname {pct(DEFAULT_NOISE.misname)}, wasted
			move
			{pct(DEFAULT_NOISE.wastedMove)}, premature celebrate {pct(DEFAULT_NOISE.prematureCelebrate)} — the
			instrument, not a setting, so results stay comparable.
		</p>
	{/if}
</main>

<style>
	main {
		display: grid;
		gap: var(--cab-space-4);
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

	.config {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-4);
		align-items: start;
	}

	fieldset {
		border: 0;
		margin: 0;
		padding: 0;
	}

	legend {
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--cab-ink-muted);
		padding: 0 0 var(--cab-space-1);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-1);
		max-width: 420px;
	}

	.chip {
		display: flex;
		align-items: center;
		gap: 2px;
		font-size: var(--cab-text-xs);
		padding: 1px var(--cab-space-2);
		background: var(--cab-paper);
		border: 1px solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-pill);
	}

	.hint {
		margin: var(--cab-space-1) 0 0;
		max-width: 60ch;
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted);
	}

	.go {
		margin-left: auto;
		display: grid;
		gap: var(--cab-space-1);
		justify-items: end;
	}

	.size {
		margin: 0;
		font-size: var(--cab-text-sm);
		font-variant-numeric: tabular-nums;
	}

	button,
	input {
		font: inherit;
		font-size: var(--cab-text-sm);
		padding: 2px var(--cab-space-2);
		color: var(--cab-ink);
		background: var(--cab-paper);
		border: 1px solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-part);
	}

	button {
		cursor: pointer;
	}

	button:disabled {
		cursor: progress;
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
		border-bottom: 1px solid color-mix(in srgb, var(--cab-ink) 12%, transparent);
	}

	thead th {
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--cab-ink-muted);
		white-space: nowrap;
	}

	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.mono {
		font-family: var(--cab-font-mono);
		font-size: var(--cab-text-xs);
	}

	/* The grid's cells carry the fill; nothing else on the page does. */
	.grid td {
		padding: 2px;
	}

	.square {
		width: 100%;
		padding: var(--cab-space-2);
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		background: var(--fill);
		color: var(--label);
		border: 0;
		/* A 2px surface gap between fills, so adjacent squares stay separate. */
		outline: 2px solid var(--cab-cream);
		outline-offset: -1px;
	}

	.none {
		color: var(--cab-ink-muted);
	}

	.drill {
		font-size: var(--cab-text-xs);
		white-space: nowrap;
	}
</style>
