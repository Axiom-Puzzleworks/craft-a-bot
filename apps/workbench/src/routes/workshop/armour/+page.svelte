<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	/**
	 * The Armour Studio (WP35 stage B) grew into the Guard Rack (WP42,
	 * `30-SECOND-VENDORS.md` §5): every service, not one vendor. This route
	 * stays so an old link lands somewhere, and sends it there.
	 */
	onMount(() => {
		void goto(resolve('/workshop/guards'), { replaceState: true });
	});
</script>

<p data-testid="armour-redirect">The Armour Studio is now the Guard Rack — taking you there.</p>
