<script lang="ts">
	/**
	 * The confirm step in front of the Bin (`16-…` §1.5, `12-…` D16).
	 *
	 * Binning a bot was one tap and no question — the single most destructive
	 * action in the toy, sitting next to Duplicate and Export at the same weight
	 * and needing the steadiest hand of the three.
	 *
	 * The wording is deliberate. "Take apart" is what you do to a model, not what
	 * you do to a pet, and it says what actually happens: the bricks go back in
	 * the box. Telling a child their bot's adventures survive is the part that
	 * makes the answer honest — the runs really are kept, and the Scrapbook that
	 * shows them arrives in slice e.
	 *
	 * Cancel is the default focus and Escape cancels, because the safe answer
	 * should be the one you get by flinching.
	 */
	interface Props {
		botName: string;
		onconfirm: () => void;
		oncancel: () => void;
		onexport: () => void;
	}

	let { botName, onconfirm, oncancel, onexport }: Props = $props();

	let cancelButton = $state<HTMLButtonElement | undefined>();

	$effect(() => {
		cancelButton?.focus();
	});
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') oncancel();
	}}
/>

<div class="scrim">
	<div
		class="card"
		data-testid="take-apart-confirm"
		role="alertdialog"
		aria-labelledby="take-apart-title"
		aria-describedby="take-apart-body"
	>
		<span class="badge" aria-hidden="true">🧱</span>
		<h2 id="take-apart-title">Take {botName} apart?</h2>
		<p id="take-apart-body">Its adventures stay in the scrapbook.</p>
		<p class="nudge">
			Want to keep the bot itself? <button
				type="button"
				class="link"
				data-testid="take-apart-export"
				onclick={onexport}>Save it to a file first</button
			>.
		</p>

		<div class="actions">
			<button
				type="button"
				class="cancel"
				data-testid="take-apart-cancel"
				bind:this={cancelButton}
				onclick={oncancel}
			>
				Keep it
			</button>
			<button
				type="button"
				class="confirm"
				data-testid="take-apart-confirm-yes"
				onclick={onconfirm}
			>
				Take apart
			</button>
		</div>
	</div>
</div>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 20;
		display: grid;
		place-items: center;
		padding: var(--cab-space-4);
		background: color-mix(in srgb, var(--cab-ink) 55%, transparent);
	}

	.card {
		display: grid;
		justify-items: center;
		gap: var(--cab-space-2);
		max-width: 26rem;
		padding: var(--cab-space-5);
		border: var(--cab-border-panel) solid var(--cab-ink);
		border-radius: var(--cab-radius-panel);
		background: var(--cab-paper);
		color: var(--cab-ink);
		box-shadow: var(--cab-lift-shadow);
		text-align: center;
	}

	.badge {
		font-size: var(--cab-text-2xl);
	}

	h2 {
		margin: 0;
		font-size: var(--cab-text-lg);
	}

	p {
		margin: 0;
		font-size: var(--cab-text-sm);
	}

	.nudge {
		font-size: var(--cab-text-xs);
		opacity: 0.85;
	}

	.link {
		padding: 0;
		border: none;
		background: none;
		color: var(--cab-blue);
		font: inherit;
		text-decoration: underline;
		cursor: pointer;
	}

	.actions {
		display: flex;
		gap: var(--cab-space-2);
		margin-top: var(--cab-space-2);
	}

	.actions button {
		padding: var(--cab-space-2) var(--cab-space-4);
		border: var(--cab-border-part) solid var(--cab-ink);
		border-radius: var(--cab-radius-part);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}

	/*
	 * Cream on the fills, not the `-text` tokens: those are the darker green and
	 * red for coloured text on paper, and on their own fill they vanish — which
	 * is exactly how these two buttons first shipped, with unreadable labels
	 * that every test passed. `contrast.test.ts` already had the right pairing
	 * written down for the STEP button and the GO lever.
	 */
	.cancel {
		background: var(--cab-green-fill);
		color: var(--cab-cream);
	}

	.confirm {
		background: var(--cab-red-fill);
		color: var(--cab-cream);
	}

	.actions button:focus-visible,
	.link:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}
</style>
