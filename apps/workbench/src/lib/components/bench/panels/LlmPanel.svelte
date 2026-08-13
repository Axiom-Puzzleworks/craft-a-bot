<script lang="ts">
	import Dial from '$lib/components/kit/Dial.svelte';
	import type { BrickPanelProps } from './panel-props.js';

	/**
	 * The Brain brick's panel (03-UI-UX-DESIGN.md §4.3).
	 *
	 * A per-kind override rather than schema-driven controls, for one reason
	 * worth naming: "Imagination" with a word under it beats "temperature: 0.7",
	 * and the cartridge picker is a *chooser of physical objects* rather than a
	 * string field. `ControlHints` could express both; this panel predates them
	 * and is what the teaching aid is judged on, so it stays hand-written until
	 * WP16 has finished with it.
	 */
	let { config, cartridges, onupdate }: BrickPanelProps = $props();

	const cartridgeId = $derived(String(config.cartridgeId ?? ''));
	const temperature = $derived(Number(config.temperature ?? 0));
	const maxTokens = $derived(Number(config.maxTokens ?? 0));
	const personality = $derived(String(config.personality ?? ''));

	function temperatureReadout(value: number): string {
		if (value <= 0.3) return `${value.toFixed(1)} — careful`;
		if (value <= 1.1) return `${value.toFixed(1)} — balanced`;
		return `${value.toFixed(1)} — wild`;
	}
</script>

<label class="field">
	<span>Model cartridge</span>
	<select
		data-testid="cartridge-select"
		value={cartridgeId}
		onchange={(event) => onupdate({ cartridgeId: event.currentTarget.value })}
	>
		<option value="">— empty slot —</option>
		{#each cartridges as cartridge (cartridge.id)}
			<option value={cartridge.id}>{cartridge.displayName}</option>
		{/each}
	</select>
</label>

<Dial
	label="Imagination"
	value={temperature}
	min={0}
	max={2}
	step={0.1}
	readout={temperatureReadout(temperature)}
	onchange={(value) => onupdate({ temperature: value })}
/>

<label class="field">
	<span>Chattiness (max tokens per thought)</span>
	<input
		type="number"
		min="16"
		max="4096"
		step="16"
		data-testid="max-tokens"
		value={maxTokens}
		onchange={(event) => onupdate({ maxTokens: Number(event.currentTarget.value) })}
	/>
</label>

<label class="field">
	<span>Personality</span>
	<textarea
		rows="2"
		data-testid="personality"
		placeholder="You are a cheerful little robot."
		value={personality}
		oninput={(event) => onupdate({ personality: event.currentTarget.value })}></textarea>
</label>
