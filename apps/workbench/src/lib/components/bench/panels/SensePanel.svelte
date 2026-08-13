<script lang="ts">
	import Rocker from '$lib/components/kit/Rocker.svelte';
	import { toggle, type BrickPanelProps } from './panel-props.js';

	/**
	 * The Eyes & Ears brick's panel.
	 *
	 * Nothing here that a `checklist` hint with `source: 'senseChannels'` could
	 * not do — it is an override only because it was one already, and slice 4a
	 * moves the six panels without redesigning them. A pack shipping a Radar
	 * brick gets this shape from hints alone.
	 */
	let { config, senseChannels, onupdate }: BrickPanelProps = $props();

	const channels = $derived((config.channels as string[] | undefined) ?? []);
</script>

<div class="switches">
	{#each senseChannels as channel (channel.id)}
		<Rocker
			label={channel.name}
			hint={channel.description}
			checked={channels.includes(channel.id)}
			onchange={(on) => onupdate({ channels: toggle(channels, channel.id, on) })}
		/>
	{/each}
</div>
