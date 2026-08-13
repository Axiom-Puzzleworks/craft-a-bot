<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		DEFAULT_REQUEST_TIMEOUT_MS,
		DEFAULT_TICK_BUDGET,
		DEFAULT_TOKEN_BUDGET,
		buildTraceFile,
		type AgentRecord,
		type RunRecord
	} from '@craftabot/core';
	import { capabilitiesOf } from '$lib/bot-capabilities.js';
	import { chooseBrain } from '$lib/brain.js';
	import { demoVariantFor, hasDemoPlan } from '$lib/demo-brain.js';
	import { leafletStore } from '$lib/leaflet/leaflet.svelte.js';
	import { preferences } from '$lib/state/preferences.svelte.js';
	import { createRegistry, packVersions } from '$lib/packs.js';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import { createBrowserKeyVault } from '$lib/state/keys.js';
	import { createSessionView, type SessionView } from '$lib/state/session.svelte.js';
	import ApprovalCard from '$lib/components/play/ApprovalCard.svelte';
	import EndCard from '$lib/components/play/EndCard.svelte';
	import HeadUp from '$lib/components/play/HeadUp.svelte';
	import RunControls from '$lib/components/play/RunControls.svelte';
	import ThoughtBubble from '$lib/components/play/ThoughtBubble.svelte';
	import WorldView from '$lib/components/play/WorldView.svelte';
	import TraceDrawer from '$lib/components/trace/TraceDrawer.svelte';

	/**
	 * The Playroom in PLAY mode (03-UI-UX-DESIGN.md §5).
	 *
	 * The brain is the keyless demo brain until WP7 brings the real one; the loop,
	 * the world, the events, and the trace are all completely real.
	 */

	const registry = createRegistry();
	const agentId = $derived(page.params.agentId ?? '');

	let record = $state<AgentRecord | undefined>(undefined);
	let view = $state<SessionView | undefined>(undefined);
	// The preferred speed is the *starting* speed; the dial still overrides it
	// for the current run (03 §7).
	let speed = $state(preferences.tickSpeed);
	let busy = $state(false);
	let dismissedEndCard = $state(false);
	let runStartedAt = $state<string | undefined>(undefined);
	let missingBattery = $state(false);
	let keyless = $state(true);

	const goalCard = $derived(record ? registry.getGoalCard(record.spec.goalCardId) : undefined);
	const goalText = $derived(
		record?.spec.customGoalText?.trim() !== undefined && record?.spec.customGoalText?.trim() !== ''
			? (record?.spec.customGoalText ?? '')
			: (goalCard?.goalText ?? '')
	);
	// Only the keyless demo brain follows a script; a real model does not.
	const scripted = $derived(record ? !keyless || hasDemoPlan(record.spec.goalCardId) : false);

	$effect(() => {
		// Loading the agent and standing up a session is async work.
		void openAgent(agentId);
	});

	// A muted fanfare the first time a run succeeds (04 §6).
	let cheered = $state(false);
	$effect(() => {
		if (view?.outcome === 'SUCCESS' && !cheered) {
			cheered = true;
			preferences.cue('fanfare');
		}
	});

	// What the leaflet needs to know about this run (03 §6).
	const leaflet = leafletStore();
	$effect(() => {
		const loaded = record;
		if (!loaded) return;
		const can = capabilitiesOf(loaded.spec, registry);
		leaflet.report({
			can,
			goalCardId: loaded.spec.goalCardId,
			outcome: view?.outcome,
			variant: demoVariantFor(loaded.spec.goalCardId, can),
			ticks: view?.tick ?? 0,
			usedTools:
				view?.events
					.filter((event) => event.type === 'tool.executed')
					.map((event) => (event.type === 'tool.executed' ? event.payload.name : '')) ?? [],
			sawApproval: view?.events.some((event) => event.type === 'approval.requested') ?? false
		});
	});

	async function openAgent(id: string): Promise<void> {
		const storage = await appStorage();
		const loaded = await storage.getAgent(id);
		record = loaded;
		if (!loaded) return;

		/*
		 * What this bot can do, which is all the demo brain needs (WP14 slice 4c).
		 * It read the bot through V1's six-key window until this slice — the last
		 * place in the app that did.
		 */
		const can = capabilitiesOf(loaded.spec, registry);
		const cartridge = registry.getCartridge(can.cartridgeId);
		const brain = chooseBrain(cartridge, loaded.spec.goalCardId, can);
		if (!brain.ok) {
			missingBattery = true;
			return;
		}
		keyless = brain.keyless;
		/*
		 * No policy is compiled here any more (WP14 slice 3d).
		 *
		 * Before WP8 the Safety panel wrote settings nothing ever read (08 §3);
		 * WP8 fixed that by having this page compile the brick and hand the rules
		 * to the session. The brick now installs its own, so a bot's policy
		 * travels with the bot rather than depending on the screen it was launched
		 * from — and a Monitor brick works here with no change at all.
		 */
		view = createSessionView({
			spec: loaded.spec,
			provider: brain.provider
		});
		view.setSpeed(speed);
		runStartedAt = new Date().toISOString();
	}

	/**
	 * Persist the run when it ends, so the Flight Recorder's export is a real
	 * stored artefact rather than something assembled on the fly (07 §3).
	 */
	async function persistRun(session: SessionView): Promise<void> {
		if (!record || !session.runId || !session.outcome) return;
		const storage = await appStorage();
		const run = toRunRecord(session, record);
		await storage.putRun(run);
		await storage.appendEvents(session.runId, session.events);
		await storage.evictOldRuns();
	}

	/**
	 * What the run recorded about itself, read back out of its own trace.
	 *
	 * Everything here that used to be guessed is now taken from `run.started`
	 * (E8, `14-…` §3): the mode was hard-coded to `'step'` so a run played
	 * straight through was filed as a stepped one (`12-…` D15), and the budgets
	 * and the model were simply absent (D6). Deriving them from the event
	 * rather than from the component's own state is hard rule 3 doing its job —
	 * if it is not in an event it did not happen, and if it *is*, the record
	 * and the trace cannot disagree.
	 */
	function runStartedFacts(session: SessionView) {
		const started = session.events.find((event) => event.type === 'run.started');
		return started?.type === 'run.started' ? started.payload : undefined;
	}

	function toRunRecord(session: SessionView, agent: AgentRecord): RunRecord {
		const facts = runStartedFacts(session);
		return {
			id: session.runId ?? crypto.randomUUID(),
			agentId: agent.id,
			agentName: agent.spec.name,
			goalCardId: agent.spec.goalCardId,
			specSnapshot: agent.spec,
			packVersions: packVersions(),
			mode: facts?.mode ?? 'step',
			outcome: session.outcome ?? 'IN_PROGRESS',
			ticks: session.tick,
			usage: session.usage,
			budgets: facts?.budgets ?? {
				maxTicks: DEFAULT_TICK_BUDGET,
				maxTokens: DEFAULT_TOKEN_BUDGET,
				requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS
			},
			providerId: facts?.providerId ?? 'unrecorded',
			wireModel: facts?.wireModel ?? 'unrecorded',
			pinned: false,
			startedAt: runStartedAt ?? new Date().toISOString(),
			finishedAt: new Date().toISOString(),
			schemaVersion: 2
		};
	}

	async function step(): Promise<void> {
		if (!view) return;
		busy = true;
		try {
			await view.step();
			if (view.outcome) await persistRun(view);
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
		if (view?.outcome) void persistRun(view);
	}

	function reset(): void {
		view?.reset();
		dismissedEndCard = false;
	}

	function setSpeed(multiplier: number): void {
		speed = multiplier;
		view?.setSpeed(multiplier);
	}

	/** Export the trace as JSON, scrubbed of anything key-shaped (07 §5). */
	async function exportTrace(): Promise<void> {
		if (!view || !record) return;
		const secrets = createBrowserKeyVault().secrets();
		const trace = await buildTraceFile(toRunRecord(view, record), view.events, { secrets });

		const url = URL.createObjectURL(
			new Blob([JSON.stringify(trace, null, '\t')], { type: 'application/json' })
		);
		const link = document.createElement('a');
		link.href = url;
		link.download = `${record.spec.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.craftabot-trace.json`;
		link.click();
		URL.revokeObjectURL(url);
	}
</script>

<svelte:head><title>Playroom — {record?.spec.name ?? 'Craft A Bot'}</title></svelte:head>

{#if missingBattery}
	<main class="loading" data-testid="play-no-battery">
		<p>Batteries not included! Pop your OpenAI key into the battery compartment first.</p>
		<a href={resolve('/settings')}>Open the battery compartment</a>
	</main>
{:else if !record || !view}
	<main class="loading"><p>Fetching your bot…</p></main>
{:else}
	<main class="play">
		<HeadUp
			botName={record.spec.name}
			{goalText}
			tick={view.tick}
			maxTicks={view.maxTicks}
			usage={view.usage}
			lamp={view.lamp}
		/>

		{#if !scripted}
			<p class="notice" data-testid="unscripted-notice">
				This Goal Card has no scripted demo yet, so the bot will potter about instead. A real brain
				arrives with the OpenAI pack.
			</p>
		{/if}

		<div class="stage">
			<section class="world" aria-label="The Playroom">
				<WorldView world={view.world} saying={view.saying} />
			</section>

			<aside class="side">
				{#if view.pendingApproval}
					<ApprovalCard
						approval={view.pendingApproval}
						botName={record.spec.name}
						onallow={() => view?.resolveApproval(true)}
						ondeny={() => view?.resolveApproval(false)}
					/>
				{/if}
				<ThoughtBubble thought={view.thought} narration={view.narration} />
				<RunControls
					running={view.status === 'running'}
					finished={view.outcome !== undefined}
					{busy}
					{speed}
					onstep={step}
					onplay={play}
					onpause={pause}
					onstop={stop}
					onreset={reset}
					onspeed={setSpeed}
				/>
				<a
					class="back"
					data-tutorial="back-to-bench"
					href={resolve('/bench/[agentId]', { agentId })}>← Back to the bench</a
				>
			</aside>
		</div>

		<TraceDrawer events={view.events} onexport={exportTrace} />
	</main>

	{#if view.outcome && !dismissedEndCard}
		<EndCard
			outcome={view.outcome}
			onseeTrace={() => (dismissedEndCard = true)}
			onbackToBench={() => goto(resolve('/bench/[agentId]', { agentId }))}
		/>
	{/if}
{/if}

<style>
	.play {
		max-width: 1280px;
		margin-inline: auto;
		padding: var(--cab-space-4);
		display: grid;
		gap: var(--cab-space-4);
	}

	.loading {
		padding: var(--cab-space-7);
		text-align: center;
	}

	.notice {
		margin: 0;
		padding: var(--cab-space-3);
		font-size: var(--cab-text-sm);
		background: color-mix(in srgb, var(--cab-yellow) 25%, var(--cab-cream));
		border: var(--cab-border-part) solid var(--cab-yellow);
		border-radius: var(--cab-radius-panel);
	}

	.stage {
		display: grid;
		grid-template-columns: minmax(0, 1.6fr) minmax(260px, 1fr);
		gap: var(--cab-space-4);
		align-items: start;
	}

	.side {
		display: grid;
		gap: var(--cab-space-4);
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
