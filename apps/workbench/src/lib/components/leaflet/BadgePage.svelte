<script lang="ts">
	import { CHAPTERS } from '$lib/leaflet/chapters.js';

	/**
	 * The leaflet's back page (03-UI-UX-DESIGN.md §6): a sheet of six merit-badge
	 * stickers, greyed until earned.
	 *
	 * "Pure delight, no gamification systems beyond this" — so there is no score,
	 * no streak, and nothing is locked behind a badge. Unearned badges are shown
	 * rather than hidden, because half the pleasure of a sticker sheet is the
	 * empty spaces.
	 *
	 * The rosette art is a P1 asset (`11-VISUAL-ASSET-MANIFEST.md` §J) arriving at
	 * WP10; these are token-built placeholders with the right silhouette.
	 */

	interface Props {
		earned: readonly string[];
	}

	let { earned }: Props = $props();
</script>

<section class="page" data-testid="badge-page" aria-label="Merit badges">
	<h3>Merit badges</h3>
	<ul>
		{#each CHAPTERS as chapter (chapter.id)}
			{@const got = earned.includes(chapter.badge.id)}
			<li>
				<span
					class="rosette"
					class:rosette--earned={got}
					data-testid="badge-{chapter.badge.id}"
					data-earned={got}
				>
					{chapter.number}
				</span>
				<span class="name">{chapter.badge.name}</span>
				<span class="state">{got ? 'Earned' : 'Not yet'}</span>
			</li>
		{/each}
	</ul>
</section>

<style>
	.page {
		padding: var(--cab-space-3);
		background: var(--cab-paper);
		border-radius: var(--cab-radius-part);
	}

	h3 {
		margin: 0 0 var(--cab-space-2);
		font-size: var(--cab-text-sm);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--cab-ink);
	}

	ul {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--cab-space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: grid;
		grid-template-columns: auto 1fr;
		grid-template-rows: auto auto;
		align-items: center;
		gap: 0 var(--cab-space-2);
	}

	.rosette {
		grid-row: 1 / span 2;
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		font-size: var(--cab-text-sm);
		font-weight: 700;
		color: var(--cab-ink);
		background: var(--cab-cream);
		border: var(--cab-border-part) dashed var(--cab-ink);
		border-radius: 50%;
		/* Never colour alone (03 §8): earned badges also gain a solid rim and a
		   word underneath. */
		opacity: 0.45;
	}

	.rosette--earned {
		background: var(--cab-yellow);
		border-style: solid;
		opacity: 1;
	}

	.name {
		font-size: var(--cab-text-xs);
		font-weight: 600;
		color: var(--cab-ink);
	}

	.state {
		font-size: var(--cab-text-xs);
		color: var(--cab-ink);
		opacity: 0.7;
	}
</style>
