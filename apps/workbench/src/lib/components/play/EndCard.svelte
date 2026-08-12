<script lang="ts">
	import type { RunOutcome } from '@craftabot/core';

	/**
	 * End cards (03-UI-UX-DESIGN.md §5.2). Every outcome gets one, and every one
	 * is written as a teaching moment rather than a scolding — failure is a
	 * first-class outcome here (00 §3.2), and a tripped guardrail is the system
	 * *succeeding* (08 §3).
	 */
	interface Props {
		outcome: RunOutcome;
		onseeTrace: () => void;
		onbackToBench: () => void;
	}

	let { outcome, onseeTrace, onbackToBench }: Props = $props();

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

	const card = $derived(CARDS[outcome]);
</script>

<div class="backdrop" data-testid="end-card" data-outcome={outcome}>
	<div class="card" style="--accent: {card.accent}" role="alertdialog" aria-labelledby="end-title">
		<span class="badge" aria-hidden="true">{card.badge}</span>
		<h2 id="end-title">{card.title}</h2>
		<p>{card.body}</p>
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
