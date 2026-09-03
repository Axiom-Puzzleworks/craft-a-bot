<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import {
		buildTraceFile,
		verifyTraceDigest,
		verifyBundleDigest,
		type EngineEvent,
		type EvaluationRecord,
		type GroupRunRecord,
		type RunRecord
	} from '@craftabot/core';
	import { botExpression } from '$lib/bot-expression.js';
	import { labelForEvent, laneLabel } from '$lib/trace-style.js';
	import { bundleForGroup } from '$lib/workshop/bundles.js';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import { projectThrough } from '$lib/state/run-projection.js';
	import { createBrowserKeyVault } from '$lib/state/keys.js';
	import { liveRun } from '$lib/state/live-run.svelte.js';
	import { preferences } from '$lib/state/preferences.svelte.js';
	import { BREAKPOINT_KINDS, type BreakpointKind } from '$lib/state/settings.js';
	import { buildTimeline, lanesPresent, type TimelineFilter } from '$lib/workshop/timeline.js';
	import { diffPrompts, previousPrompt } from '$lib/workshop/prompt-diff.js';
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
	/**
	 * Set instead of `run` when `runId` names a group episode, not a solo run
	 * (WP29, `23-MULTI-AGENT-DESIGN.md` §5.2, §10 stage F) — "opening the group
	 * row opens the Run Lab over the merged trace: same three regions, same
	 * fold". `events` below is the *merged* stream in that case, read through
	 * the same `storage.getEvents(id)` a solo run uses — the id just happens
	 * to be the group's rather than one member's.
	 */
	let groupRun = $state<GroupRunRecord | undefined>(undefined);
	/** Each group member's own row, for the header's links back to their standalone traces. */
	let groupMembers = $state<RunRecord[]>([]);
	/** The events as the store holds them. */
	let stored = $state<EngineEvent[]>([]);
	/**
	 * **Live trailing** (WP49, `37-…` §4.3): when this run is the one on the
	 * app's live bus, the timeline reads the session view's own `events` —
	 * the same array the Playroom draws from — instead of the store's copy,
	 * and the scrubber follows the head until a person takes hold of it.
	 * Stored and live go through the same fold below; nothing here reads
	 * the session's world.
	 */
	const live = $derived(
		liveRun.current && liveRun.current.view.runId === runId ? liveRun.current : undefined
	);
	const events = $derived(live ? live.view.events : stored);
	let follow = $state(true);
	const BREAKPOINT_LABELS: Record<BreakpointKind, string> = {
		'guardrail-trip': 'guardrail trip',
		'tool-call': 'tool call',
		'action-failure': 'action failure'
	};
	function toggleBreakpoint(kind: BreakpointKind, on: boolean): void {
		const armed = preferences.breakpoints.filter((entry) => entry !== kind);
		preferences.setBreakpoints(on ? [...armed, kind] : armed);
	}
	/** Stored evaluations of this run (WP43, `31-…` §4.3). */
	let evaluations = $state<EvaluationRecord[]>([]);
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
	/** "Diff vs previous prompt" (`17-…` §3) — off until asked for. */
	let showDiff = $state(false);

	const lastTick = $derived(events.at(-1)?.tick ?? 0);
	const lanes = $derived(lanesPresent(events));
	const ticks = $derived(buildTimeline(events, filter));
	const shown = $derived(projectThrough(events, tick));
	const selectedEvent = $derived(selected === undefined ? undefined : events[selected]);
	/**
	 * The prompt diff, when there is one to show.
	 *
	 * `undefined` covers two different situations and the template says which:
	 * the selected row is not a prompt, or it is the *first* prompt of the run
	 * and there is nothing to compare it against.
	 */
	const promptDiff = $derived.by(() => {
		if (selected === undefined) return undefined;
		const event = events[selected];
		if (event?.type !== 'prompt.composed') return undefined;
		const before = previousPrompt(events, selected);
		if (before?.type !== 'prompt.composed') return { first: true as const };
		return {
			first: false as const,
			messages: diffPrompts(before.payload.messages, event.payload.messages)
		};
	});

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
		groupRun = run ? undefined : await storage.getGroupRun(id);
		groupMembers = groupRun
			? (
					await Promise.all(groupRun.memberRunIds.map((memberId) => storage.getRun(memberId)))
				).filter((member) => member !== undefined)
			: [];
		stored = (await storage.getEvents(id)).map((row) => row.event);
		evaluations = await storage.listEvaluations(id);
		tick = events.at(-1)?.tick ?? 0;
		loaded = true;
		// A live run has no digest to verify yet; it is checked when it finishes (the effect below).
		if (live && live.view.outcome === undefined) return;
		// A solo run verifies its trace file; a group verifies its bundle (WP48, `36-…` §4.4).
		if (run) void verify(run);
		else if (groupRun) void verifyGroup(groupRun);
	}

	// Trail the head while following; a person moving the scrubber takes over.
	$effect(() => {
		if (live && follow) tick = lastTick;
	});

	// When the live run ends, read it back from the store: its record, its digest, its summary.
	let finishedSeen = $state(false);
	$effect(() => {
		if (live?.view.outcome !== undefined && !finishedSeen) {
			finishedSeen = true;
			setTimeout(() => void load(runId), 300);
		}
	});

	/**
	 * The `✓ trace integrity` badge (`17-…` §3, header strip).
	 *
	 * Recomputed here rather than trusted: a digest stored beside the events it
	 * describes proves nothing on its own, and the badge is only worth showing if
	 * it was earned this second. The trace is rebuilt from the store and its
	 * digest checked against the events actually held.
	 */
	async function verifyGroup(record: GroupRunRecord): Promise<void> {
		try {
			const storage = await appStorage();
			const bundle = await bundleForGroup(storage, $state.snapshot(record), createBrowserKeyVault().secrets());
			verified = await verifyBundleDigest(bundle);
		} catch (error) {
			verified = { error: error instanceof Error ? error.message : String(error) };
		}
	}

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

