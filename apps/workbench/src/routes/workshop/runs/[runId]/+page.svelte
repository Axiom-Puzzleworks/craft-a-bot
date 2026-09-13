<script lang="ts">
	import { page } from '$app/state';
	import Lamp from '$lib/components/control-room/Lamp.svelte';
	import LinkedFrom from '$lib/components/workshop/LinkedFrom.svelte';
	import { registerActions } from '$lib/workshop/actions.svelte.js';
	import { referrersOf, type Referrer } from '$lib/workshop/referrers.js';
	import { statusOfOutcome } from '$lib/control-room/outcome.js';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		buildTraceFile,
		isDeskWorldState,
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
	import WorldStage from '$lib/components/play/WorldStage.svelte';
	import Boundary from '$lib/components/control-room/Boundary.svelte';
	import Chain from '$lib/components/control-room/Chain.svelte';
	import { boundaryFor } from '$lib/workshop/boundary.js';
	import { createRegistry } from '$lib/packs.js';
	import { decisionExplanation } from '@craftabot/governance/reports';
	import { capabilitiesOf } from '$lib/bot-capabilities.js';
	import { completedTicks, forkStoredRun } from '$lib/workshop/fork.js';

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
	/** WP109 (`96-…` §2.4): what links to this run — its campaign cell, its workflow stage, its forks, its experiment. */
	let linkedFrom = $state<Referrer[]>([]);
	$effect(() => {
		const id = run?.id;
		if (!id) {
			linkedFrom = [];
			return;
		}
		void (async () => {
			const storage = await appStorage();
			const [runs, reports, workflowRuns, experiments] = await Promise.all([
				storage.listRuns(),
				storage.listCampaignReports(),
				storage.listWorkflowRuns(),
				storage.listExperimentResults()
			]);
			linkedFrom = referrersOf({ kind: 'run', id }, { runs, reports, workflowRuns, experiments });
		})();
	});
	/** WP109 (`96-…` §2.1): the screen's actions, on the palette while it is open. */
	$effect(() =>
		registerActions([
			{
				id: 'run-lab/fork',
				title: 'Fork from this tick',
				screen: 'Run Lab',
				run: () => void forkFromTick(),
				disabled: !run
			},
			{
				id: 'run-lab/explain',
				title: showExplain ? 'Hide the explanation' : 'Explain this decision',
				screen: 'Run Lab',
				run: () => (showExplain = !showExplain),
				disabled: !run
			}
		])
	);
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
	/** "Explain this decision" (WP66, `54-…` §4.5) — the fold over the selected row's tick, off until asked for. */
	let showExplain = $state(false);
	/** "Fork from this tick": running, or what went wrong the last time. */
	let forking = $state(false);
	let forkError = $state<string | undefined>(undefined);

	const lastTick = $derived(events.at(-1)?.tick ?? 0);
	const lanes = $derived(lanesPresent(events));
	const ticks = $derived(buildTimeline(events, filter));
	const shown = $derived(projectThrough(events, tick));
	/**
	 * The Boundary map over this run (WP57, `44-…` §4.5): folded once from the
	 * run's own spec snapshot, the registry and the events; the scrubber's
	 * tick lights the edge that fired. A group episode draws the `agent`
	 * seat's — found through `group.started.memberRoles` (WP55, `46-…` §4.6),
	 * or the first member when no seat was given a role; the other seats are
	 * the map's counterparts, named and given their roles by the fold.
	 */
	const boundaryRegistry = createRegistry();
	const agentSeat = $derived.by(() => {
		if (run) return run;
		const started = events.find((event) => event.type === 'group.started');
		const roles = started?.type === 'group.started' ? started.payload.memberRoles : undefined;
		return (
			groupMembers.find((member) => roles?.[member.agentId] === 'agent') ?? groupMembers[0]
		);
	});
	const boundary = $derived(
		agentSeat && events.length > 0
			? boundaryFor(
					agentSeat.specSnapshot,
					boundaryRegistry,
					events,
					Object.fromEntries(groupMembers.map((member) => [member.agentId, member.agentName]))
				)
			: undefined
	);
	const selectedEvent = $derived(selected === undefined ? undefined : events[selected]);
	/** Who started the run (WP65) — `run.started.principal`, when the host named one. */
	const runPrincipal = $derived.by(() => {
		const started = events.find((event) => event.type === 'run.started');
		return started?.type === 'run.started' ? started.payload.principal : undefined;
	});
	/** A nameless person is said to be one (UX-3), with the id shortened; the tooltip keeps the whole chain. */
	const principalLabel = (principal: { kind: string; name?: string; id: string }) =>
		principal.name ??
		(principal.kind === 'person' ? `an unnamed person (${principal.id.slice(0, 8)}…)` : principal.id);
	/** The chain, one line, for the chip's tooltip: `person Sam for service craftabot-harness`. */
	const principalChainText = $derived.by(() => {
		const parts: string[] = [];
		for (let at = runPrincipal; at; at = at.onBehalfOf) parts.push(`${at.kind} ${principalLabel(at)}`);
		return parts.join(' for ');
	});
	/**
	 * **Explain** (WP66, `54-…` §4.4–4.5): the decision of the selected row's
	 * tick — the row itself when it is one, else the tick's first — explained
	 * from the trace alone by governance's fold, with the calls the build
	 * offered read from the run's own spec snapshot (the trace carries the
	 * prompt but not the tool list). `related` is what the timeline lights.
	 */
	const explanation = $derived.by(() => {
		if (!showExplain || !run || selectedEvent === undefined) return undefined;
		const decision =
			selectedEvent.type === 'decision'
				? selectedEvent
				: events.find((event) => event.type === 'decision' && event.tick === selectedEvent.tick);
		if (!decision) return undefined;
		const can = capabilitiesOf(run.specSnapshot, boundaryRegistry);
		return decisionExplanation(events, decision.id, {
			callsAvailable: [...can.toolIds, ...can.actionIds]
		});
	});
	const relatedIds = $derived(new Set(explanation?.related ?? []));
	/** Jump the inspector to the row with this event id — the Explain panel's links. */
	function selectById(id: string): void {
		const index = events.findIndex((event) => event.id === id);
		if (index !== -1) selectRow(index, events[index]!.tick);
	}
	const completed = $derived(completedTicks(events));
	/** A fork keeps a completed tick of a run that is over; a live run's head is still moving. */
	const canFork = $derived(
		run !== undefined && !live && !forking && tick >= 1 && completed.includes(tick)
	);
	async function forkFromTick(): Promise<void> {
		if (!run || !canFork) return;
		forking = true;
		forkError = undefined;
		try {
			const storage = await appStorage();
			const fork = await forkStoredRun(storage, run.id, tick, boundaryRegistry);
			await goto(
				`${resolve('/workshop/compare')}?a=${encodeURIComponent(run.id)}&b=${encodeURIComponent(fork.runId)}&from=${tick}`
			);
		} catch (error) {
			forkError = error instanceof Error ? error.message : String(error);
		} finally {
			forking = false;
		}
	}
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
		// The Pipeline opens a stage's run at the stage's first tick (WP86, `77-…` §4); otherwise the last turn.
		const asked = page.url.searchParams.get('tick');
		const askedTick = asked === null || asked === '' ? undefined : Number(asked);
		tick =
			askedTick !== undefined && Number.isFinite(askedTick)
				? Math.max(0, Math.min(askedTick, events.at(-1)?.tick ?? 0))
				: (events.at(-1)?.tick ?? 0);
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
			<span class="chip" data-outcome={run.outcome} data-testid="header-outcome"
				><Lamp status={statusOfOutcome(run.outcome)} label={run.outcome} /></span
			>
			{#if live}
				<!-- On the live bus (WP49): the session's own status, as it is this second. -->
				<span class="chip live" data-status={live.view.status} data-testid="live-chip"
					>LIVE · {live.view.status}</span
				>
			{:else if run.outcome === 'IN_PROGRESS'}
				<!-- Imported from a file sink while the harness was still writing (WP68, `57-…` §4.5). -->
				<span class="chip" data-testid="run-in-progress"
					>still going — re-import the sink file to catch up</span
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
			{#if runPrincipal}
				<!-- Who started it (WP65, `55-…` §4.5): the principal on `run.started`, the chain as the tooltip. -->
				<span
					class="chip principal"
					data-testid="run-principal"
					data-kind={runPrincipal.kind}
					title={principalChainText}>started by {principalLabel(runPrincipal)}</span
				>
			{/if}
			{#if run.forkedFrom}
				<!-- A fork names its origin (WP66): the run it continues and the last turn it kept. -->
				<a
					class="forked"
					href={resolve('/workshop/runs/[runId]', { runId: run.forkedFrom.runId })}
					data-testid="forked-from"
					title="Played again from that run, after that turn">forked from turn {run.forkedFrom.tick}</a
				>
			{/if}
			<!--
				"Fork from this tick" (WP66, `54-…` §4.5): a new run from the
				scrubber's turn with this bot as it was, then both side by side.
				The Workshop forks without overrides; a different build is the
				harness's `craftabot fork --kit`.
			-->
			<button
				type="button"
				class="fork"
				data-testid="fork-from-tick"
				disabled={!canFork}
				title="Play it again from this turn and compare"
				onclick={() => void forkFromTick()}>{forking ? 'Forking…' : `Fork from turn ${tick}`}</button
			>
			{#if forkError}
				<span class="fork-error" role="alert" data-testid="fork-error">{forkError}</span>
			{/if}
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
				><Lamp status={statusOfOutcome(groupRun.outcome)} label={groupRun.outcome} /></span
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
	{#if run}
		<LinkedFrom links={linkedFrom} testId="run-linked-from" />
	{/if}

	<!-- A desk takes the row (UX-8): three panes in a third of the page were unreadable; the timeline and inspector sit beneath. -->
	<div class="regions" class:regions--desk={isDeskWorldState(shown.world)}>
		<section class="world" aria-label="The world at this turn">
			<WorldStage
				world={shown.world}
				saying={shown.saying}
				{expression}
				outcome={shown.outcome}
				truth={shown.truth}
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

		{#if boundary}
			<!-- The map, and beside it the explanation and the chain of the selected row (WP71, `60-…` §2 item 4). -->
			<section class="boundary-region" aria-label="Boundary">
				<div class="boundary-map">
					<h2>Boundary</h2>
					<div data-testid="run-boundary">
						<Boundary map={boundary} {tick} />
					</div>
				</div>
				<div class="beside" data-testid="beside-boundary">
					{#if showExplain && selectedEvent}
					{#if explanation}
						<!--
							Explain this decision (WP66, `54-…` §4.4): one fold, from the
							trace alone — what it saw, what it was offered, what it chose,
							who checked it, what happened. Each line is a link to its row;
							the timeline lights every related row while this is open.
						-->
						<div class="explain" data-testid="explain" data-tick={explanation.tick}>
							<h3>
								Turn {explanation.tick} · decided by the {explanation.source}
							</h3>
							<dl>
								<div>
									<dt>Saw</dt>
									<dd>
										{#if explanation.observation}
											<button type="button" class="link" onclick={() => selectById(explanation.related[0] ?? '')}
												>{explanation.observation.text || '(nothing)'}</button
											>
											{#if explanation.observation.channels.length > 0}
												<span class="mono">via {explanation.observation.channels.join(', ')}</span>
											{/if}
										{:else}
											nothing this turn
										{/if}
									</dd>
								</div>
								<div>
									<dt>Prompt</dt>
									<dd>
										{#if explanation.prompt}
											<span class="mono"
												>{explanation.prompt.sections
													.map((section) => `${section.role} ${section.chars}ch`)
													.join(' · ')} · ~{explanation.prompt.estimatedTokens} tokens</span
											>
										{:else}
											none — a reflex, not a thought
										{/if}
									</dd>
								</div>
								<div>
									<dt>Offered</dt>
									<dd class="mono" data-testid="explain-offered">
										{explanation.callsAvailable.length > 0
											? explanation.callsAvailable.join(', ')
											: 'nothing'}
									</dd>
								</div>
								<div>
									<dt>Chose</dt>
									<dd data-testid="explain-chose">
										<button type="button" class="link" onclick={() => selectById(explanation.decisionEventId)}>
											{#if explanation.decision.call}
												<span class="mono">{explanation.decision.call.name}</span>
												<span class="mono args">{JSON.stringify(explanation.decision.call.arguments)}</span>
											{:else}
												nothing
											{/if}
										</button>
										{#if explanation.decision.thought}
											<q>{explanation.decision.thought}</q>
										{/if}
									</dd>
								</div>
								<div>
									<dt>Checked</dt>
									<dd>
										{#if explanation.checks.length === 0}
											no rule looked at it
										{:else}
											<ul class="checks" data-testid="explain-checks">
												{#each explanation.checks as check, index (index)}
													<li data-verdict={check.verdict}>
														<span class="mono">{check.guardrailId}</span>
														<strong>{check.verdict}</strong>
														{#if check.reason}<span>{check.reason}</span>{/if}
														{#if check.policyCardId}<span class="mono">{check.policyCardId}</span>{/if}
													</li>
												{/each}
											</ul>
										{/if}
									</dd>
								</div>
								{#if explanation.approval}
									<div>
										<dt>Asked</dt>
										<dd>
											{explanation.approval.approved === undefined
												? 'a person, and is still waiting'
												: explanation.approval.approved
													? 'a person, who said yes'
													: 'a person, who said no'}
											{#if explanation.approval.reason}<span>— {explanation.approval.reason}</span>{/if}
										</dd>
									</div>
								{/if}
								<div>
									<dt>Did</dt>
									<dd data-testid="explain-did">
										{#if explanation.result}
											<span class="mono">{explanation.result.name}</span>
											<strong>{explanation.result.ok ? 'ok' : 'failed'}</strong>
											{#if explanation.result.narration}<span>{explanation.result.narration}</span>{/if}
											{#if explanation.result.output}<span class="mono">{explanation.result.output}</span>{/if}
											{#if explanation.result.stateDiff !== undefined}
												<pre class="diff-json">{JSON.stringify(explanation.result.stateDiff, null, 2)}</pre>
											{/if}
										{:else}
											nothing — it never got that far
										{/if}
									</dd>
								</div>
								<div>
									<dt>Had in hand</dt>
									<dd>
										{explanation.reasonsUsed.actions.length} earlier call{explanation.reasonsUsed.actions
											.length === 1
											? ''
											: 's'}
										{#if explanation.reasonsUsed.records.length > 0}
											· records <span class="mono">{explanation.reasonsUsed.records.join(', ')}</span>
										{/if}
									</dd>
								</div>
							</dl>
							<p class="related-note">
								{explanation.related.length} related rows are lit in the timeline.
							</p>
						</div>
					{:else}
						<p class="empty" data-testid="explain-empty">
							No decision on turn {selectedEvent.tick} — pick a row of a turn where the bot chose something.
						</p>
					{/if}
					{/if}
					{#if selectedEvent?.type === 'action.performed' && selectedEvent.payload.attestation}
						<Chain attestation={selectedEvent.payload.attestation} testId="chain" />
					{:else if selectedEvent?.type === 'approval.resolved' && selectedEvent.payload.by}
						<Chain by={selectedEvent.payload.by} testId="chain" />
					{/if}
				</div>
			</section>
		{/if}

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
							class:row--related={relatedIds.has(row.event.id)}
							data-lane={row.lane}
							data-related={relatedIds.has(row.event.id) ? 'true' : undefined}
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
				{#if run}
					<label class="check">
						<input type="checkbox" bind:checked={showExplain} data-testid="show-explain" /> Explain
					</label>
				{/if}
			</div>
			{#if showExplain && selectedEvent}
				<p class="empty" data-testid="explain-beside">The explanation is beside the Boundary map.</p>
			{:else if showRaw && selectedEvent}
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

	.forked {
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted);
	}

	.chip.principal {
		font-weight: 400;
		letter-spacing: 0;
		text-transform: none;
	}

	.fork {
		font: inherit;
		font-size: var(--cab-text-sm);
		padding: 2px var(--cab-space-2);
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink);
		border-radius: var(--cab-radius-pill);
		cursor: pointer;
	}

	.fork:disabled {
		cursor: default;
		opacity: 0.5;
	}

	.fork-error {
		font-size: var(--cab-text-xs);
		color: var(--cab-red);
	}

	.row--related {
		outline: 2px dashed var(--cab-teal);
		outline-offset: -2px;
	}

	.explain {
		display: grid;
		gap: var(--cab-space-2);
		font-size: var(--cab-text-sm);
	}

	.explain h3 {
		margin: 0;
		font-size: var(--cab-text-sm);
	}

	.explain dl {
		display: grid;
		gap: var(--cab-space-1);
		margin: 0;
	}

	.explain dl > div {
		display: grid;
		grid-template-columns: 6.5em 1fr;
		gap: var(--cab-space-2);
	}

	.explain dt {
		font-size: var(--cab-text-xs);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--cab-ink-muted);
	}

	.explain dd {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-1);
		align-items: baseline;
	}

	.explain .link {
		font: inherit;
		padding: 0;
		background: none;
		border: none;
		color: inherit;
		text-decoration: underline dotted;
		cursor: pointer;
		text-align: left;
	}

	.explain .args {
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted);
	}

	.explain .checks {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 2px;
	}

	.explain .checks li {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-1);
	}

	.explain .checks li[data-verdict='block'] strong,
	.explain .checks li[data-verdict='stop'] strong {
		color: var(--cab-red);
	}

	.explain .diff-json {
		margin: 0;
		width: 100%;
		font-size: var(--cab-text-xs);
		white-space: pre-wrap;
	}

	.related-note {
		margin: 0;
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted);
	}

	.regions {
		display: grid;
		grid-template-columns: minmax(280px, 1fr) minmax(240px, 0.9fr) minmax(260px, 1.1fr);
		gap: var(--cab-space-3);
		align-items: start;
	}
	/* The desk's row (UX-8): the world across the top, the timeline and inspector side by side beneath. */
	.regions--desk {
		grid-template-columns: minmax(280px, 1fr) minmax(260px, 1.2fr);
	}
	.regions--desk > .world {
		grid-column: 1 / -1;
	}

	/* The fourth region (WP57): the map wants the width, so it takes the whole row beneath the world. */
	.boundary-region {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: minmax(280px, 1.4fr) minmax(240px, 1fr);
		gap: var(--cab-space-3);
		align-items: start;
	}

	.beside {
		display: grid;
		gap: var(--cab-space-2);
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
