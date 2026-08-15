<script lang="ts">
	import { CHAPTERS } from '$lib/leaflet/chapters.js';
	import { TEMPLATES } from '$lib/assets/index.js';
	import Art from '$lib/components/art/Art.svelte';

	/**
	 * The leaflet's back page (03-UI-UX-DESIGN.md §6): a sheet of merit-badge
	 * stickers, greyed until earned.
	 *
	 * "Pure delight, no gamification systems beyond this" — so there is no score,
	 * no streak, and nothing is locked behind a badge. Unearned badges are shown
	 * rather than hidden, because half the pleasure of a sticker sheet is the
	 * empty spaces.
	 *
	 * **The rosette is drawn now** (WP18). One template, seven times over: the
	 * chapter number goes into `#emboss`, which the file ships empty precisely so
	 * that an eighth chapter needs no eighth artefact (`20-…` §5.5 — "do not bake
	 * a count"), and the earned treatment is a layer the file already carries.
	 */

	interface Props {
		earned: readonly string[];
	}

	let { earned }: Props = $props();

	/**
	 * The number, moulded into the rosette.
	 *
	 * Rendered as text in the UI face rather than drawn, which is what `20-…` §3
	 * means by "moulded label text, replaced by the app" — and is why the wave 1
	 * typeface question (`20-…` §8.3) does not block this. Ink on the cream
	 * medallion; the tint never reaches the middle of the badge.
	 */
	const emboss = (chapterNumber: number) =>
		`<text x="20" y="27" text-anchor="middle" fill="#2B2620" style="font: 700 26px var(--cab-font-ui)">${chapterNumber}</text>`;
</script>

<section class="page" data-testid="badge-page" aria-label="Merit badges">
	<h3>Merit badges</h3>
	<ul>
		{#each CHAPTERS as chapter (chapter.id)}
			{@const got = earned.includes(chapter.badge.id)}
			<li>
				<span
					class="rosette"
					data-testid="badge-{chapter.badge.id}"
					data-earned={got}
					aria-hidden="true"
				>
					<Art
						source={TEMPLATES.badgeRosette}
						variants={{ state: got ? 'earned' : 'none' }}
						slots={{ emboss: emboss(chapter.number) }}
					/>
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
		display: block;
		width: 40px;
		height: 40px;
		/*
		 * Teal, which `20-…` §2 lists as an accent and explicitly not a brick
		 * colour. A rosette is not a Memory brick and must not be green; blue —
		 * the artwork's own fallback — would put an LLM colour on all seven.
		 */
		--part-tint: var(--cab-teal);
	}

	.rosette :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}

	/*
	 * **Not dimmed.** The placeholder rosette used `opacity: 0.45`, which is the
	 * one thing `04-…` §2.3 forbids — it cost five failing contrast routes in
	 * WP17 — and it took the chapter number down with it. An unearned badge is a
	 * muted token instead, and the difference is never colour alone: the earned
	 * one gains a gold ring and a tick from `#state-earned`, and the word
	 * underneath says which it is.
	 */
	.rosette[data-earned='false'] {
		--part-tint: var(--cab-ink-muted);
	}

	.name {
		font-size: var(--cab-text-xs);
		font-weight: 600;
		color: var(--cab-ink);
	}

	/* Same rule, one line down: the secondary token, not a dimmed primary. */
	.state {
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted);
	}
</style>
