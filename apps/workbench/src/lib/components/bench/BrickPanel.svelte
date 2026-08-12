<script lang="ts">
	import type { AgentSpec, CartridgeDefinition, ToolDefinition } from '@craftabot/core';
	import { brickDefinition, type BrickKind } from '$lib/bricks.js';
	import Dial from '$lib/components/kit/Dial.svelte';
	import Panel from '$lib/components/kit/Panel.svelte';
	import Rocker from '$lib/components/kit/Rocker.svelte';

	/**
	 * The brick panel (03-UI-UX-DESIGN.md §4.3): the brick enlarged, with
	 * physical controls, and a flip button to the real-terminology side.
	 *
	 * The flip side is the project's central promise made concrete — nothing is
	 * hidden, and the adult explanation is always one click away without ever
	 * being forced on anyone (00 §3.3, 03 §1.4).
	 */
	interface Props {
		kind: BrickKind;
		spec: AgentSpec;
		cartridges: CartridgeDefinition[];
		tools: ToolDefinition[];
		senseChannels: { id: string; name: string; description: string }[];
		/** Named `worldActions` because `actions` is the snippet slot Panel expects. */
		worldActions: { id: string; name: string; description: string }[];
		onupdate: <K extends BrickKind>(
			kind: K,
			patch: Partial<NonNullable<AgentSpec['bricks'][K]>>
		) => void;
		onremove: (kind: BrickKind) => void;
	}

	let { kind, spec, cartridges, tools, senseChannels, worldActions, onupdate, onremove }: Props =
		$props();

	let flipped = $state(false);
	const brick = $derived(brickDefinition(kind));

	const llm = $derived(spec.bricks.llm);
	const memory = $derived(spec.bricks.memory);
	const toolsBrick = $derived(spec.bricks.tools);
	const sense = $derived(spec.bricks.sense);
	const actionsBrick = $derived(spec.bricks.actions);
	const safety = $derived(spec.bricks.safety);

	const MEMORY_SPANS = [
		{ value: 3, label: 'Goldfish (3 turns)' },
		{ value: 10, label: 'Puppy (10 turns)' },
		{ value: 30, label: 'Elephant (30 turns)' }
	] as const;

	function temperatureReadout(value: number): string {
		if (value <= 0.3) return `${value.toFixed(1)} — careful`;
		if (value <= 1.1) return `${value.toFixed(1)} — balanced`;
		return `${value.toFixed(1)} — wild`;
	}

	function toggle(list: string[], id: string, on: boolean): string[] {
		return on ? [...new Set([...list, id])] : list.filter((entry) => entry !== id);
	}

	const accent = $derived(`var(--cab-brick-${kind})`);
</script>

