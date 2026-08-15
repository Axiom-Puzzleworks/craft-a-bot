<script lang="ts">
	import { EFFECTS } from '$lib/assets/index.js';
	import type { FxCue } from '$lib/fx-cue.js';
	import Art from '$lib/components/art/Art.svelte';

	/**
	 * One of the five effects, over the bot's cell (`20-…` §5.4).
	 *
	 * **Static-first, and that is not a compromise.** Every artefact was drawn so
	 * its resting frame means something on its own — the confetti ships as a
	 * scattered burst rather than twelve pieces stacked at the origin, the
	 * sparkle's first frame is a whole sparkle. So the animation here is an
	 * enhancement to a picture that already reads, and `prefers-reduced-motion:
	 * reduce` turns all of it off without turning the message off. An effect that
	 * only reads as motion is an effect some children never see.
	 */
	interface Props {
		cue: FxCue;
	}

	let { cue }: Props = $props();

	const SOURCE: Record<FxCue, string> = {
		denied: EFFECTS.deniedStamp,
		puzzled: EFFECTS.questionPuff,
		celebrating: EFFECTS.confetti,
		sleeping: EFFECTS.zzz,
		sparkle: EFFECTS.sparkle
	};
</script>

<span class="fx fx--{cue}" data-testid="fx-{cue}">
	<Art source={SOURCE[cue]} />
</span>

<style>
	/*
	 * Anchored to the bot's cell and sized in multiples of it, so an effect
	 * lands on the thing it is about however big the room is drawn.
	 */
	.fx {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 100%;
		height: 100%;
		transform: translate(-50%, -50%);
		z-index: 5;
		pointer-events: none;
	}

	.fx :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}

	/* The stamp is 192 px on a 96 px cell: two cells, as drawn. */
	.fx--denied {
		width: 200%;
		height: 200%;
		animation: stamp 220ms cubic-bezier(0.2, 1.4, 0.4, 1) both;
	}

	.fx--celebrating {
		width: 300%;
		height: 300%;
		animation: burst 320ms ease-out both;
	}

	/* Puffs and Zs sit above the bot rather than over its face. */
	.fx--puzzled {
		top: 8%;
		animation: rise 260ms ease-out both;
	}

	.fx--sleeping {
		top: 4%;
		animation: drift 2.6s ease-in-out infinite;
	}

	.fx--sparkle {
		left: 82%;
		top: 18%;
		width: 55%;
		height: 55%;
	}

	/*
	 * The confetti's twelve particles, addressed individually — which is what
	 * `20-…` §5.4 shipped `#c1`…`#c12` for. They are already scattered, so this
	 * only staggers their arrival.
	 */
	.fx--celebrating :global(g[data-part^='c']) {
		animation: pop 420ms ease-out both;
		transform-box: fill-box;
		transform-origin: center;
	}

	.fx--celebrating :global(g[data-part='c1']) {
		animation-delay: 0ms;
	}
	.fx--celebrating :global(g[data-part='c2']) {
		animation-delay: 30ms;
	}
	.fx--celebrating :global(g[data-part='c3']) {
		animation-delay: 60ms;
	}
	.fx--celebrating :global(g[data-part='c4']) {
		animation-delay: 90ms;
	}
	.fx--celebrating :global(g[data-part='c5']) {
		animation-delay: 120ms;
	}
	.fx--celebrating :global(g[data-part='c6']) {
		animation-delay: 150ms;
	}
	.fx--celebrating :global(g[data-part='c7']) {
		animation-delay: 180ms;
	}
	.fx--celebrating :global(g[data-part='c8']) {
		animation-delay: 210ms;
	}
	.fx--celebrating :global(g[data-part='c9']) {
		animation-delay: 240ms;
	}
	.fx--celebrating :global(g[data-part='c10']) {
		animation-delay: 270ms;
	}
	.fx--celebrating :global(g[data-part='c11']) {
		animation-delay: 300ms;
	}
	.fx--celebrating :global(g[data-part='c12']) {
		animation-delay: 330ms;
	}

	/*
	 * The sparkle's three frames, cycled. The file ships frames 2 and 3 with
	 * `display="none"` so that a page with no CSS still shows a complete
	 * sparkle; here all three are shown and only one is opaque at a time.
	 */
	.fx--sparkle :global(g[data-part^='frame-']) {
		display: block;
		opacity: 0;
		animation: twinkle 600ms steps(1, end) infinite;
	}

	.fx--sparkle :global(g[data-part='frame-1']) {
		animation-delay: 0ms;
	}
	.fx--sparkle :global(g[data-part='frame-2']) {
		animation-delay: 200ms;
	}
	.fx--sparkle :global(g[data-part='frame-3']) {
		animation-delay: 400ms;
	}

	@keyframes stamp {
		from {
			transform: translate(-50%, -50%) scale(1.7) rotate(-6deg);
			opacity: 0;
		}
		to {
			transform: translate(-50%, -50%) scale(1) rotate(0deg);
			opacity: 1;
		}
	}

	@keyframes burst {
		from {
			transform: translate(-50%, -50%) scale(0.7);
		}
		to {
			transform: translate(-50%, -50%) scale(1);
		}
	}

	@keyframes pop {
		from {
			transform: scale(0.2);
			opacity: 0;
		}
		to {
			transform: scale(1);
			opacity: 1;
		}
	}

	@keyframes rise {
		from {
			transform: translate(-50%, -20%);
			opacity: 0;
		}
		to {
			transform: translate(-50%, -50%);
			opacity: 1;
		}
	}

	@keyframes drift {
		0%,
		100% {
			transform: translate(-50%, -50%);
		}
		50% {
			transform: translate(-50%, -62%);
		}
	}

	@keyframes twinkle {
		0%,
		32% {
			opacity: 1;
		}
		33%,
		100% {
			opacity: 0;
		}
	}

	/*
	 * Everything above is decoration on a picture that already says the thing.
	 * With motion off, each effect is the frame the illustrator drew: the stamp
	 * stamped, the burst scattered, one whole sparkle.
	 */
	@media (prefers-reduced-motion: reduce) {
		.fx,
		.fx :global(*) {
			animation: none !important;
		}

		.fx--sparkle :global(g[data-part^='frame-']) {
			display: none;
			opacity: 1;
		}

		.fx--sparkle :global(g[data-part='frame-1']) {
			display: block;
		}
	}
</style>
