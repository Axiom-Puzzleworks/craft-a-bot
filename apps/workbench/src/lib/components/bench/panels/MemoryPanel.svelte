<script lang="ts">
	import Rocker from '$lib/components/kit/Rocker.svelte';
	import type { BrickPanelProps } from './panel-props.js';

	/**
	 * The Scrapbook brick's panel.
	 *
	 * The window sizes are the only place in the six where `ControlHints` would
	 * do the whole job on its own: the schema already enumerates 3, 10 and 30,
	 * and the animals are exactly what `options` is for. Kept as an override
	 * because the radio group is the shape 03 §4.3 asks for and a `choice` hint
	 * renders a select.
	 */
	let { config, onupdate }: BrickPanelProps = $props();

	const windowSize = $derived(Number(config.windowSize ?? 0));
	const notebook = $derived(config.notebook === true);

	const MEMORY_SPANS = [
		{ value: 3, label: 'Goldfish (3 turns)' },
		{ value: 10, label: 'Puppy (10 turns)' },
		{ value: 30, label: 'Elephant (30 turns)' }
	] as const;
</script>

<fieldset class="field">
	<legend>Memory span</legend>
	{#each MEMORY_SPANS as span (span.value)}
		<label class="radio">
			<input
				type="radio"
				name="memory-span"
				value={span.value}
				checked={windowSize === span.value}
				onchange={() => onupdate({ windowSize: span.value })}
			/>
			{span.label}
		</label>
	{/each}
</fieldset>

<Rocker
	label="Notebook"
	hint="Lets the bot jot things down and read them back later."
	checked={notebook}
	onchange={(value) => onupdate({ notebook: value })}
/>
