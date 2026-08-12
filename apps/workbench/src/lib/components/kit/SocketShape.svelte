<script lang="ts">
	import type { BrickKind } from '$lib/bricks.js';

	/**
	 * The socket negative: a recessed silhouette of the part that belongs here
	 * (11 §H, `bricks/socket-set`). This is the classic construction-toy
	 * affordance — the hole is shaped like the piece, so the piece only fits
	 * where it belongs, and an empty socket already tells you what is missing.
	 */
	interface Props {
		kind: BrickKind;
		state?: 'empty' | 'candidate' | 'rejecting' | 'occupied';
	}

	let { kind, state = 'empty' }: Props = $props();
</script>

<span class="socket socket--{kind} socket--{state}" aria-hidden="true"></span>

<style>
	.socket {
		position: absolute;
		inset: 0;
		border-radius: var(--cab-radius-part);
		border: 2px dashed color-mix(in srgb, var(--socket-colour) 55%, transparent);
		background: color-mix(in srgb, var(--socket-colour) 10%, transparent);
		box-shadow: inset 0 2px 4px var(--cab-shadow);
		transition: background var(--cab-snap-ms) ease-out;
	}

	.socket--candidate {
		border-style: solid;
		border-width: 3px;
		background: color-mix(in srgb, var(--socket-colour) 28%, transparent);
	}

	.socket--rejecting {
		border-color: var(--cab-red);
		background: color-mix(in srgb, var(--cab-red) 14%, transparent);
	}

	.socket--occupied {
		border: none;
		background: none;
		box-shadow: none;
	}

	.socket--llm {
		--socket-colour: var(--cab-brick-llm);
	}
	.socket--memory {
		--socket-colour: var(--cab-brick-memory);
	}
	.socket--tools {
		--socket-colour: var(--cab-brick-tools);
	}
	.socket--sense {
		--socket-colour: var(--cab-brick-sense);
	}
	.socket--actions {
		--socket-colour: var(--cab-brick-actions);
	}
	.socket--safety {
		--socket-colour: var(--cab-brick-safety);
	}

	@media (prefers-reduced-motion: reduce) {
		.socket {
			transition: none;
		}
	}
</style>
