<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { EngineEvent, RunRecord } from '@craftabot/core';
	import StoryStrip from '$lib/components/play/StoryStrip.svelte';
	import WorldView from '$lib/components/play/WorldView.svelte';
	import { botExpression } from '$lib/bot-expression.js';
	import { outcomeFace, outcomeWords, stepsWords, whenWords } from '$lib/scrapbook.js';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import { projectThrough } from '$lib/state/run-projection.js';
	import { preferences } from '$lib/state/preferences.svelte.js';

	/**
	 * **Watch it again** (`16-…` §1.4).
	 *
	 * The whole screen is `projectThrough(events, tick)` and the same two
	 * components the Playroom uses. There is no replay clock and no second
	 * session: a stored run is a list of events, and the fold that turns events
	 * into a picture is the one the live run used (`run-projection.ts`). That is
	 * what "pixel-consistent with a live run" means here — not that two code
	 * paths were tested against each other, but that there is only one.
	 *
	 * Slice a's constraint is what makes the story strip work unchanged: it
	 * narrates from events alone, so it neither knows nor cares that this run
	 * finished yesterday.
	 */

	const runId = $derived(page.params.runId ?? '');

	let run = $state<RunRecord | undefined>(undefined);
	let events = $state<EngineEvent[]>([]);
	let loaded = $state(false);
	/** Which turn the scrubber is showing. */
	let tick = $state(0);

	const lastTick = $derived(events.length === 0 ? 0 : (events.at(-1)?.tick ?? 0));
	const shown = $derived(projectThrough(events, tick));
	const shownEvents = $derived(events.filter((event) => event.tick <= tick));
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
		// Open on the last turn: the natural question about a finished adventure
		// is "how did it go", and the answer is at the end.
		tick = events.at(-1)?.tick ?? 0;
		loaded = true;
	}
</script>

<svelte:head><title>Watch it again — Craft A Bot</title></svelte:head>

<main>
	{#if loaded && !run}
		<p class="missing" data-testid="replay-missing">
			That adventure is not in the scrapbook any more. The oldest ones get tidied away to make room
			— pin the ones you want to keep.
		</p>
	{:else if run}
		<header>
			<a class="back" href={resolve('/scrapbook/[agentId]', { agentId: run.agentId })}>
				← {run.agentName}'s adventures
			</a>
			<h1>
				<span aria-hidden="true">{outcomeFace(run.outcome)}</span>
				{outcomeWords(run.outcome)}
			</h1>
			<p class="detail" data-testid="replay-detail">
				{run.agentName} · {stepsWords(run.ticks)} · {whenWords(run.startedAt)}
			</p>
		</header>

		<WorldView world={shown.world} saying={shown.saying} {expression} />

		<div class="scrubber">
			<label for="replay-tick">Turn {tick} of {lastTick}</label>
			<!--
				One-way, deliberately. `bind:value` let the input write back to
				`tick`: while the events were still loading `max` was 0, the browser
				clamped the opening position to 0, and the binding dutifully saved
				that — so every replay opened on turn zero however long the run was.
			-->
			<input
				id="replay-tick"
				type="range"
				min="0"
				max={lastTick}
				value={tick}
				oninput={(event) => (tick = Number(event.currentTarget.value))}
				data-testid="replay-scrubber"
			/>
		</div>

		<StoryStrip events={shownEvents} readAloud={preferences.readAloud} />
	{/if}
</main>

<style>
	main {
		max-width: 46rem;
		margin: 0 auto;
		padding: var(--cab-space-5) var(--cab-space-4);
		display: grid;
		gap: var(--cab-space-3);
	}

	.back {
		font-size: var(--cab-text-sm);
		color: var(--cab-blue-text);
	}

	h1 {
		margin: var(--cab-space-1) 0 0;
		font-size: var(--cab-text-xl);
		color: var(--cab-blue-text);
	}

	.detail {
		margin: 0;
		font-size: var(--cab-text-xs);
		opacity: 0.8;
	}

	.scrubber {
		display: grid;
		gap: var(--cab-space-1);
	}

	.scrubber label {
		font-size: var(--cab-text-sm);
		font-weight: 600;
	}

	.scrubber input {
		width: 100%;
	}

	.missing {
		margin: 0;
		padding: var(--cab-space-4);
		border: var(--cab-border-part) dashed var(--cab-ink);
		border-radius: var(--cab-radius-panel);
		text-align: center;
		font-size: var(--cab-text-sm);
	}
</style>
