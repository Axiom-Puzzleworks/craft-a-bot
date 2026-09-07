<script lang="ts">
	import type { RunOutcome } from '@craftabot/core';
	import { focusTrap } from '$lib/a11y/focus-trap.js';

	/**
	 * End cards (03-UI-UX-DESIGN.md §5.2). Every outcome gets one, and every one
	 * is written as a teaching moment rather than a scolding — failure is a
	 * first-class outcome here (00 §3.2), and a tripped guardrail is the system
	 * *succeeding* (08 §3).
	 */
	interface Props {
		outcome: RunOutcome;
		/** Why it ended, where the outcome alone does not say (E2). */
		reason?: string | undefined;
		/** "What would help?", read from this run's trace (`16-…` §2.3). */
		hint?: string | undefined;
		/**
		 * The run has reached the Scrapbook — its record, its events and its
		 * summary are all stored (WP56 stage A). Until then the card says
		 * nothing about saving: a child who shuts the tab on "Saved" should
		 * find the run there, so the word waits for the write.
		 */
		saved?: boolean;
		/**
		 * The guardrail that ended the run could not check and failed closed
		 * (UX-1, 2026-09-07) — a hosted guard's token rejected, its service
		 * unreachable. The same outcome as a catch, and the opposite story: no
		 * rule fired on anything the customer said, so the card must not say
		 * one did.
		 */
		failedClosed?: boolean;
		onseeTrace: () => void;
		onbackToBench: () => void;
	}

	let {
		outcome,
		reason,
		hint,
		saved = false,
		failedClosed = false,
		onseeTrace,
		onbackToBench
	}: Props = $props();

	const CARDS: Record<RunOutcome, { badge: string; title: string; body: string; accent: string }> =
		{
			SUCCESS: {
				badge: '🏅',
				title: 'Goal achieved!',
				body: 'Your bot worked it out. Have a look at the Flight Recorder to see exactly how it got there.',
				accent: 'var(--cab-green)'
			},
			OUT_OF_STEPS: {
				badge: '😴',
				title: 'Ran out of steps',
				body: 'The step budget ran dry before the goal was met. What would help it plan better — more memory, a different sense, a clearer goal?',
				accent: 'var(--cab-yellow)'
			},
			STOPPED_BY_USER: {
				badge: '✋',
				title: 'You stopped the run',
				body: 'Everything up to this point is still in the Flight Recorder.',
				accent: 'var(--cab-sky)'
			},
			STOPPED_BY_GUARDRAIL: {
				badge: '🛡',
				title: 'The Safety Brick did its job',
				body: 'A rule you set stopped the run before it went further. That is the system working, not failing.',
				accent: 'var(--cab-yellow)'
			},
			ERROR: {
				badge: '🔧',
				title: 'Something went wrong',
				body: 'The run stopped because of an error rather than a decision. The Flight Recorder has the details.',
				accent: 'var(--cab-red)'
			}
		};

	/** The fail-closed card: fail-closed is the system working too, but nothing was caught. */
	const COULD_NOT_CHECK = {
		badge: '🔌',
		title: 'The safety check could not run',
		body: 'The Armour Brick could not reach its service, so it stopped the run rather than let it carry on unchecked. That is fail-closed. Nothing was wrong with what was said — check the battery in Settings and try again.',
		accent: 'var(--cab-yellow)'
	};

	const card = $derived(
		outcome === 'STOPPED_BY_GUARDRAIL' && failedClosed ? COULD_NOT_CHECK : CARDS[outcome]
	);

	/**
	 * Who decided (`16-…` §2.5). Free Play can end because the world's predicate
	 * was met — the bot pressed `celebrate` and meant it — or because a person
	 * looked at what happened and said that will do. Both are SUCCESS, and the
	 * difference between a bot judging its own work and a person judging it is
	 * the whole lesson of the card.
	 */
	const declaredByPlayer = $derived(
		outcome === 'SUCCESS' && (reason ?? '').includes('declared finished by the player')
	);
</script>

<div
	class="backdrop"
	data-testid="end-card"
	data-outcome={outcome}
	data-failed-closed={outcome === 'STOPPED_BY_GUARDRAIL' && failedClosed ? 'true' : undefined}
>
	<div
		class="card"
		style="--accent: {card.accent}"
		role="alertdialog"
		aria-labelledby="end-title"
		use:focusTrap
	>
		<span class="badge" aria-hidden="true">{card.badge}</span>
		<h2 id="end-title">{card.title}</h2>
		<p>{card.body}</p>
		{#if declaredByPlayer}
			<p class="who" data-testid="end-declared-by-player">
				You decided this one was done. Your bot did not say so itself — deciding when a job is
				finished is a job of its own.
			</p>
		{:else if outcome === 'SUCCESS'}
			<p class="who" data-testid="end-declared-by-bot">
				Your bot decided it had finished, and it was right.
			</p>
		{/if}
		{#if hint}
			<!--
				Advice about *this* run, from its own trace. A generic tip would be
				worse than silence: it sends a child to change the wrong thing.
			-->
			<p class="hint" data-testid="end-hint">{hint}</p>
		{/if}

		{#if saved}
			<p class="saved" role="status" data-testid="run-saved">Saved to your Scrapbook.</p>
		{/if}

		<div class="actions">
			<button type="button" data-testid="end-see-trace" onclick={onseeTrace}>
				See the flight recorder
			</button>
			<button type="button" class="primary" data-testid="end-back-to-bench" onclick={onbackToBench}>
				Back to the bench
			</button>
		</div>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		padding: var(--cab-space-4);
		background: color-mix(in srgb, var(--cab-ink) 45%, transparent);
		z-index: 10;
	}

	.saved {
		margin: 0;
		font-size: var(--cab-text-sm);
		color: var(--cab-ink-muted);
	}

	.card {
		display: grid;
		justify-items: center;
		gap: var(--cab-space-3);
		max-width: 460px;
		padding: var(--cab-space-6) var(--cab-space-5);
		text-align: center;
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--accent);
		border-radius: var(--cab-radius-panel);
		box-shadow: var(--cab-lift-shadow);
	}

	.badge {
		font-size: 48px;
	}

	h2 {
		margin: 0;
		font-size: var(--cab-text-xl);
		color: var(--cab-ink);
	}

	p {
		margin: 0;
		font-size: var(--cab-text-sm);
		line-height: 1.5;
	}

	.who {
		font-size: var(--cab-text-sm);
		color: var(--cab-ink-muted);
	}

	.hint {
		max-width: 26rem;
		font-size: var(--cab-text-sm);
		color: var(--cab-ink-muted);
	}

	.actions {
		display: flex;
		gap: var(--cab-space-2);
		flex-wrap: wrap;
		justify-content: center;
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

	button.primary {
		background: var(--cab-blue);
		color: var(--cab-cream);
		border-color: var(--cab-blue);
	}

	button:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}
</style>
