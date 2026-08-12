<script lang="ts">
	import type { EngineEvent } from '@craftabot/core';
	import { labelOf, laneLabel, laneOf } from '$lib/trace-style.js';
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
		onexport?: (() => void) | undefined;
		/** Overridable so tests can drive the viewport without a real layout. */
		rowHeight?: number;
		viewportHeight?: number;
	}

	let { events, onexport, rowHeight = 28, viewportHeight = 240 }: Props = $props();

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
	const selected = $derived(selectedIndex === undefined ? undefined : events[selectedIndex]);

	$effect(() => {
		// Auto-follow needs the new length *and* a real scroll on the DOM node,
		// neither of which is derivable.
		const count = events.length;
		if (!following || !viewport || count === 0) return;
		viewport.scrollTop = scrollToIndex(count - 1, rowHeight, viewportHeight, count);
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

<section class="recorder" data-testid="flight-recorder">
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
						aria-label="Turn {event.tick}, {laneLabel(lane)}: {labelOf(event.type)}"
						onclick={() => (selectedIndex = index)}
					>
						<span class="tick">{event.tick}</span>
						<span class="lane" aria-hidden="true">{lane}</span>
						<span class="what">{labelOf(event.type)}</span>
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
		opacity: 0.55;
	}

	.detail {
		border-top: var(--cab-border-part) solid color-mix(in srgb, var(--cab-ink) 20%, transparent);
		max-height: 260px;
		overflow: auto;
	}
</style>
