<script lang="ts">
	import { STATUS, type Status } from '$lib/control-room/dataviz.js';

	/**
	 * **Lamp** (WP57, `44-CONTROL-ROOM.md` §4.4): a pass / fail / inconclusive
	 * / live indicator — a disc in the status token, the status glyph on the
	 * disc, and a word beside it. Never the disc alone (`04-…` §7).
	 */
	interface Props {
		status: Status;
		/** Defaults to the status's own word. */
		label?: string | undefined;
		testId?: string | undefined;
	}

	let { status, label, testId }: Props = $props();
	const mark = $derived(STATUS[status]);
</script>

<span class="lamp" data-status={status} data-testid={testId}>
	<i aria-hidden="true" style="--lamp: {mark.token}">{mark.glyph}</i>
	<span>{label ?? mark.label}</span>
</span>

<style>
	.lamp {
		display: inline-flex;
		align-items: center;
		gap: var(--cab-space-1);
		padding: 2px var(--cab-space-2) 2px var(--cab-space-1);
		font-size: var(--cab-text-xs);
		font-weight: 700;
		border: 1.5px solid var(--cab-ink);
		border-radius: var(--cab-radius-pill);
		background: var(--cab-graph);
		color: var(--cab-ink);
	}

	i {
		display: inline-grid;
		place-items: center;
		width: 1.25rem;
		height: 1.25rem;
		border-radius: 50%;
		background: var(--lamp);
		color: var(--cab-cream);
		font-style: normal;
		font-size: var(--cab-text-xs);
	}

	.lamp[data-status='live'] i {
		animation: pulse 1.2s infinite;
	}

	@keyframes pulse {
		50% {
			opacity: 0.5;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.lamp[data-status='live'] i {
			animation: none;
		}
	}
</style>
