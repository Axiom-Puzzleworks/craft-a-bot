<script lang="ts">
	/**
	 * The live region behind every drag, drop, and tick announcement
	 * (03-UI-UX-DESIGN.md §8). One per screen: several live regions competing is
	 * worse than none, because screen readers interleave them unpredictably.
	 */
	interface Props {
		message: string;
	}

	let { message }: Props = $props();
</script>

<p class="announcer" role="status" aria-live="polite" data-testid="announcer">{message}</p>

<style>
	/*
	 * Visually hidden but still announced. `display: none` and
	 * `visibility: hidden` both remove it from the accessibility tree, which
	 * would silence it entirely.
	 */
	.announcer {
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
