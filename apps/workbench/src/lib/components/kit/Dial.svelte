<script lang="ts">
	/**
	 * A rotary dial (04-VISUAL-DESIGN-LANGUAGE.md §5): skeuomorphic-lite, with
	 * tick marks and a pointer — but underneath it is a real `input[type=range]`,
	 * because a bespoke widget that a keyboard or screen reader cannot drive
	 * would fail the accessibility requirement in 03 §8. The plastic is a skin
	 * over a standard control, never a replacement for one.
	 */
	interface Props {
		label: string;
		value: number;
		min: number;
		max: number;
		step: number;
		/** Shown under the dial, e.g. "0.7 — balanced". */
		readout?: string | undefined;
		onchange: (value: number) => void;
	}

	let { label, value, min, max, step, readout, onchange }: Props = $props();

	const fraction = $derived((value - min) / (max - min));
	// 270° of travel, starting at the 7-o'clock position.
	const angle = $derived(-135 + fraction * 270);
	const inputId = $props.id();
</script>

<div class="dial">
	<label for={inputId}>{label}</label>

	<div class="face" aria-hidden="true">
		{#each [-135, -67.5, 0, 67.5, 135] as tick (tick)}
			<span class="tick" style="--angle: {tick}deg"></span>
		{/each}
		<span class="knob" style="--angle: {angle}deg">
			<span class="pointer"></span>
		</span>
	</div>

	<input
		id={inputId}
		type="range"
		{min}
		{max}
		{step}
		{value}
		oninput={(event) => onchange(Number(event.currentTarget.value))}
	/>
	<output for={inputId}>{readout ?? value}</output>
</div>

<style>
	.dial {
		display: grid;
		justify-items: center;
		gap: var(--cab-space-1);
	}

	label {
		font-size: var(--cab-text-sm);
		font-weight: 600;
	}

	.face {
		position: relative;
		width: calc(var(--cab-sub) * 2);
		height: calc(var(--cab-sub) * 2);
		border-radius: 50%;
		background: var(--cab-cream);
		border: var(--cab-border-part) solid var(--cab-ink);
		box-shadow: var(--cab-drop-shadow);
	}

	.tick {
		position: absolute;
		inset: 0;
		transform: rotate(var(--angle));
	}

	.tick::after {
		content: '';
		position: absolute;
		top: 3px;
		left: 50%;
		width: 2px;
		height: 5px;
		background: var(--cab-ink);
		opacity: 0.45;
		transform: translateX(-50%);
	}

	.knob {
		position: absolute;
		inset: 6px;
		border-radius: 50%;
		background: var(--cab-blue);
		transform: rotate(var(--angle));
		transition: transform var(--cab-snap-ms) ease-out;
	}

	.pointer {
		position: absolute;
		top: 4px;
		left: 50%;
		width: 3px;
		height: 40%;
		border-radius: var(--cab-radius-pill);
		background: var(--cab-cream);
		transform: translateX(-50%);
	}

	input {
		width: calc(var(--cab-sub) * 3);
	}

	input:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	output {
		font-size: var(--cab-text-xs);
		font-variant-numeric: tabular-nums;
	}

	@media (prefers-reduced-motion: reduce) {
		.knob {
			transition: none;
		}
	}
</style>
