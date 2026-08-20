<script lang="ts">
	import { focusTrap } from '$lib/a11y/focus-trap.js';
	import type { AgentRecord, GoalCardDefinition } from '@craftabot/core';

	/**
	 * **The Robot Friends picker** (WP31, `24-ROBOT-FRIENDS-DESIGN.md` §4.6) —
	 * pulled beside `GoLever` once a bot is GO-ready. Picks a coop card and a
	 * second GO-ready bot from the shelf, then hands both back for the bench
	 * to launch `/play/duo?a=&b=&card=` (`24-…` §4.3).
	 *
	 * One panel, not a wizard: §4.6's "in order" describes reading order
	 * (a card, then a partner) rather than two separate screens — a single
	 * "Send them in!" button that only lights once both are chosen.
	 *
	 * The shell (scrim, card, focus trap, Escape-to-cancel) follows
	 * `TakeApartConfirm.svelte`'s own pattern, the one existing overlay this
	 * codebase already had to get right.
	 */
	interface Props {
		/** This bot's own name, for the header. */
		botName: string;
		coopGoalCards: GoalCardDefinition[];
		/** Other GO-ready bots on the shelf — already filtered by the caller. */
		candidates: AgentRecord[];
		oncancel: () => void;
		onlaunch: (goalCardId: string, otherAgentId: string) => void;
	}

	let { botName, coopGoalCards, candidates, oncancel, onlaunch }: Props = $props();

	let cardId = $state<string | undefined>(undefined);
	let agentId = $state<string | undefined>(undefined);
	let cancelButton = $state<HTMLButtonElement | undefined>();

	const ready = $derived(cardId !== undefined && agentId !== undefined);

	function launch(): void {
		if (cardId !== undefined && agentId !== undefined) onlaunch(cardId, agentId);
	}
</script>

<div class="scrim">
	<div
		class="card"
		data-testid="robot-friends-picker"
		role="dialog"
		aria-labelledby="rf-title"
		use:focusTrap={{ initial: () => cancelButton, onescape: oncancel }}
	>
		<span class="badge" aria-hidden="true">🤝</span>
		<h2 id="rf-title">Robot Friends</h2>
		<p class="lede">Send {botName} to play together with another robot.</p>

		<fieldset class="group">
			<legend>Pick a card to play together</legend>
			<ul class="list">
				{#each coopGoalCards as goalCard (goalCard.id)}
					<li>
						<button
							type="button"
							class="option"
							class:option--active={cardId === goalCard.id}
							data-testid="rf-card-{goalCard.id.replace('starter/', '')}"
							aria-pressed={cardId === goalCard.id}
							onclick={() => (cardId = goalCard.id)}
						>
							{goalCard.title}
						</button>
					</li>
				{/each}
			</ul>
		</fieldset>

		<fieldset class="group">
			<legend>Pick a robot friend</legend>
			{#if candidates.length === 0}
				<p class="empty" data-testid="rf-no-candidates">No other robot is ready to play yet.</p>
			{:else}
				<ul class="list">
					{#each candidates as candidate (candidate.id)}
						<li>
							<button
								type="button"
								class="option"
								class:option--active={agentId === candidate.id}
								data-testid="rf-bot-{candidate.id}"
								aria-pressed={agentId === candidate.id}
								onclick={() => (agentId = candidate.id)}
							>
								{candidate.spec.name}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</fieldset>

		<div class="actions">
			<button
				type="button"
				class="cancel"
				data-testid="robot-friends-cancel"
				bind:this={cancelButton}
				onclick={oncancel}
			>
				Never mind
			</button>
			<button
				type="button"
				class="go"
				data-testid="robot-friends-go"
				disabled={!ready}
				onclick={launch}
			>
				Send them in!
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
		width: 100%;
		max-width: 28rem;
		max-height: 90vh;
		overflow-y: auto;
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

	.lede {
		margin: 0;
		font-size: var(--cab-text-sm);
	}

	.group {
		width: 100%;
		margin: 0;
		padding: 0;
		border: none;
		display: grid;
		gap: var(--cab-space-1);
		text-align: left;
	}

	legend {
		padding: 0;
		font-size: var(--cab-text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		opacity: 0.75;
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--cab-space-1);
	}

	.empty {
		margin: 0;
		font-size: var(--cab-text-sm);
		opacity: 0.75;
	}

	.option {
		width: 100%;
		padding: var(--cab-space-2) var(--cab-space-3);
		background: var(--cab-cream);
		border: var(--cab-border-part) solid color-mix(in srgb, var(--cab-ink) 30%, transparent);
		border-radius: var(--cab-radius-part);
		font: inherit;
		font-size: var(--cab-text-sm);
		text-align: left;
		cursor: pointer;
	}

	/* The same selection ring `GoalCardRack`'s own active card already uses. */
	.option--active {
		box-shadow: 0 0 0 3px var(--cab-yellow);
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

	.cancel {
		background: var(--cab-cream);
	}

	.go {
		background: var(--cab-green-fill);
		color: var(--cab-cream);
	}

	.go:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.option:focus-visible,
	.actions button:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}
</style>
