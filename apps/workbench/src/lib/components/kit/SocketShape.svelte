<script lang="ts">
	import type { SlotId } from '@craftabot/core';

	/**
	 * The socket negative: a recessed silhouette of the part that belongs here
	 * (11 §H, `bricks/socket-set`). This is the classic construction-toy
	 * affordance — the hole is shaped like the piece, so the piece only fits
	 * where it belongs, and an empty socket already tells you what is missing.
	 */
	interface Props {
		/** Which socket this is — the hole belongs to the chassis, not to a brick. */
		slot: SlotId;
		state?: 'empty' | 'candidate' | 'rejecting' | 'occupied';
	}

	let { slot, state = 'empty' }: Props = $props();
</script>

<span class="socket socket--{slot} socket--{state}" aria-hidden="true"></span>

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

	.socket--brain {
		--socket-colour: var(--cab-brick-slot-brain);
	}
	.socket--memory {
		--socket-colour: var(--cab-brick-slot-memory);
	}
	.socket--equipment {
		--socket-colour: var(--cab-brick-slot-equipment);
	}
	.socket--perception {
		--socket-colour: var(--cab-brick-slot-perception);
	}
	.socket--mobility {
		--socket-colour: var(--cab-brick-slot-mobility);
	}
	.socket--safety {
		--socket-colour: var(--cab-brick-slot-safety);
	}

	@media (prefers-reduced-motion: reduce) {
		.socket {
			transition: none;
		}
	}
</style>
