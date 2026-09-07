<script lang="ts">
	import Art from '$lib/components/art/Art.svelte';
	import { INSTRUMENT_ICONS, type InstrumentId } from '$lib/assets/instruments.js';

	/**
	 * **Roundel** (WP73, `62-THE-TAIL.md` §4.1): one instrument icon from the
	 * wave 2 set, inlined. Decorative by contract — it sits beside a label
	 * that carries the meaning (`04-…` §7: never an icon alone), so it is
	 * hidden from a reader.
	 */
	interface Props {
		icon: InstrumentId;
		/** In px. Default 20 — a strip label's cap height and a bit. */
		size?: number | undefined;
	}

	let { icon, size = 20 }: Props = $props();
</script>

<span class="roundel" style:--roundel="{size}px" data-testid="roundel-{icon}" aria-hidden="true">
	<Art source={INSTRUMENT_ICONS[icon]} />
</span>

<style>
	.roundel {
		display: inline-grid;
		place-items: center;
		width: var(--roundel);
		height: var(--roundel);
		flex: none;
	}

	.roundel :global(svg) {
		width: 100%;
		height: 100%;
		display: block;
	}
</style>
