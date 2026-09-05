<script lang="ts">
	import { STATUS, lane, plot, type LaneId, type Point } from '$lib/control-room/dataviz.js';

	/**
	 * **Tape** (WP57, `44-CONTROL-ROOM.md` §4.4): a time-series ribbon for
	 * `/telemetry` and drift — one or more series over an x axis of buckets,
	 * flagged points drawn as the status glyph, a legend with glyphs. With
	 * `compact` it is a sparkline: no axis, no legend, the same grammar.
	 *
	 * One of the three components allowed an `<svg>`; every point is placed
	 * by `plot` from the grammar.
	 */
	export interface TapeSeries {
		id: string;
		label: string;
		/** A lane's colour, so a series means what its lane means. */
		lane: LaneId;
		points: Point[];
	}

	export interface TapeFlag {
		seriesId: string;
		x: number;
		label: string;
	}

	interface Props {
		series: TapeSeries[];
		flags?: TapeFlag[];
		/** Axis labels for the first and last x, when the buckets have names. */
		xLabels?: { first: string; last: string } | undefined;
		range?: { min: number; max: number } | undefined;
		compact?: boolean;
		testId?: string | undefined;
	}

	let { series, flags = [], xLabels, range, compact = false, testId }: Props = $props();

	const WIDTH = 300;
	const HEIGHT = $derived(compact ? 32 : 90);
	const PAD = $derived(compact ? 2 : 10);
	const box = $derived({ width: WIDTH, height: HEIGHT, pad: PAD });

	const drawn = $derived(
		series.map((entry) => ({
			...entry,
			path: plot(entry.points, box, range),
			colour: lane(entry.lane).token,
			glyph: lane(entry.lane).glyph
		}))
	);

	/** A flag sits on its series at x; the y is looked up from the plotted points. */
	const flagMarks = $derived(
		flags.flatMap((flag) => {
			const entry = series.find((candidate) => candidate.id === flag.seriesId);
			if (!entry) return [];
			const index = entry.points.findIndex((point) => point.x === flag.x);
			if (index === -1) return [];
			const coords = plot(entry.points, box, range).split(' ')[index];
			if (!coords) return [];
			const [x, y] = coords.split(',').map(Number);
			return [{ ...flag, x: x ?? 0, y: y ?? 0 }];
		})
	);

	const description = $derived(
		`${series.map((entry) => `${entry.label}: ${entry.points.length} points`).join('; ')}${
			flags.length > 0 ? `; ${flags.length} flagged` : ''
		}`
	);
</script>

<figure class="tape" class:compact data-testid={testId}>
	<svg viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-label={description}>
		{#each drawn as entry (entry.id)}
			<polyline points={entry.path} style="--series: {entry.colour}" data-series={entry.id} />
		{/each}
		{#each flagMarks as flag (`${flag.seriesId}-${flag.x}`)}
			<text x={flag.x} y={flag.y - 6} class="flag" text-anchor="middle" data-flag={flag.label}
				>{STATUS.fail.glyph}</text
			>
		{/each}
		{#if !compact}
			<line x1={PAD} y1={HEIGHT - PAD} x2={WIDTH - PAD} y2={HEIGHT - PAD} class="axis" />
		{/if}
	</svg>
	{#if !compact}
		<figcaption>
			{#if xLabels}
				<span class="axis-labels"><span>{xLabels.first}</span><span>{xLabels.last}</span></span>
			{/if}
			<span class="legend">
				{#each drawn as entry (entry.id)}
					<span style="--series: {entry.colour}"
						><span class="swatch" aria-hidden="true">—</span>{entry.glyph} {entry.label}</span
					>
				{/each}
				{#if flags.length > 0}
					<span class="flag-key">{STATUS.fail.glyph} flagged</span>
				{/if}
			</span>
		</figcaption>
	{/if}
</figure>

<style>
	.tape {
		display: grid;
		gap: var(--cab-space-1);
		margin: 0;
		padding: var(--cab-space-2);
		background-color: var(--cab-graph);
		background-image:
			linear-gradient(rgba(36, 86, 166, 0.06) 1px, transparent 1px),
			linear-gradient(90deg, rgba(36, 86, 166, 0.06) 1px, transparent 1px);
		background-size: 12px 12px;
		border: var(--cab-border-part) solid var(--cab-ink);
		border-radius: var(--cab-radius-part);
		color: var(--cab-ink);
	}

	.tape.compact {
		padding: 2px;
		border-width: 1px;
	}

	svg {
		width: 100%;
		display: block;
	}

	polyline {
		fill: none;
		stroke: var(--series);
		stroke-width: 2;
		stroke-linejoin: round;
	}

	.axis {
		stroke: var(--cab-ink);
		stroke-width: 1;
	}

	.flag {
		font-size: 11px;
		font-weight: 700;
		fill: var(--cab-fail);
	}

	figcaption {
		display: grid;
		gap: var(--cab-space-1);
		font-size: var(--cab-text-xs);
	}

	.axis-labels {
		display: flex;
		justify-content: space-between;
		font-family: var(--cab-font-mono);
		color: var(--cab-ink-muted);
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-3);
	}

	.swatch {
		color: var(--series);
		font-weight: 700;
		margin-right: var(--cab-space-1);
	}

	.flag-key {
		color: var(--cab-fail);
		font-weight: 700;
	}
</style>
