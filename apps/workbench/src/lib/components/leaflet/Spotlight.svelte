<script lang="ts">
	import type { AnchorId } from '$lib/leaflet/anchors.js';

	/**
	 * The dimmed background with a hole cut in it (03-UI-UX-DESIGN.md §6): the
	 * leaflet points at the *real* UI rather than a screenshot, so the thing being
	 * pointed at has to stay visible and usable.
	 *
	 * `pointer-events: none` throughout. The overlay advises; it never traps. A
	 * tutorial that blocked the rest of the screen would contradict both §6 ("the
	 * user performs each step themselves") and the full-keyboard-operation
	 * requirement in §8 — and would strand anyone who wanted to do something the
	 * script did not anticipate.
	 *
	 * The hole is a box-shadow with an enormous spread rather than an SVG mask:
	 * one element, no clip-path support questions, and it dims whatever the page
	 * grows to without being told the viewport size.
	 */

	interface Props {
		anchor: AnchorId | undefined;
	}

	let { anchor }: Props = $props();

	let rect = $state<{ top: number; left: number; width: number; height: number } | undefined>(
		undefined
	);

	const PADDING = 6;

	function measure(): void {
		if (anchor === undefined) {
			rect = undefined;
			return;
		}
		const element = document.querySelector(`[data-tutorial="${anchor}"]`);
		if (!element) {
			// A step may point at something on another screen; no hole is better
			// than a hole in the wrong place.
			rect = undefined;
			return;
		}
		const box = element.getBoundingClientRect();
		rect = {
			top: box.top - PADDING,
			left: box.left - PADDING,
			width: box.width + PADDING * 2,
			height: box.height + PADDING * 2
		};
	}

	$effect(() => {
		// Re-run whenever the step moves the arrow elsewhere.
		void anchor;
		measure();

		const onChange = () => measure();
		window.addEventListener('resize', onChange);
		window.addEventListener('scroll', onChange, true);

		// The bench reflows as bricks are fitted, which is exactly when the arrow
		// is most likely to be pointing at something that just moved.
		const observer = new ResizeObserver(onChange);
		observer.observe(document.body);

		return () => {
			window.removeEventListener('resize', onChange);
			window.removeEventListener('scroll', onChange, true);
			observer.disconnect();
		};
	});
</script>

{#if rect}
	<div
		class="hole"
		data-testid="leaflet-spotlight"
		data-anchor={anchor}
		aria-hidden="true"
		style="top: {rect.top}px; left: {rect.left}px; width: {rect.width}px; height: {rect.height}px"
	></div>
{/if}

<style>
	.hole {
		position: fixed;
		z-index: 20;
		border: 3px solid var(--cab-yellow);
		border-radius: var(--cab-radius-part);
		box-shadow: 0 0 0 9999px color-mix(in srgb, var(--cab-ink) 45%, transparent);
		/* Advises, never traps: every control underneath stays live. */
		pointer-events: none;
		transition: all 160ms ease;
	}

	@media (prefers-reduced-motion: reduce) {
		.hole {
			transition: none;
		}
	}

	:global([data-reduced-motion='true']) .hole {
		transition: none;
	}
</style>
