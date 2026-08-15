<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import {
		buildTraceFile,
		verifyTraceDigest,
		type EngineEvent,
		type RunRecord
	} from '@craftabot/core';
	import { botExpression } from '$lib/bot-expression.js';
	import { labelForEvent, laneLabel } from '$lib/trace-style.js';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import { projectThrough } from '$lib/state/run-projection.js';
	import { createBrowserKeyVault } from '$lib/state/keys.js';
	import { buildTimeline, lanesPresent, type TimelineFilter } from '$lib/workshop/timeline.js';
	import type { TraceLane } from '$lib/trace-style.js';
	import PayloadView from '$lib/components/trace/PayloadView.svelte';
	import WorldView from '$lib/components/play/WorldView.svelte';

	/**
	 * **The Run Lab** (`17-…` §3) — the Workshop's flagship, and the screen
	 * WP20's definition of done is about: "a stored Kit run is fully forensicable
	 * in the Workshop".
	 *
	 * Three regions, and one source. The world on the left is the *same*
	 * `WorldView` the Kit plays in, fed by the *same* `projectThrough` fold the
	 * Kit's replay uses — which is what makes "replay byte-consistent" a property
	 * of the architecture rather than a thing to test for. There is one reducer;
	 * two screens cannot disagree about a run because there is nothing for them
	 * to disagree with.
	 *
	 * **Real terms, toy tooltips** (`15-…` §7 rule 2). Every row is labelled with
	 * the event type as the engine emits it — `approval.requested`, not "Asked
	 * permission" — and carries the Kit's wording as its title. The vocabulary map
	 * stays one map, read from either end.
	 */

	const runId = $derived(page.params.runId ?? '');

	let run = $state<RunRecord | undefined>(undefined);
	let events = $state<EngineEvent[]>([]);
	let loaded = $state(false);
	/**
	 * `undefined` while it is being computed, then true/false — or a message if
	 * the check itself could not run.
	 *
	 * Three states rather than two, because the first version had two and got
	 * stuck on "checking integrity…" for ever the moment `buildTraceFile` threw.
	 * A badge that never resolves is worse than one that says it failed: it reads
	 * as "still working" rather than "you learned nothing here".
	 */
	let verified = $state<boolean | { error: string } | undefined>(undefined);
	/** Which turn the scrubber is showing; the world is folded to here. */
	let tick = $state(0);
	/** Index into `events` of the selected row. */
	let selected = $state<number | undefined>(undefined);
	let filter = $state<TimelineFilter>({});
	let showRaw = $state(false);

	const lastTick = $derived(events.at(-1)?.tick ?? 0);
	const lanes = $derived(lanesPresent(events));
	const ticks = $derived(buildTimeline(events, filter));
	const shown = $derived(projectThrough(events, tick));
	const selectedEvent = $derived(selected === undefined ? undefined : events[selected]);
	const expression = $derived(
		botExpression({
			tripped: shown.tripped,
			outcome: shown.outcome,
			thinking: shown.thinking,
			lastActionOk: shown.lastActionOk
		})
	);

	$effect(() => {
		void load(runId);
	});

	async function load(id: string): Promise<void> {
		const storage = await appStorage();
		run = await storage.getRun(id);
		events = (await storage.getEvents(id)).map((row) => row.event);
		tick = events.at(-1)?.tick ?? 0;
		loaded = true;
		if (run) void verify(run);
	}

	/**
	 * The `✓ trace integrity` badge (`17-…` §3, header strip).
	 *
	 * Recomputed here rather than trusted: a digest stored beside the events it
	 * describes proves nothing on its own, and the badge is only worth showing if
	 * it was earned this second. The trace is rebuilt from the store and its
	 * digest checked against the events actually held.
	 */
	async function verify(record: RunRecord): Promise<void> {
		try {
			const secrets = createBrowserKeyVault().secrets();
			// `$state.snapshot`: the record and events are reactive proxies, and the
			// trace schema is parsed and hashed — both want plain data.
			const trace = await buildTraceFile($state.snapshot(record), $state.snapshot(events), {
				secrets
			});
			verified = await verifyTraceDigest(trace);
		} catch (error) {
			verified = { error: error instanceof Error ? error.message : String(error) };
		}
	}

	function toggleLane(lane: TraceLane): void {
		const current = filter.lanes ?? [];
		const next = current.includes(lane)
			? current.filter((entry) => entry !== lane)
			: [...current, lane];
		filter = { ...filter, lanes: next };
	}

	/** Selecting a row also moves the world to the turn it happened in. */
	function selectRow(index: number, rowTick: number): void {
		selected = index;
		tick = rowTick;
	}

	const isOn = (lane: TraceLane) => (filter.lanes ?? []).includes(lane);
	const tokens = (record: RunRecord) => record.usage.inputTokens + record.usage.outputTokens;
</script>

<svelte:head><title>{run?.agentName ?? 'Run'} — Run Lab</title></svelte:head>

