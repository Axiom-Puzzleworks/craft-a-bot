<script lang="ts">
	/**
	 * **The Robot Friends lever** (WP31, `24-ROBOT-FRIENDS-DESIGN.md` §4.6) —
	 * beside `GoLever`, not a new top-level screen: a bot is already GO-ready
	 * before this makes sense, which is why it shares that button's exact
	 * `disabled`/`reason` contract rather than inventing a second pattern.
	 *
	 * Deliberately smaller and second in the row — GO stays "the single
	 * largest control on the bench" (`04-…`, `11-…` §2.1); this is an
	 * invitation next to it, not a rival for the child's eye.
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

<div class="friends">
	<button
		type="button"
		data-testid="robot-friends-lever"
		{disabled}
		aria-describedby={disabled && reason ? reasonId : undefined}
		title={disabled ? reason : 'Play together with another robot'}
		onclick={onpull}
	>
		<span class="badge" aria-hidden="true">🤝</span>
		<span class="word">Robot Friends</span>
	</button>
	{#if disabled && reason}
		<span id={reasonId} class="reason">{reason}</span>
	{/if}
</div>

<style>
	.friends {
		display: grid;
		justify-items: center;
		gap: var(--cab-space-1);
	}

	/*
	 * Neutral, not a brick-family fill: `04-…` §2.2 fixes blue to LLM (and
	 * every other saturated fill to its own brick), and "Robot Friends" is
	 * neither a brick nor allowed to borrow one's colour. Cream-and-ink is the
	 * bench's own secondary-control style (the Undo button, this page).
	 */
	button {
		display: grid;
		justify-items: center;
		gap: var(--cab-space-1);
		padding: var(--cab-space-2) var(--cab-space-4);
		border: var(--cab-border-part) solid var(--cab-ink);
		border-radius: var(--cab-radius-part);
		background: var(--cab-cream);
		color: var(--cab-ink);
		font-size: var(--cab-text-sm);
		font-weight: 700;
		cursor: pointer;
		transition: transform var(--cab-pop-ms) ease-out;
	}

	button:hover:not(:disabled) {
		transform: translateY(-1px);
	}

	button:active:not(:disabled) {
		transform: translateY(1px);
	}

	button:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.badge {
		font-size: var(--cab-text-lg);
	}

	.reason {
		font-size: var(--cab-text-xs);
		max-width: calc(var(--cab-sub) * 8);
		text-align: center;
		opacity: 0.8;
	}

	@media (prefers-reduced-motion: reduce) {
		button {
			transition: none;
		}
	}
</style>
