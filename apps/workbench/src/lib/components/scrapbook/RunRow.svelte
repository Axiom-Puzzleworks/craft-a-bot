<script lang="ts">
	import { resolve } from '$app/paths';
	import type { RunRecord } from '@craftabot/core';
	import { outcomeFace, outcomeWords, stepsWords, whenWords } from '$lib/scrapbook.js';

	/**
	 * One adventure, as a photo card on the scrapbook page (`16-…` §1.4).
	 *
	 * The whole row is a link to the replay, because "open it" is what a child
	 * wants from a photo. Pin is a separate control beside it rather than inside
	 * it — a button inside a link is neither, and a mis-tap that replayed the run
	 * when you meant to keep it would be its own small betrayal.
	 */
	interface Props {
		run: RunRecord;
		/** Show which bot it was — on the all-bots page, where rows are mixed. */
		showBot?: boolean;
		/** Goal card title, if the pack still has the card. */
		cardTitle?: string | undefined;
		onpin: (pinned: boolean) => void;
	}

	let { run, showBot = false, cardTitle, onpin }: Props = $props();
</script>

<article class="row" data-testid="run-{run.id}" data-outcome={run.outcome}>
	<a
		class="open"
		href={resolve('/replay/[runId]', { runId: run.id })}
		data-testid="open-run-{run.id}"
	>
		<span class="face" aria-hidden="true">{outcomeFace(run.outcome)}</span>
		<span class="what">
			<span class="headline">{outcomeWords(run.outcome)}</span>
			<span class="detail">
				{#if showBot}<span class="bot">{run.agentName}</span> ·{/if}
				{cardTitle ?? run.goalCardId} · {stepsWords(run.ticks)} · {whenWords(run.startedAt)}
			</span>
		</span>
	</a>

	<button
		type="button"
		class="pin"
		class:pin--on={run.pinned}
		data-testid="pin-{run.id}"
		aria-pressed={run.pinned}
		title={run.pinned ? 'Keep this one — on' : 'Keep this one'}
		onclick={() => onpin(!run.pinned)}
	>
		<span aria-hidden="true">📌</span>
		<span class="visually-hidden">Keep this one</span>
	</button>
</article>

<style>
	.row {
		display: flex;
		align-items: stretch;
		gap: var(--cab-space-2);
		padding: var(--cab-space-2);
		border: var(--cab-border-part) solid var(--cab-ink);
		border-radius: var(--cab-radius-part);
		/* Lighter than the page, or a "photo card" is just text on a background. */
		background: var(--cab-cream);
		box-shadow: var(--cab-drop-shadow);
	}

	.open {
		display: flex;
		align-items: center;
		gap: var(--cab-space-3);
		flex: 1;
		padding: var(--cab-space-1);
		color: inherit;
		text-decoration: none;
		border-radius: var(--cab-radius-part);
	}

	.face {
		font-size: var(--cab-text-2xl);
		line-height: 1;
	}

	.what {
		display: grid;
		gap: 2px;
	}

	.headline {
		font-weight: 700;
		font-size: var(--cab-text-base);
	}

	.detail {
		font-size: var(--cab-text-xs);
		opacity: 0.8;
	}

	.bot {
		font-weight: 600;
	}

	.pin {
		align-self: center;
		padding: var(--cab-space-1) var(--cab-space-2);
		border: var(--cab-border-part) solid var(--cab-ink);
		border-radius: var(--cab-radius-pill);
		background: transparent;
		font: inherit;
		cursor: pointer;
		/* Off is deliberately faint: a pin that is not holding anything down
		   should not look like one that is. */
		opacity: 0.45;
	}

	.pin--on {
		opacity: 1;
		background: var(--cab-yellow);
	}

	.open:focus-visible,
	.pin:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
		border: 0;
	}
</style>
