<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		DEFAULT_REQUEST_TIMEOUT_MS,
		DEFAULT_TICK_BUDGET,
		DEFAULT_TOKEN_BUDGET,
		type AnyAgentSpec,
		type EngineEvent,
		type GroupRunRecord,
		type LLMProvider,
		type RunRecord
	} from '@craftabot/core';
	import { capabilitiesOf } from '$lib/bot-capabilities.js';
	import { chooseBrain, noBatteryMessage } from '$lib/brain.js';
	import { createRegistry, packVersions } from '$lib/packs.js';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import { preferences } from '$lib/state/preferences.svelte.js';
	import { persistRunSummary } from '$lib/state/run-summaries.js';
	import type { Storage } from '$lib/state/storage.js';
	import {
		createGroupSessionView,
		type GroupSessionView,
		type MemberView
	} from '$lib/state/session-group.svelte.js';
	import { recordTrace, type TraceRecorder } from '$lib/state/trace-recorder.js';
	import ApprovalCard from '$lib/components/play/ApprovalCard.svelte';
	import RunControls from '$lib/components/play/RunControls.svelte';
	import StoryStrip from '$lib/components/play/StoryStrip.svelte';
	import ThoughtBubble from '$lib/components/play/ThoughtBubble.svelte';
	import WorldStage from '$lib/components/play/WorldStage.svelte';

	/**
	 * **The Playroom, for two** (WP31, `24-ROBOT-FRIENDS-DESIGN.md` §4.3, §10
	 * stage B) — the same `WorldView` the solo Kit plays in, fed by
	 * `createGroupSessionView` instead of `createSessionView`, over a real
	 * `SessionGroup`.
	 *
	 * Reached as `/play/duo?a=<agentId>&b=<agentId>&card=<goalCardId>` — query
	 * params, mirroring the Workshop Compare view's own `?a=&b=` convention
	 * (`workshop/compare/+page.svelte`) rather than inventing a second one for
	 * "exactly two ids" in one route.
	 *
	 * **No picker yet.** Stage E adds the Robot Friends bench lever that builds
	 * this URL; this stage is reached by typing it (or a test navigating
	 * directly), so that this stage's own risk — live two-robot rendering — is
	 * proven on its own before the picker's risk (shelf-filtering UX) is added
	 * on top (`24-…` §10).
	 */

	const registry = createRegistry();
	const agentIdA = $derived(page.url.searchParams.get('a') ?? '');
	const agentIdB = $derived(page.url.searchParams.get('b') ?? '');
	const goalCardId = $derived(page.url.searchParams.get('card') ?? '');

	let view = $state<GroupSessionView | undefined>(undefined);
	let busy = $state(false);
	/** Set once loading fails for a reason worth telling the player about. */
	let loadError = $state<string | undefined>(undefined);

	const goalCard = $derived(goalCardId ? registry.getGoalCard(goalCardId) : undefined);

	/**
	 * **Live persistence** (WP31, `24-…` §4.5) — the duo counterpart to the
	 * solo Play route's own `beginRun`/`updateProgress`/`finishRun` trio,
	 * writing as the episode happens rather than once at the end (`16-…` §1.4,
	 * `12-…` D15: a stored run with an empty story is what closing the tab
	 * mid-run used to leave behind).
	 *
	 * Opened once when the pair is loaded (`load()`), the same reason solo
	 * opens `storage` once when the agent loads: recorder creation on
	 * `group.started` has to be synchronous, and an `await` in between would
	 * drop every event that arrived while it settled.
	 */
	let storage: Storage | undefined;
	/** Each member's own launch-time spec (§4.1) — what its `RunRecord.specSnapshot` needs. */
	let memberSpecs = new Map<string, AnyAgentSpec>();
	/** One `TraceRecorder` per member, keyed by `agentId`; created together on `group.started`. */
	let memberRecorders = new Map<string, TraceRecorder>();
	/** The group's own merged trace, fed every event — the live counterpart to `group-recorder.ts`'s batch `mergedEvents`. */
	let groupRecorder: TraceRecorder | undefined;
	let groupStartedAt: string | undefined;

	$effect(() => {
		void load(agentIdA, agentIdB, goalCardId);
	});

	async function load(idA: string, idB: string, cardId: string): Promise<void> {
		loadError = undefined;
		view = undefined;
		memberSpecs = new Map();
		memberRecorders = new Map();
		groupRecorder = undefined;
		groupStartedAt = undefined;

		if (!idA || !idB || !cardId) {
			loadError = 'This link is missing a robot or a card.';
			return;
		}
		if (idA === idB) {
			loadError = 'Robot Friends needs two different robots.';
			return;
		}

		storage = await appStorage();
		const [a, b] = await Promise.all([storage.getAgent(idA), storage.getAgent(idB)]);
		if (!a || !b) {
			loadError = 'One of these robots is not on the shelf any more.';
			return;
		}

		const card = registry.getGoalCard(cardId);
		if (!card) {
			loadError = `"${cardId}" is not a card this build knows.`;
			return;
		}

		/*
		 * Launch-time snapshots, never the shelf's own spec (`24-…` §4.1): the
		 * goal card is overridden for this run only, and neither bot's own
		 * stored record is ever written to. `SessionGroup` itself would refuse
		 * two members whose specs name different cards, so both snapshots
		 * agree on `cardId` by construction, not by coincidence.
		 */
		const launches = [a, b].map((record) => {
			const spec = { ...record.spec, goalCardId: cardId };
			const can = capabilitiesOf(spec, registry);
			const cartridge = registry.getCartridge(can.cartridgeId);
			const brain = chooseBrain(cartridge, cardId, registry, can);
			return { record, spec, cartridge, brain };
		});

		const missingBattery = launches.find((launch) => !launch.brain.ok);
		if (missingBattery) {
			loadError = `${missingBattery.record.spec.name}: ${noBatteryMessage(missingBattery.cartridge, registry)}`;
			return;
		}

		memberSpecs = new Map(launches.map((launch) => [launch.spec.id, launch.spec]));

		view = createGroupSessionView({
			members: launches.map((launch) => ({
				spec: launch.spec,
				provider: (launch.brain as { ok: true; provider: LLMProvider }).provider
			})),
			goalCardId: cardId,
			onEvent: onGroupEvent
		});
	}

	/**
	 * Every event the group produces, member and group-lifecycle alike — the
	 * one place recording happens, mirroring the solo route's own `onRunEvent`.
	 */
	function onGroupEvent(event: EngineEvent): void {
		if (event.type === 'group.started') beginGroup();
		groupRecorder?.accept(event);
		if (event.agentId !== undefined) memberRecorders.get(event.agentId)?.accept(event);
		if (event.type === 'tick.completed') {
			if (event.agentId !== undefined) void putMemberRow(event.agentId);
			void putGroupRow();
		}
		if (event.type === 'run.finished' && event.agentId !== undefined)
			memberSaves.push(finishMember(event.agentId));
		if (event.type === 'group.finished') void finishGroup();
	}

	/**
	 * The opening rows, the moment the group actually starts — not before,
	 * since `view.groupRunId`/`view.members[n].runId` are known at
	 * construction but a row for a run that group.started has not yet
	 * confirmed would be a row for a group that might never begin.
	 */
	function beginGroup(): void {
		if (!view || !storage) return;
		groupStartedAt = new Date().toISOString();
		memberRecorders = new Map(
			view.members.map((member) => [member.agentId, recordTrace(member.runId, storage!)])
		);
		groupRecorder = recordTrace(view.groupRunId ?? '', storage);
		for (const member of view.members) void putMemberRow(member.agentId);
		void putGroupRow();
	}

	/** Read back from `member.events` the same way solo's own `runStartedFacts` does. */
	function memberStartedFacts(member: MemberView) {
		const started = member.events.find((event) => event.type === 'run.started');
		return started?.type === 'run.started' ? started.payload : undefined;
	}

	function toMemberRunRecord(
		member: MemberView,
		spec: AnyAgentSpec,
		groupRunId: string,
		pinned: boolean
	): RunRecord {
		const facts = memberStartedFacts(member);
		return $state.snapshot({
			id: member.runId,
			agentId: member.agentId,
			agentName: member.name,
			goalCardId: spec.goalCardId,
			specSnapshot: spec,
			packVersions: packVersions(),
			mode: facts?.mode ?? 'step',
			outcome: member.outcome ?? 'IN_PROGRESS',
			ticks: member.tick,
			usage: member.usage,
			budgets: facts?.budgets ?? {
				maxTicks: DEFAULT_TICK_BUDGET,
				maxTokens: DEFAULT_TOKEN_BUDGET,
				requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS
			},
			providerId: facts?.providerId ?? 'unrecorded',
			wireModel: facts?.wireModel ?? 'unrecorded',
			pinned,
			startedAt: groupStartedAt ?? new Date().toISOString(),
			...(member.outcome !== undefined ? { finishedAt: new Date().toISOString() } : {}),
			groupRunId,
			schemaVersion: 2
		});
	}

	/** Combined member usage, live — always available, unlike `group.finished`'s own payload. */
	function groupUsage(): { inputTokens: number; outputTokens: number } {
		return (view?.members ?? []).reduce(
			(sum, member) => ({
				inputTokens: sum.inputTokens + member.usage.inputTokens,
				outputTokens: sum.outputTokens + member.usage.outputTokens
			}),
			{ inputTokens: 0, outputTokens: 0 }
		);
	}

	function toGroupRunRecord(cardId: string, pinned: boolean): GroupRunRecord | undefined {
		if (!view?.groupRunId) return undefined;
		return $state.snapshot({
			id: view.groupRunId,
			goalCardId: cardId,
			memberRunIds: view.members.map((member) => member.runId),
			memberAgentIds: view.members.map((member) => member.agentId),
			outcome: view.outcome ?? 'IN_PROGRESS',
			rounds: view.round,
			usage: groupUsage(),
			pinned,
			startedAt: groupStartedAt ?? new Date().toISOString(),
			...(view.outcome !== undefined ? { finishedAt: new Date().toISOString() } : {}),
			schemaVersion: 1
		});
	}

	async function putMemberRow(agentId: string): Promise<void> {
		if (!storage || !view?.groupRunId) return;
		const member = view.members.find((entry) => entry.agentId === agentId);
		const spec = memberSpecs.get(agentId);
		if (!member || !spec) return;
		const existing = await storage.getRun(member.runId);
		await storage.putRun(
			toMemberRunRecord(member, spec, view.groupRunId, existing?.pinned ?? false)
		);
	}

	async function putGroupRow(): Promise<void> {
		if (!storage || !view?.groupRunId) return;
		const existing = await storage.getGroupRun(view.groupRunId);
		const record = toGroupRunRecord(goalCardId, existing?.pinned ?? false);
		if (record) await storage.putGroupRun(record);
	}

	async function finishMember(agentId: string): Promise<void> {
		const recorder = memberRecorders.get(agentId);
		await recorder?.stop();
		await putMemberRow(agentId);
		// Each member's own summary, folded once now its run is finished (WP36
		// stage C) — from the recorder's own copy of exactly what it stored.
		const runId = view?.members.find((entry) => entry.agentId === agentId)?.runId;
		if (storage && runId && recorder) await persistRunSummary(storage, runId, recorder.events());
	}

	/**
	 * Each member's own persistence, so the group's ending can wait for all of
	 * them before it says the episode is saved (WP56 stage A). Reset when a
	 * group starts.
	 */
	let memberSaves: Promise<void>[] = [];
	/** True once every member's row and summary and the group's row are stored. */
	let saved = $state(false);

	async function finishGroup(): Promise<void> {
		await groupRecorder?.stop();
		await putGroupRow();
		await Promise.all(memberSaves);
		// The unit of retention is the episode, not either bot's own half of it
		// — solo evicts on every finished run, and a duo Kit session that never
		// finishes a solo run of its own deserves the same housekeeping.
		await storage?.evictOldRuns(preferences.runCap);
		saved = true;
	}

	/** The member whose own turn `WorldView` should foreground right now (`23-…` §4.3). */
	const foregrounded = $derived(
		view?.members.find((member) => member.agentId === view?.foregroundedAgentId)
	);

	/** agentId → display name, for `StoryStrip` to narrate both robots by name (`24-…` §4.4). */
	const actors = $derived(
		new Map((view?.members ?? []).map((member) => [member.agentId, member.name]))
	);

	async function step(): Promise<void> {
		if (!view) return;
		busy = true;
		try {
			await view.stepRound();
		} finally {
			busy = false;
		}
	}

	function play(): void {
		view?.start('play');
	}

	function pause(): void {
		view?.pause();
	}

	function stop(): void {
		view?.stop();
	}
