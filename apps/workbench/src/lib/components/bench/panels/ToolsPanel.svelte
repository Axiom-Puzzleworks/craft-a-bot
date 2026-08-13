<script lang="ts">
	import { memorySlotSchema, slotConfig } from '@craftabot/core';
	import Rocker from '$lib/components/kit/Rocker.svelte';
	import { createRegistry } from '$lib/packs.js';
	import { toggle, type BrickPanelProps } from './panel-props.js';

	/**
	 * The Tool Belt brick's panel.
	 *
	 * **The reason per-kind overrides exist.** A tool that writes in a notebook,
	 * on a bot whose Memory brick has no notebook switched on, swaps its
	 * description for a warning — a control whose text depends on *another
	 * socket*. `ControlHints` cannot say that and deliberately does not try
	 * (`14-…` §2.1); a `checklist` hint with `source: 'tools'` would render the
	 * switches and lose the warning.
	 *
	 * The notebook is read through core's memory *slot contract*, not by brick
	 * name, so any memory brick that answers the contract answers this too.
	 */
	let { config, spec, tools, onupdate }: BrickPanelProps = $props();

	const registry = createRegistry();
	const enabled = $derived((config.enabled as string[] | undefined) ?? []);
	const hasNotebook = $derived(
		slotConfig(spec, registry, 'memory', memorySlotSchema)?.notebook === true
	);
</script>

<div class="switches">
	{#each tools as tool (tool.id)}
		<Rocker
			label={tool.name}
			hint={tool.requiresNotebook && !hasNotebook
				? 'Needs the Memory brick’s notebook switched on.'
				: tool.description}
			checked={enabled.includes(tool.id)}
			onchange={(on) => onupdate({ enabled: toggle(enabled, tool.id, on) })}
		/>
	{/each}
</div>
