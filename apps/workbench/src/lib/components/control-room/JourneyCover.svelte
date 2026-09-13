<script lang="ts">
	import { coverFor, type CoverSubject } from '$lib/assets/covers.js';

	/**
	 * **JourneyCover** (WP109, `96-CONTROL-ROOM-V3.md` §4): a journey's cover
	 * illustration, inlined — the delivered file or the in-house placeholder
	 * drawn from the layout. Decorative by contract: it sits beside the
	 * journey's name, which carries the meaning, so the drawing is hidden
	 * from a reader and its own label is for the figure alone.
	 */
	interface Props {
		subject: CoverSubject;
		/** In px, the width; the height follows the cover's own ratio. */
		width?: number | undefined;
		testId?: string | undefined;
	}

	let { subject, width = 160, testId }: Props = $props();
	const markup = $derived(coverFor(subject));
</script>

<span
	class="cover"
	style:--cover-width="{width}px"
	data-testid={testId ?? `cover-${subject.id.replace('/', '-')}`}
	aria-hidden="true"
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- the cover is an SVG this build authored (covers.ts) or one the commission delivered; never user content. -->
	{@html markup}
</span>

<style>
	.cover {
		display: inline-block;
		width: var(--cover-width);
		line-height: 0;
	}

	.cover :global(svg) {
		width: 100%;
		height: auto;
		border-radius: var(--cab-radius-part);
		box-shadow: 0 2px 0 var(--cab-ink);
	}
</style>
