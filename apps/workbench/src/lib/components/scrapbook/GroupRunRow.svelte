<script lang="ts">
	import { resolve } from '$app/paths';
	import type { GroupRunRecord } from '@craftabot/core';
	import { outcomeFace, outcomeWords, roundsWords, whenWords } from '$lib/scrapbook.js';

	/**
	 * **One shared adventure, as a photo card** (WP31, `24-ROBOT-FRIENDS-DESIGN.md`
	 * §4.5) — `RunRow`'s own layout, re-expressed for a `GroupRunRecord` rather
	 * than imported: a group has two names and a round count where a solo run
	 * has one name and a step count, and re-typing `RunRow` to cover both would
	 * have made the common photo-card shape harder to read for the sake of a
	 * component neither screen otherwise shares (`24-…` §4.5's own reasoning).
	 *
	 * Opens the same `/replay/[runId]` a solo adventure does — the group's own
	 * id, which that route now falls back to `storage.getGroupRun` for (§4.5) —
	 * so "open it" means the same thing regardless of which kind of card it was.
	 */
	interface Props {
		group: GroupRunRecord;
		/** Both bots' names, in member order — resolved from their own `RunRecord`s. */
		memberNames: string[];
		/** Goal card title, if the pack still has the card. */
		cardTitle?: string | undefined;
		onpin: (pinned: boolean) => void;
	}

	let { group, memberNames, cardTitle, onpin }: Props = $props();
</script>

<article class="row" data-testid="group-{group.id}" data-outcome={group.outcome}>
	<a
		class="open"
		href={resolve('/replay/[runId]', { runId: group.id })}
		data-testid="open-group-{group.id}"
	>
		<span class="face" aria-hidden="true">{outcomeFace(group.outcome)}</span>
		<span class="what">
			<span class="headline">{outcomeWords(group.outcome)}</span>
			<span class="detail">
				<span class="bots">{memberNames.join(' & ') || 'Robot Friends'}</span> ·
				{cardTitle ?? group.goalCardId} · {roundsWords(group.rounds)} · {whenWords(group.startedAt)}
			</span>
		</span>
	</a>

	<button
		type="button"
		class="pin"
		class:pin--on={group.pinned}
		data-testid="pin-group-{group.id}"
		aria-pressed={group.pinned}
		title={group.pinned ? 'Keep this one — on' : 'Keep this one'}
		onclick={() => onpin(!group.pinned)}
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

	.bots {
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