</script>

<svelte:head><title>Playroom — Robot Friends</title></svelte:head>

{#if loadError}
	<main class="loading">
		<p data-testid="duo-load-error">{loadError}</p>
		<a href={resolve('/')}>← Back to the shelf</a>
	</main>
{:else if !view}
	<main class="loading"><p>Fetching your robots…</p></main>
{:else}
	<main class="play" data-testid="duo-play">
		{#if goalCard}
			<p class="goal" data-testid="duo-goal">{goalCard.goalText}</p>
		{/if}

		<div class="stage">
			<section class="world" aria-label="The Playroom">
				<WorldStage
					world={view.world}
					view={goalCard ? registry.getWorld(goalCard.worldId)?.view : undefined}
					saying={foregrounded?.saying}
					expression={foregrounded?.expression ?? 'idle'}
					outcome={view.outcome}
					events={foregrounded?.events ?? []}
				/>
				<StoryStrip events={view.mergedEvents} {actors} />
			</section>

			<aside class="side">
				{#if view.pendingApproval}
					{@const asking = view.members.find(
						(member) => member.agentId === view?.pendingApproval?.agentId
					)}
					<ApprovalCard
						approval={view.pendingApproval}
						botName={asking?.name ?? 'A robot'}
						onallow={() => view?.resolveApproval(view.pendingApproval?.agentId ?? '', true)}
						ondeny={() => view?.resolveApproval(view.pendingApproval?.agentId ?? '', false)}
					/>
				{/if}

				{#each view.members as member (member.agentId)}
					<div class="member" data-testid="member-{member.agentId}">
						<h2>{member.name}</h2>
						<ThoughtBubble thought={member.thought} narration={member.narration} />
						<p class="tick" data-testid="member-tick-{member.agentId}">Turn {member.tick}</p>
						{#if member.outcome}
							<p
								class="outcome"
								data-outcome={member.outcome}
								data-testid="member-outcome-{member.agentId}"
							>
								{member.outcome}
							</p>
						{/if}
					</div>
				{/each}

				<RunControls
					running={view.status === 'running'}
					finished={view.outcome !== undefined}
					{busy}
					speed={1}
					onstep={step}
					onplay={play}
					onpause={pause}
					onstop={stop}
				/>

				<a class="back" href={resolve('/')}>← Back to the shelf</a>
			</aside>
		</div>

		{#if view.outcome}
			<!--
				A plain banner, not the solo Play route's EndCard modal — that
				component's own hint copy is written against one bot's own trace
				(`end-card-hint.ts`), and a proper duo ending is a later polish
				pass, not this stage's job (`24-…` §10 stage B).
			-->
			<p class="finished" role="status" data-testid="duo-finished">
				The adventure is over: <strong data-outcome={view.outcome}>{view.outcome}</strong>
				{#if saved}
					<span data-testid="duo-saved">Saved to the Scrapbook.</span>
				{/if}
			</p>
		{/if}
	</main>
{/if}

<style>
	.loading {
		padding: var(--cab-space-7);
		text-align: center;
		display: grid;
		gap: var(--cab-space-3);
	}

	.play {
		max-width: 1280px;
		margin-inline: auto;
		padding: var(--cab-space-4);
		display: grid;
		gap: var(--cab-space-4);
	}

	.goal {
		margin: 0;
		font-size: var(--cab-text-base);
		font-weight: 600;
	}

	.stage {
		display: grid;
		grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr);
		gap: var(--cab-space-4);
		align-items: start;
	}

	.side {
		display: grid;
		gap: var(--cab-space-3);
	}

	.member {
		display: grid;
		gap: var(--cab-space-1);
		padding: var(--cab-space-2);
		background: var(--cab-cream);
		border: var(--cab-border-part) solid color-mix(in srgb, var(--cab-ink) 25%, transparent);
		border-radius: var(--cab-radius-panel);
	}

	.member h2 {
		margin: 0;
		font-size: var(--cab-text-sm);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.tick {
		margin: 0;
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted);
	}

	.outcome {
		margin: 0;
		font-size: var(--cab-text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
	}

	.outcome[data-outcome='SUCCESS'] {
		color: var(--cab-green-text);
	}

	.finished {
		margin: 0;
		padding: var(--cab-space-3);
		font-size: var(--cab-text-sm);
		background: var(--cab-cream);
		border: var(--cab-border-part) solid var(--cab-ink);
		border-radius: var(--cab-radius-panel);
	}

	.finished strong[data-outcome='SUCCESS'] {
		color: var(--cab-green-text);
	}

	.back {
		color: var(--cab-blue-text);
		font-size: var(--cab-text-sm);
		font-weight: 600;
		text-decoration: none;
	}

	.back:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	@media (max-width: 1000px) {
		.stage {
			grid-template-columns: 1fr;
		}
	}
</style>
