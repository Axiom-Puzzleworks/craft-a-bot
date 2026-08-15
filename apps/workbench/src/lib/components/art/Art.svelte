<script lang="ts">
	import { inlineSvg, type InlineOptions } from '$lib/assets/inline.js';

	/**
	 * One wave 1 artefact, inlined (`22-…` §5).
	 *
	 * Deliberately no wrapper and no styles of its own: what an asset should be
	 * sized and positioned like belongs to the scene it is in, not to the picture.
	 * A caller wraps it and reaches the SVG with `:global(svg)` — scoped styles
	 * never cross an `{@html}` boundary, whoever owns the element.
	 *
	 * `{@html}` is safe here and only here: every `source` is an SVG imported
	 * `?raw` at build time from `lib/assets/`, so the markup is ours and is fixed
	 * before the app runs. Nothing from a kit file, a trace, a goal card or a
	 * child's typing may be passed to this component.
	 */
	interface Props extends InlineOptions {
		source: string;
	}

	let { source, ...options }: Props = $props();

	const markup = $derived(inlineSvg(source, options));
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -- build-time asset markup; see above -->
{@html markup}
