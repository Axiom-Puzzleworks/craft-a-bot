<script lang="ts">
	import type { EngineEvent } from '@craftabot/core';
	import { labelForEvent, laneLabel, laneOf, type TraceLane } from '$lib/trace-style.js';
	import {
		DEFAULT_OVERSCAN,
		computeWindow,
		isNearBottom,
		scrollToIndex,
		totalHeight
	} from '$lib/virtual-list.js';
	import PayloadView from './PayloadView.svelte';

	/**
	 * The Flight Recorder (03-UI-UX-DESIGN.md §5.2): one row per event,
	 * colour-coded by brick, following the run unless you have scrolled away.
	 *
	 * Only the visible slice is in the DOM — 10,000 events is the stated target
	 * (01 §8), and rendering them all would miss it badly. Row heights are fixed
	 * so the windowing stays simple; the selected row's full payload opens in the
	 * pane below rather than growing the row inline.
	 */
	interface Props {
		events: EngineEvent[];
		/**
		 * Open the drawer at this event, from the story strip's "see more"
		 * (`16-…` §1.3). Changing it re-opens; the reader can still scroll away
		 * afterwards, because it selects rather than pins.
		 */
		openAt?: number | undefined;
		onexport?: (() => void) | undefined;
		/** Overridable so tests can drive the viewport without a real layout. */
		rowHeight?: number;
		viewportHeight?: number;
	}

	let { events, openAt, onexport, rowHeight = 28, viewportHeight = 240 }: Props = $props();

	let scrollTop = $state(0);
	let following = $state(true);
	let selectedIndex = $state<number | undefined>(undefined);
	let viewport = $state<HTMLElement | undefined>(undefined);

	const window_ = $derived(
		computeWindow({
			itemCount: events.length,
			rowHeight,
			viewportHeight,
			scrollTop,
			overscan: DEFAULT_OVERSCAN
		})
	);
	const visible = $derived(events.slice(window_.start, window_.end));
	/**
	 * The first composed prompt, which chapter 2 points the reader at (`16-…`
	 * §2.2). The *first* rather than the latest: the lesson is what the bot was
	 * told at the start, and a moving arrow would be a worse instruction than a
	 * still one.
	 */
	const firstPromptId = $derived(events.find((event) => event.type === 'prompt.composed')?.id);

	/** Every lane, in the order a turn goes through them. */
	const LEGEND: TraceLane[] = [
		'run',
		'tick',
		'sense',
		'think',
		'tool',
		'action',
		'memory',
		'guardrail',
		'error'
	];
	const selected = $derived(selectedIndex === undefined ? undefined : events[selectedIndex]);

	$effect(() => {
		// Auto-follow needs the new length *and* a real scroll on the DOM node,
		// neither of which is derivable.
		const count = events.length;
		if (!following || !viewport || count === 0) return;
		viewport.scrollTop = scrollToIndex(count - 1, rowHeight, viewportHeight, count);
	});

	/*
	 * The story strip asked for a moment (`16-…` §1.3). Selecting it and scrolling
	 * to it also means letting go of auto-follow — a live run would otherwise drag
	 * the view straight back to the bottom, which is precisely not what somebody
	 * who just asked to see turn two wants.
	 */
	let lastOpened = $state<number | undefined>(undefined);
	$effect(() => {
		if (openAt === undefined || openAt === lastOpened) return;
		lastOpened = openAt;
		selectedIndex = openAt;
		following = false;
		if (viewport) {
			viewport.scrollTop = scrollToIndex(openAt, rowHeight, viewportHeight, events.length);
		}
	});

	function onScroll(event: Event & { currentTarget: HTMLElement }): void {
		scrollTop = event.currentTarget.scrollTop;
		following = isNearBottom(scrollTop, viewportHeight, events.length, rowHeight);
	}

	function jumpToNow(): void {
		following = true;
		if (viewport) {
			viewport.scrollTop = scrollToIndex(
				events.length - 1,
				rowHeight,
				viewportHeight,
				events.length
			);
		}
	}
</script>

