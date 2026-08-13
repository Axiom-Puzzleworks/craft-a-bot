<script lang="ts">
	import Rocker from '$lib/components/kit/Rocker.svelte';
	import { toggle, type BrickPanelProps } from './panel-props.js';

	/**
	 * The Hands & Wheels brick's panel — the same shape as the visor's, over the
	 * actions of the world this bot's goal card names.
	 */
	let { config, worldActions, onupdate }: BrickPanelProps = $props();

	const enabled = $derived((config.enabled as string[] | undefined) ?? []);
</script>

<div class="switches">
	{#each worldActions as action (action.id)}
		<Rocker
			label={action.name}
			hint={action.description}
			checked={enabled.includes(action.id)}
			onchange={(on) => onupdate({ enabled: toggle(enabled, action.id, on) })}
		/>
	{/each}
</div>
