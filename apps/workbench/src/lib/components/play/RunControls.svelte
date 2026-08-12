<script lang="ts">
	/**
	 * STEP / PLAY / STOP / RESET with a speed dial (03-UI-UX-DESIGN.md §5.1).
	 * STEP is the hero button — the tutorial is built around watching one tick at
	 * a time, so it gets the size and the primary colour.
	 */
	interface Props {
		running: boolean;
		finished: boolean;
		busy: boolean;
		speed: number;
		onstep: () => void;
		onplay: () => void;
		onpause: () => void;
		onstop: () => void;
		onreset: () => void;
		onspeed: (multiplier: number) => void;
	}

	let { running, finished, busy, speed, onstep, onplay, onpause, onstop, onreset, onspeed }: Props =
		$props();

	const SPEEDS = [0.5, 1, 2, 4];
	const speedId = $props.id();
</script>

<div class="controls" data-testid="run-controls">
	<button
		type="button"
		class="primary"
		data-testid="step"
		data-tutorial="step-button"
		disabled={finished || running || busy}
		onclick={onstep}
	>
		STEP
	</button>

	{#if running}
		<button type="button" data-testid="pause" onclick={onpause}>Pause</button>
	{:else}
		<button type="button" data-testid="play" disabled={finished || busy} onclick={onplay}>
			Play
		</button>
	{/if}

	<button type="button" data-testid="stop" disabled={finished} onclick={onstop}>Stop</button>
	<button type="button" data-testid="reset" onclick={onreset}>Reset world</button>

	<label class="speed">
		<span id={speedId}>Speed</span>
		<span class="speeds" role="group" aria-labelledby={speedId}>
			{#each SPEEDS as multiplier (multiplier)}
				<button
					type="button"
					class="speed-button"
					class:speed-button--active={speed === multiplier}
					data-testid="speed-{multiplier}"
					aria-pressed={speed === multiplier}
					onclick={() => onspeed(multiplier)}
				>
					{multiplier}×
				</button>
			{/each}
		</span>
	</label>
</div>

<style>
	.controls {
		display: flex;
		align-items: center;
		gap: var(--cab-space-2);
		flex-wrap: wrap;
		padding: var(--cab-space-3);
		background: var(--cab-cream);
		border: var(--cab-border-part) solid color-mix(in srgb, var(--cab-ink) 25%, transparent);
		border-radius: var(--cab-radius-panel);
	}

	button {
		font: inherit;
		font-size: var(--cab-text-sm);
		font-weight: 600;
		padding: var(--cab-space-2) var(--cab-space-3);
		background: var(--cab-cream);
		color: var(--cab-ink);
		border: var(--cab-border-part) solid var(--cab-ink);
		border-radius: var(--cab-radius-pill);
		cursor: pointer;
	}

	button:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.primary {
		font-size: var(--cab-text-base);
		padding: var(--cab-space-2) var(--cab-space-5);
		background: var(--cab-green);
		color: var(--cab-cream);
		border-color: var(--cab-green);
		letter-spacing: 0.08em;
	}

	.speed {
		display: flex;
		align-items: center;
		gap: var(--cab-space-2);
		margin-left: auto;
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		opacity: 0.8;
	}

	.speeds {
		display: flex;
		gap: 2px;
	}

	.speed-button {
		padding: 2px var(--cab-space-2);
		font-size: var(--cab-text-xs);
		border-radius: var(--cab-radius-pill);
	}

	.speed-button--active {
		background: var(--cab-blue);
		color: var(--cab-cream);
		border-color: var(--cab-blue);
	}
</style>