<svelte:head
	><title
		>{run?.agentName ?? (groupRun ? `${groupMembers.length}-robot episode` : 'Run')} — Run Lab</title
	></svelte:head
>

{#if loaded && !run && !groupRun}
	<p class="missing" data-testid="run-missing">
		No run with that id is in the store. <a href={resolve('/workshop/runs')}>Back to the runs</a>.
	</p>
{:else if run || groupRun}
	<header class="strip" data-testid="run-header">
		<a class="back" href={resolve('/workshop/runs')}>← Runs</a>
		{#if run}
			<h1>{run.agentName}</h1>
			<span class="chip" data-outcome={run.outcome} data-testid="header-outcome">{run.outcome}</span
			>
			{#if live}
				<!-- On the live bus (WP49): the session's own status, as it is this second. -->
				<span class="chip live" data-status={live.view.status} data-testid="live-chip"
					>LIVE · {live.view.status}</span
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
		{:else if groupRun}
			<!--
				A group episode's header (WP29, `23-…` §5.2, §10 stage F). No single
				agent, model or budget to show — several, one per member below —
				and no "Open in Kit": there is no Kit UI for a group to open into.
				The digest badge verifies the episode's bundle (WP48, `36-…` §4.4).
			-->
			<h1 data-testid="group-header">{groupMembers.length}-robot episode</h1>
			<span class="chip" data-outcome={groupRun.outcome} data-testid="header-outcome"
				>{groupRun.outcome}</span
			>
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
					✗ digest does not match this episode
				{:else}
					? integrity not checked
				{/if}
			</span>
			<dl>
				<div>
					<dt>Card</dt>
					<dd class="mono">{groupRun.goalCardId}</dd>
				</div>
				<div>
					<dt>Rounds</dt>
					<dd class="mono">{groupRun.rounds}</dd>
				</div>
				<div>
					<dt>Used</dt>
					<dd class="mono">
						{groupRun.usage.inputTokens + groupRun.usage.outputTokens} tokens
					</dd>
				</div>
				<div>
					<dt>Members</dt>
					<dd class="members" data-testid="group-members">
						{#each groupMembers as member (member.id)}
							<a href={resolve('/workshop/runs/[runId]', { runId: member.id })}>
								{member.agentName} — {member.outcome}
							</a>
						{/each}
					</dd>
				</div>
			</dl>
		{/if}
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
			{#if live}
				<!--
					Run controls and breakpoints over the live bus (`17-…` §3's left
					region, built in WP49). The breakpoints are the Workshop's
					preference — armed here, honoured by the Playroom's session too.
				-->
				<div class="live-controls" data-testid="live-controls">
					<fieldset class="breakpoints">
						<legend>Pause on</legend>
						{#each BREAKPOINT_KINDS as kind (kind)}
							<label>
								<input
									type="checkbox"
									data-testid="breakpoint-{kind}"
									checked={preferences.breakpoints.includes(kind)}
									onchange={(e) => toggleBreakpoint(kind, e.currentTarget.checked)}
								/>
								{BREAKPOINT_LABELS[kind]}
							</label>
						{/each}
					</fieldset>
					<div class="live-buttons">
						{#if live.view.status === 'running'}
							<button type="button" data-testid="live-pause" onclick={() => live?.view.pause()}
								>Pause</button
							>
						{:else if live.view.outcome === undefined}
							<button type="button" data-testid="live-resume" onclick={() => live?.view.resume()}
								>{live.view.started ? 'Resume' : 'Play'}</button
							>
						{/if}
						<button
							type="button"
							data-testid="live-stop"
							disabled={live.view.outcome !== undefined}
							onclick={() => live?.view.stop()}>Stop</button
						>
						{#if !follow}
							<button type="button" data-testid="follow-live" onclick={() => (follow = true)}
								>Follow</button
							>
						{/if}
					</div>
					{#if live.view.breakpoint}
						<p class="breakpoint-hit" role="status" data-testid="live-breakpoint">
							Paused at a breakpoint: {BREAKPOINT_LABELS[live.view.breakpoint.kind]} on turn {live
								.view.breakpoint.tick}
							(<span class="mono">{live.view.breakpoint.eventType}</span>).
						</p>
					{/if}
				</div>
			{/if}
			<label class="scrubber">
				<span>Turn {tick} of {lastTick}</span>
				<input
					type="range"
					min="0"
					max={lastTick}
					value={tick}
					data-testid="run-scrubber"
					oninput={(e) => {
						follow = false;
						tick = Number(e.currentTarget.value);
					}}
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
			{#if evaluations.length > 0}
				<!-- Evaluations (WP43): every stored verdict over this run; an evidence tick scrubs to it. -->
				<div class="evaluations" data-testid="evaluations">
					<h2>Evaluations</h2>
					<ul>
						{#each evaluations as record (record.id)}
							<li data-testid="run-evaluation-{record.evaluatorId}" data-verdict={record.result.verdict ?? 'none'}>
								<strong>{record.result.verdict ?? '—'}</strong>
								<span class="mono">{record.evaluatorId}</span>
								{#if record.result.score !== undefined}<span class="mono">score {record.result.score}</span>{/if}
								<p>{record.result.explanation}</p>
								{#if record.result.evidence.length > 0}
									<p class="evidence">
										{#each record.result.evidence as row (row.eventId)}
											<button type="button" class="tick" onclick={() => (tick = row.tick)}>
												tick {row.tick}
											</button>
										{/each}
									</p>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/if}
			<div class="inspector-head">
				<h2>Inspector</h2>
				{#if promptDiff}
					<label class="check">
						<input type="checkbox" bind:checked={showDiff} data-testid="show-diff" /> Diff vs previous
					</label>
				{/if}
				<label class="check">
					<input type="checkbox" bind:checked={showRaw} data-testid="show-raw" /> Raw JSON
				</label>
			</div>
			{#if showRaw && selectedEvent}
				<pre class="raw" data-testid="raw-json">{JSON.stringify(selectedEvent, null, 2)}</pre>
			{:else if showDiff && promptDiff}
				{#if promptDiff.first}
					<!-- Said, not left blank: "there is no diff" and "the diff is empty"
					     are different facts. -->
					<p class="empty" data-testid="diff-first">
						This is the first prompt of the run — there is nothing before it to compare.
					</p>
				{:else}
					<div class="diff" data-testid="prompt-diff">
						{#each promptDiff.messages as message (message.section)}
							<section class="diff-section" data-changed={message.changed}>
								<h3>
									{message.section}
									{#if !message.changed}<span class="unchanged">unchanged</span>{/if}
								</h3>
								{#if message.changed}
									<pre>{#each message.lines as line, index (index)}<span
												class="line"
												data-kind={line.kind}
												>{line.kind === 'added'
													? '+'
													: line.kind === 'removed'
														? '-'
														: ' '} {line.text}
</span>{/each}</pre>
								{/if}
							</section>
						{/each}
					</div>
				{/if}
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

	/* The live chip is the oscilloscope green `17-…` §5 reserves for "this is moving" — with its word beside it. */
	.chip.live {
		border-color: var(--cab-scope);
		color: var(--cab-ink);
		background: color-mix(in srgb, var(--cab-scope) 25%, transparent);
	}

	.live-controls {
		display: grid;
		gap: var(--cab-space-2);
		padding: var(--cab-space-2);
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-panel);
		font-size: var(--cab-text-sm);
	}

	.breakpoints {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-2);
		margin: 0;
		padding: var(--cab-space-1) var(--cab-space-2);
		border: 1px solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-part);
	}

	.breakpoints legend {
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--cab-ink-muted);
	}

	.live-buttons {
		display: flex;
		gap: var(--cab-space-2);
	}

	.breakpoint-hit {
		margin: 0;
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

	.members {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-2);
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

	.evaluations {
		margin-bottom: var(--cab-space-3);
		padding-bottom: var(--cab-space-2);
		border-bottom: 1px solid color-mix(in srgb, var(--cab-ink) 12%, transparent);
	}

	.evaluations h2 {
		margin: 0 0 var(--cab-space-1);
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--cab-ink-muted);
	}

	.evaluations ul {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: var(--cab-space-1);
		font-size: var(--cab-text-sm);
	}

	.evaluations p {
		margin: 2px 0 0;
	}

	.evaluations .tick {
		font: inherit;
		font-size: var(--cab-text-xs);
		margin-right: var(--cab-space-1);
		padding: 0 var(--cab-space-1);
		border: 1px solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-part);
		background: var(--cab-paper);
		cursor: pointer;
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

	.diff {
		max-height: 62vh;
		overflow: auto;
	}

	.diff-section h3 {
		display: flex;
		gap: var(--cab-space-2);
		margin: var(--cab-space-2) 0 2px;
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--cab-ink-muted);
	}

	.unchanged {
		text-transform: none;
		letter-spacing: 0;
	}

	.diff pre {
		margin: 0;
		padding: var(--cab-space-1);
		font-size: var(--cab-text-xs);
		white-space: pre-wrap;
		background: var(--cab-paper);
		border-radius: var(--cab-radius-part);
	}

	/*
	 * The sign carries it — `+`, `-`, or a space — and the colour agrees.
	 * `04-…` §7: never colour alone, and a diff read by somebody who cannot see
	 * red is still a diff.
	 */
	.line[data-kind='added'] {
		color: var(--cab-green-text);
		font-weight: 600;
	}

	.line[data-kind='removed'] {
		color: var(--cab-red-text);
		text-decoration: line-through;
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
