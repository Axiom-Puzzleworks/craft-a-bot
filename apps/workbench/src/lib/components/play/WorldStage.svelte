<script lang="ts">
	import {
		isDeskWorldState,
		isGridWorldState,
		type EngineEvent,
		type RunOutcome,
		type WorldViewKind,
		type WorldViewState
	} from '@craftabot/core';
	import type { BotExpression } from '$lib/bot-expression.js';
	import DeskView from './DeskView.svelte';
	import WorldView from './WorldView.svelte';

	/**
	 * **The stage a world is drawn on** (WP53, `43-DESK-WORLDS.md` §4.2).
	 * Every screen that used to mount `WorldView` mounts this instead, and
	 * this decides which renderer draws the world: `WorldView` for a room
	 * (`GridWorldState`), `DeskView` for a desk (`DeskWorldState`).
	 *
	 * **The shape decides, not the registry.** The state arrives as a
	 * `world.changed` payload, and a stored or imported trace may come from a
	 * build that does not install the world at all — so the two structural
	 * guards in core are the whole of the decision. `view` is a hint the host
	 * passes when it has one (the Play routes know their goal card), and it
	 * changes only the words shown before the first frame arrives.
	 *
	 * A payload that is neither shape is shown as JSON with a sentence, never
	 * as nothing: a run this build cannot draw is still a run.
	 */
	interface Props {
		world: WorldViewState | undefined;
		view?: WorldViewKind | undefined;
		saying?: string | undefined;
		expression?: BotExpression;
		outcome?: RunOutcome | undefined;
		events?: readonly EngineEvent[];
		/** A finished run's truth, for the Desk's flap (WP54) — Workshop screens only. */
		truth?: unknown;
	}

	let { world, view, saying, expression = 'idle', outcome, events = [], truth }: Props = $props();
</script>

{#if world === undefined}
	{#if view === 'desk'}
		<div class="waiting" data-testid="world-waiting">
			<p>Press STEP to open the desk.</p>
		</div>
	{:else}
		<WorldView world={undefined} {saying} {expression} {outcome} {events} />
	{/if}
{:else if isDeskWorldState(world)}
	<DeskView {world} {outcome} {truth} />
{:else if isGridWorldState(world)}
	<WorldView {world} {saying} {expression} {outcome} {events} />
{:else}
	<div class="unknown" data-testid="world-unknown">
		<p>This run's world is one this build cannot draw. Here is what it said about itself.</p>
		<pre>{JSON.stringify(world, null, 2)}</pre>
	</div>
{/if}

<style>
	.waiting,
	.unknown {
		display: grid;
		place-items: center;
		min-height: 12rem;
		padding: var(--cab-space-4);
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink);
		border-radius: var(--cab-radius-panel);
		color: var(--cab-ink);
	}

	.unknown {
		place-items: start;
		gap: var(--cab-space-3);
	}

	.unknown pre {
		max-width: 100%;
		overflow-x: auto;
		font-size: var(--cab-text-sm);
	}
</style>
