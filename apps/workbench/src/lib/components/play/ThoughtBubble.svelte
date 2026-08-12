<script lang="ts">
	/**
	 * The bot's current thought, from the `decision` event (03-UI-UX-DESIGN.md
	 * §5.1). Abbreviated by default; click to see all of it.
	 */
	interface Props {
		thought: string;
		narration: string;
	}

	let { thought, narration }: Props = $props();
	let expanded = $state(false);

	const LIMIT = 120;
	const isLong = $derived(thought.length > LIMIT);
	const shown = $derived(expanded || !isLong ? thought : `${thought.slice(0, LIMIT)}…`);
</script>

<div class="bubble" data-testid="thought-bubble" data-tutorial="thought-bubble">
	{#if thought === ''}
		<p class="quiet">Your bot has not thought anything yet.</p>
	{:else}
		<p class="thought" data-testid="thought-text">{shown}</p>
		{#if isLong}
			<button type="button" data-testid="expand-thought" onclick={() => (expanded = !expanded)}>
				{expanded ? 'Show less' : 'Show the whole thought'}
			</button>
		{/if}
	{/if}

	{#if narration !== ''}
		<p class="narration" data-testid="narration">{narration}</p>
	{/if}
</div>

<style>
	.bubble {
		position: relative;
		display: grid;
		gap: var(--cab-space-2);
		justify-items: start;
		padding: var(--cab-space-3);
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink);
		border-radius: 18px;
	}

	/* The comic-bubble tail. */
	.bubble::after {
		content: '';
		position: absolute;
		top: 100%;
		left: var(--cab-space-5);
		border: 10px solid transparent;
		border-top-color: var(--cab-ink);
	}

	p {
		margin: 0;
	}

	.thought {
		font-size: var(--cab-text-base);
		line-height: 1.4;
	}

	.quiet {
		font-size: var(--cab-text-sm);
		opacity: 0.65;
	}

	.narration {
		font-size: var(--cab-text-sm);
		font-style: italic;
		opacity: 0.8;
	}

	button {
		font: inherit;
		font-size: var(--cab-text-xs);
		padding: 0;
		background: none;
		border: none;
		color: var(--cab-blue-text);
		text-decoration: underline;
		cursor: pointer;
	}

	button:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}
</style>
