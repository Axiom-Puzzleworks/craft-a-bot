<script lang="ts">
	import type { GoalCardDefinition } from '@craftabot/core';

	/**
	 * The Goal Card rack along the bench's bottom edge (03-UI-UX-DESIGN.md §4.5).
	 * Cards show a title and difficulty pips; the active one sits in the bot's
	 * card holder. Free Play is the laminated card with a marker pen — it gets a
	 * writable text area, which is why `AgentSpec` carries `customGoalText`.
	 */
	interface Props {
		cards: GoalCardDefinition[];
		activeCardId: string;
		customGoalText: string;
		onselect: (cardId: string) => void;
		oncustomtext: (text: string) => void;
	}

	let { cards, activeCardId, customGoalText, onselect, oncustomtext }: Props = $props();

	const active = $derived(cards.find((card) => card.id === activeCardId));
	const isFreePlay = $derived(activeCardId === 'starter/free-play');

	/**
	 * The card declares itself expert (`16-…` §1.1) — the flag is the author's,
	 * not something inferred here. A pack could ship a long card it considers
	 * ordinary, or a short one it wants flagged, and second-guessing that from
	 * `par` alone would take the decision away from the person who wrote it.
	 */
	const isExpert = $derived(active?.expert === true);

	/** Difficulty pips, inferred from how much the card asks of the bot. */
	function pips(card: GoalCardDefinition): number {
		return Math.min(3, Math.max(1, card.teachesConcepts.length));
	}
</script>

<div class="rack" data-testid="goal-card-rack" data-tutorial="goal-cards">
	<ul class="cards">
		{#each cards as card (card.id)}
			<li>
				<button
					type="button"
					class="card"
					class:card--active={card.id === activeCardId}
					data-testid="card-{card.id.replace('starter/', '')}"
					aria-pressed={card.id === activeCardId}
					onclick={() => onselect(card.id)}
				>
					<span class="title">{card.title}</span>
					<span class="pips" aria-label="Difficulty {pips(card)} of 3">
						{#each [1, 2, 3] as pip (pip)}
							<span class="pip" class:pip--filled={pip <= pips(card)}></span>
						{/each}
					</span>
				</button>
			</li>
		{/each}
	</ul>

	{#if active}
		<div class="holder" data-testid="card-holder">
			<p class="goal" data-testid="active-goal">
				{isFreePlay && customGoalText !== '' ? customGoalText : active.goalText}
			</p>
			{#if active.par !== undefined}
				<p class="par" data-testid="card-par">
					About <strong>{active.par}</strong> steps
					{#if isExpert}<span class="expert" data-testid="card-expert"
							>— Expert card! Your bot will probably need a bigger step budget.</span
						>{/if}
				</p>
			{/if}
			{#if isFreePlay}
				<label class="marker">
					<span>Write your own goal</span>
					<textarea
						data-testid="custom-goal-text"
						rows="2"
						placeholder="Potter about and see what you can do."
						value={customGoalText}
						oninput={(event) => oncustomtext(event.currentTarget.value)}></textarea>
				</label>
			{:else if active.hints.length > 0}
				<p class="hint">You'll probably need: {active.hints[0]}</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	.rack {
		display: grid;
		gap: var(--cab-space-3);
	}

	.cards {
		list-style: none;
		margin: 0;
		padding: var(--cab-space-2);
		display: flex;
		gap: var(--cab-space-2);
		overflow-x: auto;
		background: color-mix(in srgb, var(--cab-board) 22%, var(--cab-paper));
		border-radius: var(--cab-radius-panel);
	}

	.card {
		display: grid;
		gap: var(--cab-space-1);
		/* 2.5 U × 3.5 U portrait, per 11 §2.1. */
		width: calc(var(--cab-u) * 4);
		padding: var(--cab-space-2);
		background: var(--cab-cream);
		border: var(--cab-border-part) solid color-mix(in srgb, var(--cab-green) 60%, transparent);
		border-top: 5px solid var(--cab-green);
		border-radius: 8px;
		font: inherit;
		color: inherit;
		text-align: left;
		cursor: pointer;
		transition: transform var(--cab-pop-ms) ease-out;
	}

	.card:hover {
		transform: translateY(-2px);
	}

	.card:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	.card--active {
		box-shadow: 0 0 0 3px var(--cab-yellow);
	}

	.title {
		font-size: var(--cab-text-xs);
		font-weight: 700;
		line-height: 1.25;
	}

	.pips {
		display: flex;
		gap: 3px;
	}

	.pip {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		border: 1px solid var(--cab-ink);
		opacity: 0.5;
	}

	.pip--filled {
		background: var(--cab-ink);
		opacity: 1;
	}

	.holder {
		display: grid;
		gap: var(--cab-space-2);
		padding: var(--cab-space-3);
		background: var(--cab-cream);
		border: var(--cab-border-part) solid color-mix(in srgb, var(--cab-ink) 25%, transparent);
		border-radius: var(--cab-radius-panel);
	}

	.goal {
		margin: 0;
		font-size: var(--cab-text-base);
	}

	.hint {
		margin: 0;
		font-size: var(--cab-text-xs);
		opacity: 0.75;
	}

	.par {
		margin: 0;
		font-size: var(--cab-text-sm);
	}

	/* The expert warning earns full contrast: it is the reason the dial exists. */
	.expert {
		color: var(--cab-orange);
		font-weight: 600;
	}

	.marker {
		display: grid;
		gap: var(--cab-space-1);
		font-size: var(--cab-text-xs);
	}

	textarea {
		font: inherit;
		font-size: var(--cab-text-sm);
		padding: var(--cab-space-2);
		border: var(--cab-border-part) solid color-mix(in srgb, var(--cab-ink) 30%, transparent);
		border-radius: 6px;
		background: var(--cab-paper);
		resize: vertical;
	}

	textarea:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	@media (prefers-reduced-motion: reduce) {
		.card {
			transition: none;
		}
		.card:hover {
			transform: none;
		}
	}
</style>