<Panel title={flipped ? brick.realName : brick.name} {accent}>
	{#snippet actions()}
		<button
			type="button"
			class="tab"
			data-testid="flip-brick-panel"
			aria-pressed={flipped}
			onclick={() => (flipped = !flipped)}
		>
			{flipped ? 'Toy side' : 'What this really is'}
		</button>
		<button type="button" class="tab" data-testid="remove-brick" onclick={() => onremove(kind)}>
			Take off
		</button>
	{/snippet}

	{#if flipped}
		<div class="flip" data-testid="brick-flip-side">
			<p class="real-name">{brick.realName}</p>
			<p>{brick.realExplanation}</p>
		</div>
	{:else}
		<div class="controls" data-testid="brick-controls-{kind}">
			<p class="whisper">{brick.description}</p>

			{#if kind === 'llm' && llm}
				<label class="field">
					<span>Model cartridge</span>
					<select
						data-testid="cartridge-select"
						value={llm.cartridgeId}
						onchange={(event) => onupdate('llm', { cartridgeId: event.currentTarget.value })}
					>
						<option value="">— empty slot —</option>
						{#each cartridges as cartridge (cartridge.id)}
							<option value={cartridge.id}>{cartridge.displayName}</option>
						{/each}
					</select>
				</label>

				<Dial
					label="Imagination"
					value={llm.temperature}
					min={0}
					max={2}
					step={0.1}
					readout={temperatureReadout(llm.temperature)}
					onchange={(temperature) => onupdate('llm', { temperature })}
				/>

				<label class="field">
					<span>Chattiness (max tokens per thought)</span>
					<input
						type="number"
						min="16"
						max="4096"
						step="16"
						data-testid="max-tokens"
						value={llm.maxTokens}
						onchange={(event) => onupdate('llm', { maxTokens: Number(event.currentTarget.value) })}
					/>
				</label>

				<label class="field">
					<span>Personality</span>
					<textarea
						rows="2"
						data-testid="personality"
						placeholder="You are a cheerful little robot."
						value={llm.personality}
						oninput={(event) => onupdate('llm', { personality: event.currentTarget.value })}
					></textarea>
				</label>
			{:else if kind === 'memory' && memory}
				<fieldset class="field">
					<legend>Memory span</legend>
					{#each MEMORY_SPANS as span (span.value)}
						<label class="radio">
							<input
								type="radio"
								name="memory-span"
								value={span.value}
								checked={memory.windowSize === span.value}
								onchange={() => onupdate('memory', { windowSize: span.value })}
							/>
							{span.label}
						</label>
					{/each}
				</fieldset>
				<Rocker
					label="Notebook"
					hint="Lets the bot jot things down and read them back later."
					checked={memory.notebook}
					onchange={(notebook) => onupdate('memory', { notebook })}
				/>
			{:else if kind === 'tools' && toolsBrick}
				<div class="switches">
					{#each tools as tool (tool.id)}
						<Rocker
							label={tool.name}
							hint={tool.requiresNotebook && memory?.notebook !== true
								? 'Needs the Memory brick’s notebook switched on.'
								: tool.description}
							checked={toolsBrick.enabled.includes(tool.id)}
							onchange={(on) =>
								onupdate('tools', { enabled: toggle(toolsBrick.enabled, tool.id, on) })}
						/>
					{/each}
				</div>
			{:else if kind === 'sense' && sense}
				<div class="switches">
					{#each senseChannels as channel (channel.id)}
						<Rocker
							label={channel.name}
							hint={channel.description}
							checked={sense.channels.includes(channel.id)}
							onchange={(on) =>
								onupdate('sense', { channels: toggle(sense.channels, channel.id, on) })}
						/>
					{/each}
				</div>
			{:else if kind === 'actions' && actionsBrick}
				<div class="switches">
					{#each worldActions as action (action.id)}
						<Rocker
							label={action.name}
							hint={action.description}
							checked={actionsBrick.enabled.includes(action.id)}
							onchange={(on) =>
								onupdate('actions', { enabled: toggle(actionsBrick.enabled, action.id, on) })}
						/>
					{/each}
				</div>
			{:else if kind === 'safety' && safety}
				<label class="field">
					<span>Step budget: {safety.maxTicks} turns</span>
					<input
						type="range"
						min="5"
						max="50"
						step="1"
						data-testid="max-ticks"
						value={safety.maxTicks}
						oninput={(event) => onupdate('safety', { maxTicks: Number(event.currentTarget.value) })}
					/>
				</label>
				<Rocker
					label="Ask before acting"
					hint="Pauses for your approval before every action."
					checked={safety.approvalMode}
					onchange={(approvalMode) => onupdate('safety', { approvalMode })}
				/>
				<div class="switches">
					<p class="switches-label">Blocked actions</p>
					{#each worldActions as action (action.id)}
						<Rocker
							label={action.name}
							checked={safety.blockedActions.includes(action.id)}
							onchange={(on) =>
								onupdate('safety', {
									blockedActions: toggle(safety.blockedActions, action.id, on)
								})}
						/>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</Panel>

<style>
	.tab {
		padding: 2px var(--cab-space-2);
		font-size: var(--cab-text-xs);
		font-weight: 600;
		background: var(--cab-cream);
		color: var(--cab-ink);
		border: none;
		border-radius: var(--cab-radius-pill);
		cursor: pointer;
	}

	.tab:focus-visible {
		outline: 3px solid var(--cab-cream);
		outline-offset: var(--cab-focus-gap);
	}

	.controls,
	.flip {
		display: grid;
		gap: var(--cab-space-3);
	}

	.whisper {
		margin: 0;
		font-size: var(--cab-text-sm);
		opacity: 0.8;
	}

	.real-name {
		margin: 0;
		font-family: var(--cab-font-mono);
		font-size: var(--cab-text-sm);
		font-weight: 700;
	}

	.flip p {
		margin: 0;
		font-size: var(--cab-text-sm);
		line-height: 1.5;
	}

	.field {
		display: grid;
		gap: var(--cab-space-1);
		font-size: var(--cab-text-sm);
		border: none;
		padding: 0;
		margin: 0;
	}

	legend {
		padding: 0;
		font-size: var(--cab-text-sm);
		font-weight: 600;
	}

	.radio {
		display: flex;
		align-items: center;
		gap: var(--cab-space-2);
		font-weight: 400;
	}

	select,
	input[type='number'],
	textarea {
		font: inherit;
		font-size: var(--cab-text-sm);
		padding: var(--cab-space-1) var(--cab-space-2);
		border: var(--cab-border-part) solid color-mix(in srgb, var(--cab-ink) 30%, transparent);
		border-radius: 6px;
		background: var(--cab-paper);
	}

	:global(.controls :focus-visible) {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	.switches {
		display: grid;
		gap: var(--cab-space-2);
	}

	.switches-label {
		margin: 0;
		font-size: var(--cab-text-sm);
		font-weight: 600;
	}
</style>
