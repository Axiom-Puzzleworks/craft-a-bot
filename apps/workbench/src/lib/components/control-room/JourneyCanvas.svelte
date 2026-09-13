<script lang="ts">
	import type { JourneyLayout, StageRecord } from '@craftabot/core';
	import { journeyGeometry, journeySentence } from '@craftabot/workflow';
	import { journeyTwin, stageSentence } from '$lib/control-room/journey-twin.js';
	import { EXECUTOR_ICON } from '$lib/workshop/pipeline.js';
	import { INSTRUMENT_ICONS } from '$lib/assets/instruments.js';

	/**
	 * **JourneyCanvas** (WP100, `87-JOURNEY-CANVAS.md` §5; `83-…` §6.1.2):
	 * the journey drawn on the Control Room grammar over `journeyGeometry` —
	 * lanes as bands, stages as roundels with the executor's instrument,
	 * irreversible stages with the hazard mark, obligations as tags, edges
	 * with their labels, points as gates; a lit run in the scope colour with
	 * its verdicts appearing in order (at once under reduced motion). One
	 * `role="group"` described by its twin; the keyboard model of §5.1.
	 */
	interface Props {
		layout: JourneyLayout;
		run?: { stages: readonly StageRecord[] } | undefined;
		selected?: string | undefined;
		onSelect?: ((stageId: string) => void) | undefined;
		onPoint?: ((pointId: string) => void) | undefined;
		/** Per edge id, the share of runs that took it (0..1) — the Monitor's heat. */
		heat?: Readonly<Record<string, number>> | undefined;
		/** Per stage id, a count drawn as a badge — the Monitor's queue on the intake. */
		badges?: Readonly<Record<string, number>> | undefined;
		/** `small` draws no labels but the stage names, for the Monitor's per-desk tile. */
		size?: 'full' | 'small' | undefined;
		testId?: string | undefined;
		/** The id of the twin the canvas is described by. */
		describedBy?: string | undefined;
	}

	let {
		layout,
		run,
		selected,
		onSelect,
		onPoint,
		heat,
		badges,
		size = 'full',
		testId = 'journey',
		describedBy
	}: Props = $props();

	const g = $derived(journeyGeometry(layout));
	const twin = $derived(journeyTwin(layout, run));
	const rowOf = $derived(new Map(twin.stages.map((row) => [row.stageId, row])));
	const nodeOf = $derived(new Map(layout.nodes.map((node) => [node.stageId, node])));
	const edgeOf = $derived(new Map(layout.edges.map((edge) => [edge.id, edge])));
	const pointOf = $derived(new Map(layout.points.map((point) => [point.id, point])));
	const lit = $derived(new Set(layout.lit?.path ?? []));
	/** The verdicts by point, in the order they happened — each one's index times the step is its delay. */
	const verdictAt = $derived(
		new Map(
			(layout.lit?.verdicts ?? []).map((verdict, index) => [
				verdict.pointId,
				{ verdict: verdict.verdict, index }
			])
		)
	);
	const verdictClass = (verdict: string): string =>
		verdict === 'allow' || verdict === 'annotate'
			? 'verdict--pass'
			: verdict === 'block' || verdict === 'stop'
				? 'verdict--fail'
				: 'verdict--inconclusive';

	const order = $derived(layout.nodes.map((node) => node.stageId));
	let focused = $state<string | undefined>(undefined);
	const tabStop = $derived(selected ?? focused ?? order[0]);

	const outgoing = (stageId: string) =>
		layout.edges.filter((edge) => edge.from === stageId && typeof edge.to === 'string');
	const incoming = (stageId: string) => layout.edges.filter((edge) => edge.to === stageId);

	function focusNode(stageId: string | undefined): void {
		if (!stageId) return;
		focused = stageId;
		const element = document.getElementById(`${testId}-node-${stageId}`);
		element?.focus();
	}
	function focusPoint(pointId: string | undefined): void {
		if (!pointId) return;
		document.getElementById(`${testId}-point-${pointId}`)?.focus();
	}

	/** §5.1: arrows along the edges, Home/End, Enter selects, g to the node's first point, Escape back. */
	function onKey(event: KeyboardEvent, stageId: string): void {
		const out = outgoing(stageId);
		const back = incoming(stageId);
		switch (event.key) {
			case 'ArrowRight':
				focusNode(out[0]?.to as string | undefined);
				break;
			case 'ArrowLeft':
				focusNode(back[0]?.from);
				break;
			case 'ArrowDown':
			case 'ArrowUp': {
				// Several ways out: cycle the targets.
				if (out.length < 2) return;
				const current = out.findIndex((edge) => edge.to === focused);
				const step = event.key === 'ArrowDown' ? 1 : -1;
				const next = out[(current + step + out.length) % out.length];
				focusNode(next?.to as string | undefined);
				break;
			}
			case 'Home':
				focusNode(order[0]);
				break;
			case 'End':
				focusNode(order.at(-1));
				break;
			case 'Enter':
			case ' ':
				onSelect?.(stageId);
				break;
			case 'g':
				focusPoint(nodeOf.get(stageId)?.guards[0]);
				break;
			default:
				return;
		}
		event.preventDefault();
	}
	function onPointKey(event: KeyboardEvent, pointId: string): void {
		const point = pointOf.get(pointId);
		const siblings =
			point && typeof point.at === 'string' ? (nodeOf.get(point.at)?.guards ?? []) : [];
		const index = siblings.indexOf(pointId);
		switch (event.key) {
			case 'ArrowRight':
				focusPoint(siblings[(index + 1) % siblings.length]);
				break;
			case 'ArrowLeft':
				focusPoint(siblings[(index - 1 + siblings.length) % siblings.length]);
				break;
			case 'Escape':
				focusNode(typeof point?.at === 'string' ? point.at : order[0]);
				break;
			case 'Enter':
			case ' ':
				onPoint?.(pointId);
				break;
			default:
				return;
		}
		event.preventDefault();
	}

	const pointSentence = (pointId: string): string => {
		const point = pointOf.get(pointId);
		if (!point) return pointId;
		const verdict = verdictAt.get(pointId);
		return `${point.kind} at ${point.at}: ${point.components.length === 0 ? 'no components' : point.components.join(', ')}${verdict ? `; ${verdict.verdict}` : ''}`;
	};
	const iconMarkup = (stageId: string): string =>
		INSTRUMENT_ICONS[EXECUTOR_ICON[nodeOf.get(stageId)?.executor ?? 'rule']];
