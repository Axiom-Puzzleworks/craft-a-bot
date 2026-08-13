<script lang="ts">
	import type { BrickKindDefinition, ControlSource } from '@craftabot/core';
	import Dial from '$lib/components/kit/Dial.svelte';
	import Rocker from '$lib/components/kit/Rocker.svelte';
	import { toggle, type BrickPanelProps } from './panel-props.js';
	import { bandLabel, describeFields, type FieldDescriptor } from './schema-fields.js';

	/**
	 * **The panel a brick gets when the workbench has never heard of it**
	 * (WP14 slice 4a).
	 *
	 * This is the whole point of the open contract made visible: a Monitor brick
	 * from an expansion pack is snapped onto the baseplate and opens a working
	 * panel, with rockers over the world's actions and a dial that reads
	 * "hair-trigger", without a line of workbench code being written for it.
	 *
	 * Deliberately built from the same kit widgets as the six hand-written
	 * panels, not from bare form controls. A brick that renders as a settings
	 * dialogue in a box of moulded plastic teaches the wrong thing about what it
	 * is — and the widgets are `Dial` and `Rocker` precisely so that "looks like
	 * the toy" is not extra work.
	 */
	interface Props extends BrickPanelProps {
		kind: BrickKindDefinition;
	}

	let { kind, config, cartridges, tools, senseChannels, worldActions, onupdate }: Props = $props();

	const fields = $derived(describeFields(kind.configSchema, kind.controlHints));

	/** The catalogue a `checklist` field draws on, resolved by the bench. */
	function catalogue(source: ControlSource): { id: string; name: string; description?: string }[] {
		if (source === 'tools') return tools;
		if (source === 'actions') return worldActions;
		if (source === 'senseChannels') return senseChannels;
		return cartridges.map((cartridge) => ({
			id: cartridge.id,
			name: cartridge.displayName,
			description: cartridge.blurb
		}));
	}

	const listOf = (field: FieldDescriptor): string[] =>
		(config[field.name] as string[] | undefined) ?? [];
	const numberOf = (field: FieldDescriptor): number => Number(config[field.name] ?? 0);
</script>

{#each fields as field (field.name)}
	{#if field.control.kind === 'switch'}
		<Rocker
			label={field.label}
			hint={field.hint}
			checked={config[field.name] === true}
			onchange={(on) => onupdate({ [field.name]: on })}
		/>
	{:else if field.control.kind === 'dial'}
		<Dial
			label={field.label}
			value={numberOf(field)}
			min={field.control.min}
			max={field.control.max}
			step={field.control.step}
			readout={bandLabel(numberOf(field), field.control.bands)}
			onchange={(value) => onupdate({ [field.name]: value })}
		/>
	{:else if field.control.kind === 'number'}
		<label class="field">
			<span>{field.label}</span>
			<input
				type="number"
				min={field.control.min}
				max={field.control.max}
				step={field.control.step}
				value={numberOf(field)}
				onchange={(event) => onupdate({ [field.name]: Number(event.currentTarget.value) })}
			/>
		</label>
	{:else if field.control.kind === 'choice'}
		<label class="field">
			<span>{field.label}</span>
			<select
				value={String(config[field.name] ?? '')}
				onchange={(event) => {
					// The select's value is a string; the schema wants whatever the
					// literal actually was, so it is matched back rather than cast.
					const chosen = field.control.kind === 'choice' ? field.control.options : [];
					const match = chosen.find((option) => String(option.value) === event.currentTarget.value);
					if (match) onupdate({ [field.name]: match.value });
				}}
			>
				{#each field.control.options as option (String(option.value))}
					<option value={String(option.value)}>{option.label}</option>
				{/each}
			</select>
		</label>
	{:else if field.control.kind === 'checklist'}
		<div class="switches">
			<p class="switches-label">{field.label}</p>
			{#each catalogue(field.control.source) as entry (entry.id)}
				<Rocker
					label={entry.name}
					hint={entry.description}
					checked={listOf(field).includes(entry.id)}
					onchange={(on) => onupdate({ [field.name]: toggle(listOf(field), entry.id, on) })}
				/>
			{/each}
		</div>
	{:else if field.control.kind === 'idList'}
		<label class="field">
			<span>{field.label}</span>
			<input
				type="text"
				value={listOf(field).join(', ')}
				placeholder="Separate with commas"
				onchange={(event) =>
					onupdate({
						[field.name]: event.currentTarget.value
							.split(',')
							.map((entry) => entry.trim())
							.filter((entry) => entry !== '')
					})}
			/>
		</label>
	{:else}
		<label class="field">
			<span>{field.label}</span>
			<input
				type="text"
				value={String(config[field.name] ?? '')}
				oninput={(event) => onupdate({ [field.name]: event.currentTarget.value })}
			/>
		</label>
	{/if}
{/each}
