<script lang="ts">
	/**
	 * **"Did it mean…?"** (`16-…` §2.4, C4's UI face).
	 *
	 * When a name the bot wrote matches more than one thing, the world says so
	 * in prose — and prose is the right answer for the *bot*, which reads it and
	 * tries again next turn. It is the wrong answer for a five-year-old watching,
	 * who sees a refusal and a wall of words and learns nothing about why.
	 *
	 * The candidates ride alongside the narration as data (`ActionResult
	 * .didYouMean`), so the choices can be shown as themselves.
	 *
	 * **Buttons only when the bot can hear.** §2.4 says these are "for the
	 * player's understanding" and that the bot still learns from the text, so
	 * nothing here is load-bearing for the run. But a chip that looks tappable
	 * and does nothing is a worse lie than a plain list — so when the bot has
	 * ears these say the name to it, and when it does not they are simply words.
	 */
	interface Props {
		choices: readonly string[];
		/** Whether saying one to the bot is possible (`16-…` §2.6). */
		canHear?: boolean;
		onsay?: ((text: string) => void) | undefined;
	}

	let { choices, canHear = false, onsay }: Props = $props();
</script>

{#if choices.length > 0}
	<div class="did-you-mean" data-testid="did-you-mean">
		<span class="lead">Did it mean:</span>
		<ul>
			{#each choices as choice (choice)}
				<li>
					{#if canHear && onsay}
						<button
							type="button"
							class="chip chip--tappable"
							data-testid="chip-{choice}"
							onclick={() => onsay?.(`I meant the ${choice}.`)}
						>
							{choice}
						</button>
					{:else}
						<span class="chip" data-testid="chip-{choice}">{choice}</span>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
{/if}

<style>
	.did-you-mean {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--cab-space-2);
		padding: var(--cab-space-2);
		background: var(--cab-cream);
		border: var(--cab-border-part) solid var(--cab-ink);
		border-radius: var(--cab-radius-panel);
	}

	.lead {
		font-size: var(--cab-text-sm);
		font-weight: 600;
	}

	ul {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.chip {
		display: inline-block;
		padding: var(--cab-space-1) var(--cab-space-2);
		font: inherit;
		font-size: var(--cab-text-sm);
		color: var(--cab-ink);
		background: var(--cab-paper);
		border: var(--cab-border-part) solid var(--cab-ink);
		border-radius: var(--cab-radius-pill);
	}

	.chip--tappable {
		min-height: 44px;
		background: var(--cab-yellow);
		cursor: pointer;
	}

	.chip--tappable:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}
</style>
