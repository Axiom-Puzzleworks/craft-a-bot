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
		/** A reference value drawn as a dashed hairline across the tape (WP84, `75-…` §5): the baseline's rate, the population's expectation. */
		reference?:
			| {
					y: number;
					label: string;
					/** WP109 (`96-…` §4): the reference's interval, drawn as a shaded region behind the hairline rather than a hairline alone. */
					band?: { low: number; high: number } | undefined;
			  }
			| undefined;
		compact?: boolean;
		testId?: string | undefined;
	}

	let { series, flags = [], xLabels, range, reference, compact = false, testId }: Props = $props();

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

	/** The span the reference and its band are placed in: the range given, else the points' and the reference's own. */
	const referenceSpan = $derived.by(() => {
		if (!reference) return undefined;
		const every = series.flatMap((entry) => entry.points);
		const lows = [
			reference.y,
			reference.band?.low ?? reference.y,
			...every.map((point) => point.y)
		];
		const highs = [
			reference.y,
			reference.band?.high ?? reference.y,
			...every.map((point) => point.y)
		];
		return range ?? { min: Math.min(...lows), max: Math.max(...highs) };
	});
	/** A value's y, placed by the same grammar as the points: a one-point series at the value. */
	const yOf = (value: number): number | undefined => {
		if (!referenceSpan) return undefined;
		const coords = plot([{ x: 0, y: value }], box, referenceSpan).split(' ')[0];
		const y = Number(coords?.split(',')[1]);
		return Number.isFinite(y) ? y : undefined;
	};
	/** The hairline's y. */
	const hairline = $derived(reference ? yOf(reference.y) : undefined);
	/** The band as a region (WP109): from the interval's high to its low, in the plot's y. */
	const band = $derived.by(() => {
		if (!reference?.band) return undefined;
		const top = yOf(reference.band.high);
		const bottom = yOf(reference.band.low);
		if (top === undefined || bottom === undefined) return undefined;
		return { y: Math.min(top, bottom), height: Math.max(1, Math.abs(bottom - top)) };
	});

	const description = $derived(
		`${series.map((entry) => `${entry.label}: ${entry.points.length} points`).join('; ')}${
			flags.length > 0 ? `; ${flags.length} flagged` : ''
		}${reference ? `; reference ${reference.label}` : ''}${
			reference?.band ? ` (band ${reference.band.low} to ${reference.band.high})` : ''
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
		{#if band !== undefined}
			<rect
				x={PAD}
				y={band.y}
				width={WIDTH - 2 * PAD}
				height={band.height}
				class="band"
				data-band={reference?.label}
			/>
		{/if}
		{#if hairline !== undefined}
			<line
				x1={PAD}
				y1={hairline}
				x2={WIDTH - PAD}
				y2={hairline}
				class="reference"
				data-reference={reference?.label}
			/>
		{/if}
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
				{#if reference}
					<span class="reference-key">- - {reference.label}</span>
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

	.band {
		fill: var(--cab-ink);
		fill-opacity: 0.1;
	}

	.reference {
		stroke: var(--cab-ink-muted);
		stroke-width: 1;
		stroke-dasharray: 4 3;
	}

	.reference-key {
		color: var(--cab-ink-muted);
		font-family: var(--cab-font-mono);
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
