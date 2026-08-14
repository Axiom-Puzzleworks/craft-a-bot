<script lang="ts">
	/**
	 * **Talking to the bot** (`16-…` §2.6).
	 *
	 * The Hearing sense could always report messages and there was never a way
	 * to send one (`12-…` D2). WP13's E2 gave the engine `deliverInput`; this is
	 * the mouth for it.
	 *
	 * It is the first control in the toy that changes a run *while it is
	 * happening* without stopping it — which is rather the point. A child
	 * redirecting a bot mid-run is doing prompting, live, and finding out that
	 * the bot only hears it if it was built with ears.
	 */
	interface Props {
		/** Whether the bot was built with the Hearing channel. */
		canHear: boolean;
		/**
		 * Whether the Eyes & Ears brick is fitted at all. Without this the
		 * explanation told a child to fit a brick they had already fitted — the
		 * two states look identical from here and are entirely different jobs.
		 */
		hasSenseBrick?: boolean;
		/** No point talking to a bot that has finished. */
		disabled?: boolean;
		onsay: (text: string) => void;
	}

	let { canHear, hasSenseBrick = false, disabled = false, onsay }: Props = $props();

	let text = $state('');

	const ready = $derived(canHear && !disabled && text.trim() !== '');

	function send(): void {
		if (!ready) return;
		onsay(text.trim());
		text = '';
	}
</script>

<form
	class="say"
	data-testid="say-to-bot"
	onsubmit={(event) => {
		event.preventDefault();
		send();
	}}
>
	<label for="say-text">Say something to your bot</label>

	<div class="row">
		<input
			id="say-text"
			type="text"
			data-testid="say-input"
			placeholder={canHear ? 'Try over there!' : 'This bot has no ears'}
			disabled={!canHear || disabled}
			aria-describedby={canHear ? undefined : 'say-why'}
			bind:value={text}
		/>
		<button type="submit" data-testid="say-send" disabled={!ready}>Say it</button>
	</div>

	{#if !canHear}
		<!--
			The explanation is the teaching, not an apology. A bot that cannot hear
			is a bot missing a brick, and saying so is more use than greying out a
			box and leaving the child to wonder what they did wrong.
		-->
		<p class="why" id="say-why" data-testid="say-no-ears">
			{#if hasSenseBrick}
				Your bot has the Eyes &amp; Ears brick, but its hearing is switched off. Turn Hearing on in
				the brick's panel and it will listen while it works.
			{:else}
				Your bot has no ears yet. Fit the Eyes &amp; Ears brick, switch its hearing on, and it will
				listen while it works.
			{/if}
		</p>
	{/if}
</form>

<style>
	.say {
		display: grid;
		gap: var(--cab-space-1);
		padding: var(--cab-space-3);
		background: var(--cab-cream);
		border: var(--cab-border-part) solid color-mix(in srgb, var(--cab-ink) 25%, transparent);
		border-radius: var(--cab-radius-panel);
	}

	label {
		font-size: var(--cab-text-sm);
		font-weight: 600;
	}

	.row {
		display: flex;
		gap: var(--cab-space-2);
	}

	input {
		flex: 1;
		min-height: 44px;
		padding: var(--cab-space-1) var(--cab-space-2);
		font: inherit;
		font-size: var(--cab-text-sm);
		color: var(--cab-ink);
		background: var(--cab-paper);
		border: var(--cab-border-part) solid var(--cab-ink);
		border-radius: var(--cab-radius-part);
	}

	button {
		min-height: 44px;
		min-width: 44px;
		padding: var(--cab-space-1) var(--cab-space-3);
		font: inherit;
		font-size: var(--cab-text-sm);
		font-weight: 600;
		color: var(--cab-cream);
		background: var(--cab-blue);
		border: var(--cab-border-part) solid var(--cab-blue);
		border-radius: var(--cab-radius-pill);
		cursor: pointer;
	}

	button:disabled,
	input:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}

	.why {
		margin: 0;
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted);
	}

	input:focus-visible,
	button:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}
</style>