{#if loaded && !run}
	<p class="missing" data-testid="run-missing">
		No run with that id is in the store. <a href={resolve('/workshop/runs')}>Back to the runs</a>.
	</p>
{:else if run}
	<header class="strip" data-testid="run-header">
		<a class="back" href={resolve('/workshop/runs')}>← Runs</a>
		<h1>{run.agentName}</h1>
		<span class="chip" data-outcome={run.outcome} data-testid="header-outcome">{run.outcome}</span>
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
				<dt>Budgets</dt>
				<dd class="mono">{run.budgets.maxTicks} turns · {run.budgets.maxTokens} tokens</dd>
			</div>
			<div>
				<dt>Used</dt>
				<dd class="mono">{run.ticks} turns · {tokens(run)} tokens</dd>
			</div>
		</dl>
		<!--
			Recomputed on load, never read from a field. A digest stored beside the
			events it describes proves nothing on its own.
		-->
		<span
			class="integrity"
			data-verified={typeof verified === 'boolean' ? verified : 'unknown'}
			title={typeof verified === 'object' ? verified.error : undefined}
			data-testid="digest-badge"
		>
			{#if verified === undefined}
				checking integrity…
			{:else if verified === true}
				✓ trace integrity
			{:else if verified === false}
				✗ digest does not match these events
			{:else}
				? integrity not checked
			{/if}
		</span>
		<a class="kit" href={resolve('/replay/[runId]', { runId })} data-testid="open-in-kit"
			>Open in Kit</a
		>
	</header>

	<div class="regions">
		<section class="world" aria-label="The world at this turn">
			<WorldView
				world={shown.world}
				saying={shown.saying}
				{expression}
				outcome={shown.outcome}
				events={events.filter((event) => event.tick <= tick)}
			/>
			<label class="scrubber">
				<span>Turn {tick} of {lastTick}</span>
				<input
					type="range"
					min="0"
					max={lastTick}
					value={tick}
					data-testid="run-scrubber"
					oninput={(e) => (tick = Number(e.currentTarget.value))}
				/>
			</label>
		</section>

		<section class="timeline" aria-label="Step timeline">
			<div class="toolbar">
				{#each lanes as lane (lane)}
					<button
						type="button"
						class="lane-chip"
						data-lane={lane}
						aria-pressed={isOn(lane)}
						data-testid="lane-{lane}"
						onclick={() => toggleLane(lane)}>{laneLabel(lane)}</button
					>
				{/each}
				<label class="check">
					<input
						type="checkbox"
						data-testid="only-failures"
						checked={filter.onlyFailures === true}
						onchange={(e) => (filter = { ...filter, onlyFailures: e.currentTarget.checked })}
					/> Only trouble
				</label>
				<input
					type="search"
					placeholder="search payloads"
					data-testid="timeline-search"
					value={filter.text ?? ''}
					oninput={(e) => (filter = { ...filter, text: e.currentTarget.value })}
				/>
			</div>

			<div class="rows" data-testid="timeline">
				{#each ticks as group (group.tick)}
					<div class="tick-head">
						<span>Turn {group.tick}</span>
						{#if group.tokensIn > 0}
							<span class="gutter">{group.tokensIn} in · {group.tokensOut} out</span>
						{/if}
					</div>
					{#each group.rows as row (row.index)}
						<button
							type="button"
							class="row"
							class:row--failed={row.failed}
							class:row--selected={selected === row.index}
							data-lane={row.lane}
							data-testid="row-{row.index}"
							onclick={() => selectRow(row.index, row.event.tick)}
						>
							<span class="lane" aria-hidden="true">{laneLabel(row.lane)}</span>
							<!-- Real term first, toy wording as the tooltip (`15-…` §7 rule 2). -->
							<span class="type mono" title={labelForEvent(row.event)}>{row.event.type}</span>
						</button>
					{/each}
				{:else}
					<p class="empty" data-testid="timeline-empty">
						Nothing in this run matches those filters.
					</p>
				{/each}
			</div>
		</section>

		<section class="inspector" aria-label="Inspector">
			<div class="inspector-head">
				<h2>Inspector</h2>
				<label class="check">
					<input type="checkbox" bind:checked={showRaw} data-testid="show-raw" /> Raw JSON
				</label>
			</div>
			{#if showRaw && selectedEvent}
				<pre class="raw" data-testid="raw-json">{JSON.stringify(selectedEvent, null, 2)}</pre>
			{:else}
				<PayloadView event={selectedEvent} />
			{/if}
		</section>
	</div>
{/if}

<style>
	.missing {
		font-size: var(--cab-text-sm);
	}

	.strip {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: var(--cab-space-3);
		padding: var(--cab-space-2) var(--cab-space-3);
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-panel);
		margin-bottom: var(--cab-space-3);
	}

	h1 {
		margin: 0;
		font-size: var(--cab-text-lg);
	}

	.strip dl {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-3);
		margin: 0;
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

	.chip,
	.integrity {
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

	/* The word carries it; the colour only agrees with the word. */
	.integrity[data-verified='true'] {
		color: var(--cab-scope);
	}

	.integrity[data-verified='false'] {
		color: var(--cab-red-text);
	}

	.integrity[data-verified='unknown'] {
		color: var(--cab-ink-muted);
	}

	.back,
	.kit {
		font-size: var(--cab-text-sm);
	}

	.kit {
		margin-left: auto;
	}

	.regions {
		display: grid;
		grid-template-columns: minmax(280px, 1fr) minmax(240px, 0.9fr) minmax(260px, 1.1fr);
		gap: var(--cab-space-3);
		align-items: start;
	}

	section {
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-panel);
		padding: var(--cab-space-2);
	}

	.scrubber {
		display: grid;
		gap: 2px;
		margin-top: var(--cab-space-2);
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted);
	}

	.scrubber input {
		width: 100%;
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--cab-space-1);
		padding-bottom: var(--cab-space-2);
		border-bottom: 1px solid color-mix(in srgb, var(--cab-ink) 15%, transparent);
	}

	.lane-chip {
		font: inherit;
		font-size: var(--cab-text-xs);
		padding: 1px var(--cab-space-2);
		cursor: pointer;
		color: var(--cab-ink);
		background: var(--cab-paper);
		border: 1px solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-pill);
	}

	.lane-chip[aria-pressed='true'] {
		background: var(--cab-ink);
		color: var(--cab-cream);
	}

	.check {
		display: flex;
		align-items: center;
		gap: 2px;
		font-size: var(--cab-text-xs);
	}

	.toolbar input[type='search'] {
		flex: 1 1 100px;
		min-width: 80px;
		font: inherit;
		font-size: var(--cab-text-xs);
		padding: 1px var(--cab-space-1);
		background: var(--cab-paper);
		border: 1px solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-part);
	}

	.rows {
		max-height: 62vh;
		overflow-y: auto;
	}

	.tick-head {
		display: flex;
		justify-content: space-between;
		gap: var(--cab-space-2);
		position: sticky;
		top: 0;
		padding: var(--cab-space-1) 2px;
		background: var(--cab-cream);
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--cab-ink-muted);
		border-bottom: 1px solid color-mix(in srgb, var(--cab-ink) 12%, transparent);
	}

	.gutter {
		font-variant-numeric: tabular-nums;
		text-transform: none;
		letter-spacing: 0;
	}

	.row {
		display: flex;
		align-items: baseline;
		gap: var(--cab-space-2);
		width: 100%;
		padding: 2px var(--cab-space-1);
		font: inherit;
		text-align: left;
		background: none;
		border: 0;
		border-left: 3px solid transparent;
		cursor: pointer;
	}

	.row:hover {
		background: var(--cab-paper);
	}

	.row--selected {
		background: var(--cab-paper);
		font-weight: 600;
	}

	/*
	 * Trouble is marked with a rule and a weight as well as the lane colour —
	 * `04-…` §7, never colour alone.
	 */
	.row--failed .type {
		text-decoration: underline;
		text-decoration-style: wavy;
		text-underline-offset: 3px;
	}

	/*
	 * The lane colours are the Kit's, unchanged (`15-…` §7 rule 1): a trace lane
	 * means the same thing in both modes.
	 */
	.row[data-lane='sense'] {
		border-left-color: var(--cab-brick-sense);
	}
	.row[data-lane='think'] {
		border-left-color: var(--cab-brick-llm);
	}
	.row[data-lane='tool'] {
		border-left-color: var(--cab-brick-tools);
	}
	.row[data-lane='action'] {
		border-left-color: var(--cab-brick-actions);
	}
	.row[data-lane='memory'] {
		border-left-color: var(--cab-brick-memory);
	}
	.row[data-lane='guardrail'] {
		border-left-color: var(--cab-brick-safety);
	}
	.row[data-lane='error'] {
		border-left-color: var(--cab-red);
	}

	.lane {
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--cab-ink-muted);
		min-width: 62px;
	}

	.mono {
		font-family: var(--cab-font-mono);
		font-size: var(--cab-text-xs);
	}

	.inspector-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--cab-space-2);
		margin-bottom: var(--cab-space-2);
	}

	h2 {
		margin: 0;
		font-size: var(--cab-text-sm);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.raw {
		max-height: 62vh;
		overflow: auto;
		margin: 0;
		padding: var(--cab-space-2);
		font-size: var(--cab-text-xs);
		background: var(--cab-paper);
		border-radius: var(--cab-radius-part);
	}

	.empty {
		font-size: var(--cab-text-sm);
		color: var(--cab-ink-muted);
	}

	:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	@media (max-width: 1100px) {
		.regions {
			grid-template-columns: 1fr;
		}
	}
</style>
