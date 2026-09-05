<script lang="ts">
	import type { BrickKindDefinition, ControlSource } from '@craftabot/core';
	import Dial from '$lib/components/kit/Dial.svelte';
	import Rocker from '$lib/components/kit/Rocker.svelte';
	import { toggle, type BrickPanelProps } from './panel-props.js';
	import {
		bandLabel,
		describeFields,
		type FieldControl,
		type FieldDescriptor
	} from './schema-fields.js';

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

	let {
		kind,
		config,
		cartridges,
		tools,
		senseChannels,
		worldActions,
		policyCards,
		guardrailServices,
		serviceLines,
		onupdate
	}: Props = $props();

	const fields = $derived(describeFields(kind.configSchema, kind.controlHints));

	/** The catalogue a `checklist` field draws on, resolved by the bench. */
	function catalogue(source: ControlSource): { id: string; name: string; description?: string }[] {
		if (source === 'tools') return tools;
		if (source === 'actions') return worldActions;
		if (source === 'senseChannels') return senseChannels;
		if (source === 'policyCards') {
			return policyCards.map((card) => ({
				id: card.id,
				name: card.title,
				...(card.description !== undefined ? { description: card.description } : {})
			}));
		}
		if (source === 'guardrailServices') {
			return guardrailServices.map((service) => ({
				id: service.id,
				name: service.name,
				description: service.description
			}));
		}
		if (source === 'serviceLines') {
			return serviceLines.map((line) => ({
				id: line.id,
				name: line.name,
				description: line.description
			}));
		}
		return cartridges.map((cartridge) => ({
			id: cartridge.id,
			name: cartridge.displayName,
			description: cartridge.blurb
		}));
	}

	/** A `choice`'s options: the kind's own, or a catalogue's entries as value/label pairs. */
	function choicesOf(control: Extract<FieldControl, { kind: 'choice' }>) {
		if (control.options) return control.options;
		return [
			{ value: '', label: '— choose —' },
			...catalogue(control.source ?? 'tools').map((entry) => ({
				value: entry.id,
				label: entry.name
			}))
		];
	}

	const listIn = (value: unknown): string[] => (value as string[] | undefined) ?? [];
	const numberIn = (value: unknown): number => Number(value ?? 0);
	const objectIn = (value: unknown): Record<string, unknown> =>
		(value as Record<string, unknown> | undefined) ?? {};
</script>

{#snippet control(
	field: FieldDescriptor,
	value: unknown,
	set: (next: unknown) => void,
	path: string
)}
	{#if field.control.kind === 'switch'}
		<Rocker
			label={field.label}
			hint={field.hint}
			checked={value === true}
			onchange={(on) => set(on)}
		/>
	{:else if field.control.kind === 'dial'}
		<Dial
			label={field.label}
			value={numberIn(value)}
			min={field.control.min}
			max={field.control.max}
			step={field.control.step}
			readout={bandLabel(numberIn(value), field.control.bands)}
			onchange={(next) => set(next)}
		/>
	{:else if field.control.kind === 'number'}
		<label class="field">
			<span>{field.label}</span>
			<input
				type="number"
				min={field.control.min}
				max={field.control.max}
				step={field.control.step}
				value={numberIn(value)}
				onchange={(event) => set(Number(event.currentTarget.value))}
			/>
		</label>
	{:else if field.control.kind === 'choice'}
		{@const options = choicesOf(field.control)}
		<label class="field">
			<span>{field.label}</span>
			<select
				value={String(value ?? '')}
				data-testid="choice-{path}"
				onchange={(event) => {
					// The select's value is a string; the schema wants whatever the
					// literal actually was, so it is matched back rather than cast.
					const match = options.find(
						(option) => String(option.value) === event.currentTarget.value
					);
					if (match) set(match.value);
				}}
			>
				{#each options as option (String(option.value))}
					<option value={String(option.value)}>{option.label}</option>
				{/each}
			</select>
		</label>
	{:else if field.control.kind === 'checklist'}
		{@const entries = field.control.entries ?? catalogue(field.control.source ?? 'tools')}
		<div class="switches">
			<p class="switches-label">{field.label}</p>
			{#each entries as entry (entry.id)}
				<Rocker
					label={entry.name}
					hint={entry.description}
					checked={listIn(value).includes(entry.id)}
					onchange={(on) => set(toggle(listIn(value), entry.id, on))}
				/>
			{/each}
		</div>
	{:else if field.control.kind === 'idList'}
		<label class="field">
			<span>{field.label}</span>
			<input
				type="text"
				value={listIn(value).join(', ')}
				placeholder="Separate with commas"
				onchange={(event) =>
					set(
						event.currentTarget.value
							.split(',')
							.map((entry) => entry.trim())
							.filter((entry) => entry !== '')
					)}
			/>
		</label>
	{:else if field.control.kind === 'object'}
		<!-- A nested block (WP39 stage E): its fields, patched back as one value. -->
		<fieldset class="nested" data-testid="fields-{path}">
			<legend>{field.label}</legend>
			{#each field.control.fields as inner (inner.name)}
				{@render control(
					inner,
					objectIn(value)[inner.name],
					(next) => set({ ...objectIn(value), [inner.name]: next }),
					`${path}.${inner.name}`
				)}
			{/each}
		</fieldset>
	{:else}
		<label class="field">
			<span>{field.label}</span>
			<input
				type="text"
				value={String(value ?? '')}
				oninput={(event) => set(event.currentTarget.value)}
			/>
		</label>
	{/if}
{/snippet}

{#each fields as field (field.name)}
	{@render control(
		field,
		config[field.name],
		(next) => onupdate({ [field.name]: next }),
		field.name
	)}
{/each}