</script>

<figure
	class="journey"
	class:journey--small={size === 'small'}
	data-testid={testId}
	data-lit={layout.lit !== undefined}
	role="group"
	aria-label={journeySentence(layout)}
	aria-describedby={describedBy}
>
	<svg viewBox="0 0 {g.width} {g.height}">
		{#each g.lanes as lane (lane.id)}
			<rect
				class="lane lane--{lane.id}"
				x={lane.x}
				y={lane.y}
				width={lane.width}
				height={lane.height}
				data-testid="{testId}-lane-{lane.id}"
			/>
			<text class="lane-label" x="8" y={lane.y + 16}>{lane.label}</text>
		{/each}

		{#each g.edges as edge (edge.id)}
			{@const spec = edgeOf.get(edge.id)}
			<path
				class="edge edge--{spec?.kind}"
				class:edge--taken={spec?.taken}
				d={edge.path}
				style:opacity={heat ? 0.25 + 0.75 * (heat[edge.id] ?? 0) : undefined}
				data-testid="{testId}-edge-{edge.id}"
				data-taken={spec?.taken ?? false}
			/>
			{#if edge.label !== '' && size === 'full'}
				<text class="edge-label" x={edge.labelX} y={edge.labelY} text-anchor={edge.anchor}
					>{edge.label}</text
				>
			{/if}
		{/each}
		{#if g.end}
			<line class="end" x1={g.end.x} y1={g.end.y1} x2={g.end.x} y2={g.end.y2} />
		{/if}

		{#each g.nodes as node (node.stageId)}
			{@const spec = nodeOf.get(node.stageId)}
			{@const row = rowOf.get(node.stageId)}
			<g
				id="{testId}-node-{node.stageId}"
				class="node node--{spec?.lane}"
				class:node--lit={lit.has(node.stageId)}
				class:node--selected={node.stageId === selected}
				role="button"
				tabindex={node.stageId === tabStop ? 0 : -1}
				aria-label={row ? stageSentence(row) : node.stageId}
				aria-pressed={onSelect ? node.stageId === selected : undefined}
				data-testid="{testId}-node-{node.stageId}"
				data-lane={spec?.lane}
				onclick={() => onSelect?.(node.stageId)}
				onkeydown={(event) => onKey(event, node.stageId)}
				onfocus={() => (focused = node.stageId)}
			>
				<circle class="disc" cx={node.cx} cy={node.cy} r={node.r} />
				<foreignObject x={node.cx - 12} y={node.cy - 12} width="24" height="24">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- the instrument markup is the repo's own asset, inlined as every roundel is -->
					<div class="icon" aria-hidden="true">{@html iconMarkup(node.stageId)}</div>
				</foreignObject>
				{#if spec?.irreversible}
					<text class="hazard" x={node.cx + node.r - 4} y={node.cy - node.r + 6}>⚠</text>
				{/if}
				{#if badges?.[node.stageId] !== undefined}
					<g class="badge" data-testid="{testId}-badge-{node.stageId}">
						<circle cx={node.cx - node.r + 2} cy={node.cy - node.r + 2} r="10" />
						<text x={node.cx - node.r + 2} y={node.cy - node.r + 6} text-anchor="middle"
							>{badges[node.stageId]}</text
						>
					</g>
				{/if}
				<text class="node-label" x={node.labelX} y={node.labelY} text-anchor="middle"
					>{spec?.name}</text
				>
				{#if size === 'full' && spec && spec.obligations.length > 0}
					<text class="tags" x={node.labelX} y={node.labelY + 12} text-anchor="middle"
						>{spec.obligations.join(' · ')}</text
					>
				{/if}
			</g>
		{/each}

		{#each g.points as point (point.id)}
			{@const verdict = verdictAt.get(point.id)}
			{@const spec = pointOf.get(point.id)}
			<g
				id="{testId}-point-{point.id}"
				class="point point--{point.kind} {verdict ? verdictClass(verdict.verdict) : ''}"
				class:point--fitted={(spec?.components.length ?? 0) > 0}
				role="button"
				tabindex="-1"
				aria-label={pointSentence(point.id)}
				style:--verdict-index={verdict?.index ?? 0}
				data-testid="{testId}-point-{point.id}"
				data-verdict={verdict?.verdict}
				onclick={() => onPoint?.(point.id)}
				onkeydown={(event) => onPointKey(event, point.id)}
			>
				{#if point.shape === 'ring'}
					<circle cx={point.cx} cy={point.cy} r="5" />
				{:else if point.shape === 'gate'}
					<rect x={point.cx - 5} y={point.cy - 5} width="10" height="10" />
				{:else}
					<rect x={point.cx - 3} y={point.cy} width="6" height={point.height} />
				{/if}
			</g>
		{/each}
	</svg>
</figure>

<style>
	.journey {
		margin: 0;
		background: var(--cab-graph);
		border: 1.5px solid var(--cab-ink);
		border-radius: var(--cab-radius-panel);
		overflow-x: auto;
	}
	svg {
		display: block;
		width: 100%;
		min-width: 560px;
		height: auto;
		font-size: 11px;
		font-family: inherit;
	}
	.journey--small svg {
		min-width: 0;
	}
	.lane {
		fill: var(--cab-cream);
		stroke: var(--cab-metal);
		stroke-width: 1;
	}
	.lane--counterpart {
		fill: color-mix(in srgb, var(--cab-counterpart) 10%, var(--cab-cream));
	}
	.lane--assistant {
		fill: color-mix(in srgb, var(--cab-blue) 8%, var(--cab-cream));
	}
	.lane--colleague {
		fill: color-mix(in srgb, var(--cab-green) 8%, var(--cab-cream));
	}
	.lane--systems {
		fill: color-mix(in srgb, var(--cab-purple) 8%, var(--cab-cream));
	}
	.lane-label {
		fill: var(--cab-ink-muted);
		font-weight: 700;
		letter-spacing: 0.04em;
	}
	.edge {
		fill: none;
		stroke: var(--cab-ink-muted);
		stroke-width: 1.5;
	}
	.edge--case {
		stroke-dasharray: 4 3;
	}
	.edge--taken {
		stroke: var(--cab-scope);
		stroke-width: 3;
	}
	.edge-label {
		fill: var(--cab-ink);
	}
	.end {
		stroke: var(--cab-ink);
		stroke-width: 3;
	}
	.node {
		cursor: pointer;
		outline: none;
	}
	.node .disc {
		fill: var(--cab-cream);
		stroke: var(--cab-ink);
		stroke-width: 1.5;
	}
	.node--assistant .disc {
		stroke: var(--cab-blue);
	}
	.node--colleague .disc {
		stroke: var(--cab-green);
	}
	.node--systems .disc {
		stroke: var(--cab-purple);
	}
	.node--lit .disc {
		stroke: var(--cab-scope);
		stroke-width: 3;
		fill: var(--cab-metal);
	}
	.node--selected .disc {
		fill: var(--cab-yellow);
	}
	.node:focus-visible .disc {
		outline: none;
		stroke: var(--cab-blue);
		stroke-width: 4;
	}
	.icon {
		width: 24px;
		height: 24px;
	}
	.icon :global(svg) {
		width: 100%;
		height: 100%;
		display: block;
	}
	.node-label {
		fill: var(--cab-ink);
		font-weight: 700;
	}
	.tags {
		fill: var(--cab-ink-muted);
		font-size: 9px;
	}
	.hazard {
		fill: var(--cab-fail);
		font-size: 12px;
	}
	.badge circle {
		fill: var(--cab-red);
		stroke: var(--cab-cream);
		stroke-width: 1.5;
	}
	.badge text {
		fill: var(--cab-cream);
		font-weight: 700;
		font-size: 10px;
	}
	.point {
		cursor: pointer;
		outline: none;
	}
	.point circle,
	.point rect {
		fill: var(--cab-cream);
		stroke: var(--cab-ink-muted);
		stroke-width: 1.5;
	}
	.point--fitted circle,
	.point--fitted rect {
		stroke: var(--cab-yellow);
		stroke-width: 2;
	}
	.point:focus-visible circle,
	.point:focus-visible rect {
		stroke: var(--cab-blue);
		stroke-width: 3;
	}
	.verdict--pass circle,
	.verdict--pass rect {
		fill: var(--cab-pass);
		stroke: var(--cab-pass);
	}
	.verdict--fail circle,
	.verdict--fail rect {
		fill: var(--cab-fail);
		stroke: var(--cab-fail);
	}
	.verdict--inconclusive circle,
	.verdict--inconclusive rect {
		fill: var(--cab-inconclusive);
		stroke: var(--cab-inconclusive);
	}
	/* §5: the verdicts appear in order, 120 ms apart; under reduced motion the final state is drawn at once (`app.css` zeroes every animation too). */
	@media (prefers-reduced-motion: no-preference) {
		[data-verdict] circle,
		[data-verdict] rect {
			animation: verdict-in 200ms both;
			animation-delay: calc(var(--verdict-index) * 120ms);
		}
	}
	@keyframes verdict-in {
		from {
			fill: var(--cab-cream);
			stroke: var(--cab-ink-muted);
		}
	}
</style>