<section class="recorder" data-testid="flight-recorder" data-tutorial="flight-recorder">
	<header>
		<h2>Flight Recorder</h2>
		<span class="count" data-testid="trace-count">{events.length} events</span>
		{#if !following && events.length > 0}
			<button type="button" class="chip" data-testid="jump-to-now" onclick={jumpToNow}>
				Jump to now
			</button>
		{/if}
		{#if onexport}
			<button type="button" class="chip" data-testid="export-trace" onclick={onexport}>
				Export trace
			</button>
		{/if}
	</header>

	<!--
		What the colours down the left mean (`16-…` §2.2). The rows have been
		colour-coded by brick since WP6 with nothing anywhere saying so, which
		makes a legend the difference between a code and a decoration.
	-->
	<details class="legend" data-testid="trace-legend">
		<summary>What do the colours mean?</summary>
		<ul>
			{#each LEGEND as lane (lane)}
				<li class="lane lane--{lane}">
					<span class="swatch" aria-hidden="true"></span>
					{laneLabel(lane)}
				</li>
			{/each}
		</ul>
	</details>

	<div
		class="viewport"
		style="height: {viewportHeight}px"
		data-testid="trace-viewport"
		onscroll={onScroll}
		bind:this={viewport}
	>
		<div class="sizer" style="height: {totalHeight(events.length, rowHeight)}px">
			<div style="transform: translateY({window_.paddingTop}px)">
				{#each visible as event, offset (event.id)}
					{@const index = window_.start + offset}
					{@const lane = laneOf(event.type)}
					<button
						type="button"
						class="row row--{lane}"
						class:row--selected={index === selectedIndex}
						style="height: {rowHeight}px"
						data-testid="trace-row"
						data-event-type={event.type}
						data-tutorial={event.id === firstPromptId ? 'prompt-row' : undefined}
						aria-label="Turn {event.tick}, {laneLabel(lane)}: {labelForEvent(event)}"
						onclick={() => (selectedIndex = index)}
					>
						<span class="tick">{event.tick}</span>
						<span class="lane" aria-hidden="true">{lane}</span>
						<span class="what">{labelForEvent(event)}</span>
						<span class="type">{event.type}</span>
					</button>
				{/each}
			</div>
		</div>
	</div>

	<div class="detail" data-testid="trace-detail">
		<PayloadView event={selected} />
	</div>
</section>

<style>
	.recorder {
		display: grid;
		gap: 0;
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink);
		border-radius: var(--cab-radius-panel);
		overflow: hidden;
	}

	header {
		display: flex;
		align-items: center;
		gap: var(--cab-space-2);
		padding: var(--cab-space-2) var(--cab-space-3);
		background: var(--cab-ink);
		color: var(--cab-cream);
	}

	h2 {
		margin: 0;
		font-size: var(--cab-text-sm);
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.count {
		font-size: var(--cab-text-xs);
		opacity: 0.75;
		margin-right: auto;
	}

	.chip {
		font: inherit;
		font-size: var(--cab-text-xs);
		padding: 2px var(--cab-space-2);
		background: var(--cab-cream);
		color: var(--cab-ink);
		border: none;
		border-radius: var(--cab-radius-pill);
		cursor: pointer;
	}

	.chip:focus-visible {
		outline: 3px solid var(--cab-yellow);
		outline-offset: var(--cab-focus-gap);
	}

	.legend {
		padding: 0 var(--cab-space-3) var(--cab-space-2);
		font-size: var(--cab-text-xs);
		color: var(--cab-cream);
	}

	.legend summary {
		cursor: pointer;
		padding: var(--cab-space-1) 0;
	}

	.legend ul {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-1) var(--cab-space-3);
		margin: var(--cab-space-1) 0 0;
		padding: 0;
		list-style: none;
	}

	.legend .lane {
		display: flex;
		align-items: center;
		gap: var(--cab-space-1);
	}

	.legend .swatch {
		width: 12px;
		height: 12px;
		border-radius: 2px;
		background: var(--lane-colour);
		border: 1px solid var(--cab-cream);
	}

	.legend summary:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	.viewport {
		overflow-y: auto;
		background: var(--cab-paper);
	}

	.sizer {
		position: relative;
	}

	.row {
		display: grid;
		grid-template-columns: 3ch 9ch 1fr auto;
		align-items: center;
		gap: var(--cab-space-2);
		width: 100%;
		padding: 0 var(--cab-space-2);
		background: none;
		border: none;
		border-left: 4px solid var(--lane-colour);
		border-bottom: 1px solid color-mix(in srgb, var(--cab-ink) 10%, transparent);
		font: inherit;
		font-size: var(--cab-text-xs);
		color: inherit;
		text-align: left;
		cursor: pointer;
	}

	.row:hover {
		background: color-mix(in srgb, var(--lane-colour) 10%, transparent);
	}

	.row--selected {
		background: color-mix(in srgb, var(--cab-yellow) 28%, transparent);
	}

	.row:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: -3px;
	}

	/* Colour ↔ concept, fixed by 04 §2.2. */
	.row--run {
		--lane-colour: var(--cab-ink);
	}
	.row--tick {
		--lane-colour: color-mix(in srgb, var(--cab-ink) 35%, transparent);
	}
	.row--sense {
		--lane-colour: var(--cab-brick-sense);
	}
	.row--think {
		--lane-colour: var(--cab-brick-llm);
	}
	.row--tool {
		--lane-colour: var(--cab-brick-tools);
	}
	.row--action {
		--lane-colour: var(--cab-brick-actions);
	}
	.row--memory {
		--lane-colour: var(--cab-brick-memory);
	}
	.row--guardrail {
		--lane-colour: var(--cab-brick-safety);
	}
	.row--error {
		--lane-colour: var(--cab-red);
	}

	.tick {
		font-variant-numeric: tabular-nums;
		opacity: 0.6;
	}

	.lane {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		opacity: 0.7;
	}

	.what {
		font-weight: 600;
	}

	.type {
		font-family: var(--cab-font-mono);
		font-size: 10px;
		color: var(--cab-ink-muted);
	}

	.detail {
		border-top: var(--cab-border-part) solid color-mix(in srgb, var(--cab-ink) 20%, transparent);
		max-height: 260px;
		overflow: auto;
	}
</style>
