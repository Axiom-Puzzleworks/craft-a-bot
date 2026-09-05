<script lang="ts">
	import { arcPath, needleAngle } from '$lib/control-room/dataviz.js';

	/**
	 * **Meter** (WP57, `44-CONTROL-ROOM.md` §4.4): a needle gauge for a rate
	 * against a gate. A half-dial on graph paper, the needle at `value`, a
	 * mark at `gate`, the good side of the gate in the pass token and the
	 * other in fail, the number engraved beneath. `direction` says which
	 * side is good — `'up'` for recall, `'down'` for a false-freeze rate.
	 *
	 * One of the three components allowed an `<svg>` (`44-…` §4.4's lint
	 * rule); every angle and arc comes from the grammar.
	 */
	interface Props {
		value: number;
		label: string;
		gate?: number | undefined;
		direction?: 'up' | 'down';
		min?: number;
		max?: number;
		/** How the number is shown; defaults to two decimals. */
		format?: (value: number) => string;
		testId?: string | undefined;
	}

	let {
		value,
		label,
		gate,
		direction = 'up',
		min = 0,
		max = 1,
		format = (v) => v.toFixed(2),
		testId
	}: Props = $props();

	const CX = 60;
	const CY = 60;
	const R = 48;
	const needle = $derived(needleAngle(value, min, max));
	const gateAngle = $derived(gate === undefined ? undefined : needleAngle(gate, min, max));
	const passes = $derived(
		gate === undefined ? undefined : direction === 'up' ? value >= gate : value <= gate
	);
	const tip = $derived({
		x: CX + (R - 6) * Math.cos((needle * Math.PI) / 180),
		y: CY - (R - 6) * Math.sin((needle * Math.PI) / 180)
	});
	const gateMark = $derived(
		gateAngle === undefined
			? undefined
			: {
					x1: CX + (R + 3) * Math.cos((gateAngle * Math.PI) / 180),
					y1: CY - (R + 3) * Math.sin((gateAngle * Math.PI) / 180),
					x2: CX + (R + 11) * Math.cos((gateAngle * Math.PI) / 180),
					y2: CY - (R + 11) * Math.sin((gateAngle * Math.PI) / 180)
				}
	);
	const description = $derived(
		`${label}: ${format(value)}${gate === undefined ? '' : `, gate ${format(gate)}, ${passes ? 'passing' : 'failing'}`}`
	);
</script>

<figure class="meter" data-testid={testId} data-passes={passes}>
	<svg viewBox="0 0 120 72" role="img" aria-label={description}>
		<path d={arcPath(CX, CY, R, 180, 0)} class="dial" />
		{#if gateAngle !== undefined}
			<path
				d={direction === 'up'
					? arcPath(CX, CY, R, 180, gateAngle)
					: arcPath(CX, CY, R, gateAngle, 0)}
				class="band band--fail"
			/>
			<path
				d={direction === 'up'
					? arcPath(CX, CY, R, gateAngle, 0)
					: arcPath(CX, CY, R, 180, gateAngle)}
				class="band band--pass"
			/>
		{/if}
		{#if gateMark}
			<line x1={gateMark.x1} y1={gateMark.y1} x2={gateMark.x2} y2={gateMark.y2} class="gate" />
		{/if}
		<line x1={CX} y1={CY} x2={tip.x} y2={tip.y} class="needle" />
		<circle cx={CX} cy={CY} r="3" class="pivot" />
	</svg>
	<figcaption>
		<span class="number" data-testid={testId ? `${testId}-value` : undefined}>{format(value)}</span>
		<span class="label">{label}</span>
		{#if gate !== undefined}
			<span class="gate-label">gate {direction === 'up' ? '≥' : '≤'} {format(gate)}</span>
		{/if}
	</figcaption>
</figure>

<style>
	.meter {
		display: grid;
		justify-items: center;
		gap: var(--cab-space-1);
		margin: 0;
		padding: var(--cab-space-2) var(--cab-space-3) var(--cab-space-1);
		background-color: var(--cab-graph);
		background-image:
			linear-gradient(rgba(36, 86, 166, 0.06) 1px, transparent 1px),
			linear-gradient(90deg, rgba(36, 86, 166, 0.06) 1px, transparent 1px);
		background-size: 12px 12px;
		border: var(--cab-border-part) solid var(--cab-ink);
		border-radius: var(--cab-radius-part);
		color: var(--cab-ink);
	}

	svg {
		width: 7.5rem;
		overflow: visible;
	}

	.dial {
		fill: none;
		stroke: var(--cab-ink);
		stroke-width: 2;
	}

	.band {
		fill: none;
		stroke-width: 6;
	}

	.band--pass {
		stroke: var(--cab-pass);
	}

	.band--fail {
		stroke: var(--cab-fail);
	}

	.gate {
		stroke: var(--cab-ink);
		stroke-width: 3;
	}

	.needle {
		stroke: var(--cab-ink);
		stroke-width: 3;
		stroke-linecap: round;
	}

	.pivot {
		fill: var(--cab-ink);
	}

	figcaption {
		display: grid;
		justify-items: center;
	}

	.number {
		font-family: var(--cab-font-mono);
		font-size: var(--cab-text-lg);
	}

	.label,
	.gate-label {
		font-size: var(--cab-text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--cab-engrave);
	}

	.gate-label {
		font-weight: 400;
		text-transform: none;
		letter-spacing: 0;
	}
</style>
