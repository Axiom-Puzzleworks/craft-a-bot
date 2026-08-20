<script lang="ts">
	import type { EngineEvent } from '@craftabot/core';
	import { projectPlannerThrough } from '$lib/state/planner-projection.js';

	/**
	 * **The Planner brick's checklist, live** (WP30 stage C).
	 *
	 * The Playroom already shows this — the plan sits in the composed system
	 * prompt every tick, one click into the Flight Recorder. This is not a
	 * second source of truth for it: it folds the very same `brick.state`
	 * events (`02-…` §7) the trace holds, through the very same
	 * `projectPlannerThrough` a replay would use, so this widget can never say
	 * something the trace disagrees with. What it adds is not being buried a
	 * click deep — a glance instead of a scroll through raw prompt text.
	 */
	interface Props {
		events: EngineEvent[];
	}

	let { events }: Props = $props();

	const state = $derived(projectPlannerThrough(events).state);
	const steps = $derived(state?.steps ?? []);
</script>

<div class="checklist" data-testid="planner-checklist" data-tutorial="planner-checklist">
	<p class="lead">Plan</p>
	{#if steps.length === 0}
		<p class="quiet">Your bot has not made a plan yet.</p>
	{:else}
		<ol>
			{#each steps as step, index (index)}
				<li class="step" class:done={state?.done[index] === true}>
					<span class="mark" aria-hidden="true">{state?.done[index] === true ? '✓' : ''}</span>
					<span class="text">{step}</span>
				</li>
			{/each}
		</ol>
	{/if}
	{#if state?.notice}
		<p class="notice" data-testid="planner-notice">{state.notice}</p>
	{/if}
</div>

<style>
	.checklist {
		display: grid;
		gap: var(--cab-space-2);
		padding: var(--cab-space-3);
		background: var(--cab-cream);
		border: var(--cab-border-part) solid var(--cab-ink);
		border-radius: var(--cab-radius-panel);
	}

	.lead {
		margin: 0;
		font-size: var(--cab-text-sm);
		font-weight: 600;
		color: var(--cab-brick-planner);
	}

	.quiet {
		margin: 0;
		font-size: var(--cab-text-sm);
		opacity: 0.65;
	}

	ol {
		display: grid;
		gap: var(--cab-space-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.step {
		display: flex;
		align-items: baseline;
		gap: var(--cab-space-2);
		font-size: var(--cab-text-sm);
	}

	.mark {
		flex: 0 0 auto;
		width: 1.1em;
		font-weight: 700;
		color: var(--cab-brick-planner);
	}

	.step.done .text {
		text-decoration: line-through;
		opacity: 0.6;
	}

	.notice {
		margin: 0;
		font-size: var(--cab-text-sm);
		font-style: italic;
		opacity: 0.8;
	}
</style>
