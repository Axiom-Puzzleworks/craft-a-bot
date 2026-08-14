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

	/**
	 * Space steps the run (`16-…` §2.7).
	 *
	 * The whole loop is one button pressed over and over, and reaching for it
	 * with the mouse every time is the sort of friction that stops a child
	 * watching. Ignored while the focus is in a text field — Free Play has a
	 * goal to type and Hearing has a message to send, and a space that stepped
	 * the run instead of typing a space would be its own small horror.
	 */
	function onWindowKeydown(event: KeyboardEvent): void {
		if (event.key !== ' ' && event.code !== 'Space') return;
		const target = event.target;
		if (
			target instanceof HTMLInputElement ||
			target instanceof HTMLTextAreaElement ||
			(target instanceof HTMLElement && target.isContentEditable)
		) {
			return;
		}
		// A button already under the keyboard handles its own space; stepping as
		// well would fire two things from one press.
		if (target instanceof HTMLButtonElement) return;
		if (finished || running || busy) return;

		event.preventDefault();
		onstep();
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

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
		<kbd class="hint" aria-hidden="true">space</kbd>
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
		/*
		 * WCAG 2.5.5's 44px, which is also about the size of a five-year-old's
		 * fingertip. These are the controls the whole toy is driven with and they
		 * were coming out at roughly 32px tall.
		 */
		min-height: 44px;
		min-width: 44px;
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
		background: var(--cab-green-fill);
		color: var(--cab-cream);
		border-color: var(--cab-green);
		letter-spacing: 0.08em;
	}

	.hint {
		display: block;
		margin-top: 2px;
		font-family: var(--cab-font-mono);
		font-size: var(--cab-text-xs);
		font-weight: 400;
	}

	.speed {
		display: flex;
		align-items: center;
		gap: var(--cab-space-2);
		margin-left: auto;
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		/*
		 * The word "SPEED" is the quiet part, not the buttons. This rule used to
		 * carry `opacity: 0.8`, which dimmed everything inside it — including the
		 * active button, whose cream-on-blue passes AA on its own and did not
		 * once the whole group was at 80%.
		 */
		color: var(--cab-ink-muted);
	}

	.speeds {
		display: flex;
		gap: 2px;
	}

	.speed-button {
		min-height: 32px;
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
