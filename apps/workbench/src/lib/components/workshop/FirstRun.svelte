<script lang="ts">
	import { resolve } from '$app/paths';
	import Strip from '$lib/components/control-room/Strip.svelte';
	import type { Lens } from '$lib/workshop/lens.js';

	/**
	 * **The guided path** (WP87, `78-LENSES.md` §4; GAP-2): three steps to a
	 * first reading under the current lens, as a Strip on the lens's entry
	 * page until the reader dismisses it — once per reader, remembered in
	 * Settings. Each step links where it points; the rail is not touched.
	 */
	interface Props {
		lens: Lens;
		onDismiss: () => void;
	}

	let { lens, onDismiss }: Props = $props();
</script>

<Strip label={`${lens.name}: ${lens.question}`} icon="lens" testId="first-run">
	<ol class="steps">
		{#each lens.firstRun as step, index (index)}
			<li>
				<span class="n">{index + 1}</span>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the lens's entries are typed routes of this app resolved here; the rule cannot see through the table. -->
				<a href={resolve(step.href as '/workshop')} data-testid="first-run-step-{index + 1}"
					>{step.text}</a
				>
			</li>
		{/each}
	</ol>
	{#snippet actions()}
		<button type="button" onclick={onDismiss} data-testid="first-run-dismiss">Got it</button>
	{/snippet}
</Strip>

<style>
	.steps {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-3);
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--cab-text-sm);
	}

	.steps li {
		display: flex;
		align-items: baseline;
		gap: var(--cab-space-2);
		max-width: 22rem;
	}

	.n {
		font-family: var(--cab-font-mono);
		font-weight: 700;
		color: var(--cab-engrave);
	}

	a {
		color: var(--cab-ink);
	}
</style>
