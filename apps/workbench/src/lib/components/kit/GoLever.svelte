<script lang="ts">
	/**
	 * The GO lever (04 §5, 11 §2.1 — "the single largest control on the bench").
	 * Disabled while the build has a blocking problem; the checks ribbon says
	 * why, so the lever itself never has to scold (03 §4.2).
	 */
	interface Props {
		disabled: boolean;
		/** Why it is disabled, for the tooltip and for screen readers. */
		reason?: string | undefined;
		onpull: () => void;
	}

	let { disabled, reason, onpull }: Props = $props();
	const reasonId = $props.id();
</script>

<div class="go" data-tutorial="go-lever">
	<button
		type="button"
		{disabled}
		aria-describedby={disabled && reason ? reasonId : undefined}
		title={disabled ? reason : 'Send your bot to the Playroom'}
		onclick={onpull}
	>
		<span class="slot" aria-hidden="true"><span class="stick"></span></span>
		<span class="word">GO</span>
	</button>
	{#if disabled && reason}
		<span id={reasonId} class="reason">{reason}</span>
	{/if}
</div>

<style>
	.go {
		display: grid;
		justify-items: center;
		gap: var(--cab-space-1);
	}

	button {
		display: grid;
		justify-items: center;
		gap: var(--cab-space-1);
		padding: var(--cab-space-3) var(--cab-space-5);
		border: var(--cab-border-panel) solid var(--cab-ink);
		border-radius: var(--cab-radius-part);
		background: var(--cab-red);
		color: var(--cab-cream);
		font-size: var(--cab-text-xl);
		font-weight: 800;
		letter-spacing: 0.08em;
		cursor: pointer;
		box-shadow: 0 4px 0 color-mix(in srgb, var(--cab-ink) 45%, transparent);
		transition: transform var(--cab-pop-ms) ease-out;
	}

	button:hover:not(:disabled) {
		transform: translateY(-1px);
	}

	button:active:not(:disabled) {
		transform: translateY(3px);
		box-shadow: 0 1px 0 color-mix(in srgb, var(--cab-ink) 45%, transparent);
	}

	button:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	button:disabled {
		background: color-mix(in srgb, var(--cab-red) 35%, var(--cab-paper));
		color: color-mix(in srgb, var(--cab-ink) 55%, transparent);
		cursor: not-allowed;
		box-shadow: none;
	}

	.slot {
		position: relative;
		width: calc(var(--cab-u) * 0.7);
		height: calc(var(--cab-u) * 1.4);
		border-radius: var(--cab-radius-pill);
		background: color-mix(in srgb, var(--cab-ink) 55%, transparent);
	}

	.stick {
		position: absolute;
		left: 50%;
		bottom: 3px;
		width: 8px;
		height: 60%;
		border-radius: var(--cab-radius-pill);
		background: var(--cab-yellow);
		transform: translateX(-50%);
	}

	button:active:not(:disabled) .stick {
		height: 30%;
	}

	.reason {
		font-size: var(--cab-text-xs);
		max-width: calc(var(--cab-u) * 8);
		text-align: center;
		opacity: 0.8;
	}

	@media (prefers-reduced-motion: reduce) {
		button {
			transition: none;
		}
	}
</style>
