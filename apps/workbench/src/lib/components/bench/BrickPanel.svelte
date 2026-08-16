<script lang="ts">
	import {
		migrateBrickConfig,
		type AgentSpecV2,
		type BrickKindDefinition,
		type CartridgeDefinition,
		type FittedBrick,
		type PolicyCard,
		type ToolDefinition,
		type WorldActionDefinition
	} from '@craftabot/core';
	import Panel from '$lib/components/kit/Panel.svelte';
	import SchemaPanel from './panels/SchemaPanel.svelte';
	import { panelOverrideFor } from './panels/overrides.js';

	/**
	 * The brick panel (03-UI-UX-DESIGN.md §4.3): the brick enlarged, with
	 * physical controls, and a flip button to the real-terminology side.
	 *
	 * The flip side is the project's central promise made concrete — nothing is
	 * hidden, and the adult explanation is always one click away without ever
	 * being forced on anyone (00 §3.3, 03 §1.4).
	 *
	 * > **Amended 2026-08-13 (WP14 slice 4a):** this was a six-branch `if/else`
	 * > over V1's brick names, reading `spec.bricks.llm` and friends — the last
	 * > large piece of `12-…` D11, and the one a user could actually see: a
	 * > seventh brick could be built, fitted, validated and run, and then open a
	 * > blank panel.
	 * >
	 * > It is now a dispatcher. It takes *a fitted brick and its kind*, asks the
	 * > override table whether the workbench has a hand-written panel for that
	 * > kind, and otherwise renders the kind's own schema. It knows nothing about
	 * > any particular brick, including the six — their panels are content, in
	 * > `panels/`, and the table that names them is a preference rather than a
	 * > precondition (see `panels/overrides.ts`).
	 */
	interface Props {
		/** The brick in the selected socket, as stored. */
		brick: FittedBrick;
		/** Its kind, from the registry — the source of both faces and the schema. */
		kind: BrickKindDefinition;
		/** The whole bot, for the one panel that must read another socket. */
		spec: AgentSpecV2;
		cartridges: CartridgeDefinition[];
		tools: ToolDefinition[];
		senseChannels: { id: string; name: string; description: string }[];
		/** Named `worldActions` because `actions` is the snippet slot `Panel` expects. */
		worldActions: WorldActionDefinition[];
		/** Every policy card an installed pack ships (`14-…` §4.6, WP22). */
		policyCards: PolicyCard[];
		/** A patch merged into this brick's config. */
		onupdate: (patch: Record<string, unknown>) => void;
		onremove: () => void;
	}

	let {
		brick,
		kind,
		spec,
		cartridges,
		tools,
		senseChannels,
		worldActions,
		policyCards,
		onupdate,
		onremove
	}: Props = $props();

	let flipped = $state(false);

	const Override = $derived(panelOverrideFor(kind.id));
	/**
	 * Migrated before display (WP24), not just before save: a bot fitted before
	 * this brick's config last changed shape should show today's controls the
	 * moment its panel opens, not only after the first edit writes them back.
	 */
	const displayConfig = $derived(migrateBrickConfig(brick.config, brick.configVersion, kind));
	const panelProps = $derived({
		config: displayConfig,
		spec,
		cartridges,
		tools,
		senseChannels,
		worldActions,
		policyCards,
		onupdate
	});

	/*
	 * The socket's colour, not the kind's. Colour means a *concept* in this
	 * product and the mapping is fixed (`04-…` §2.2), so a Monitor brick in the
	 * safety socket is safety yellow — it is governance, whoever made it.
	 */
	const accent = $derived(`var(--cab-brick-slot-${brick.slot})`);
</script>

<Panel title={flipped ? kind.realName : kind.name} {accent}>
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
		<button type="button" class="tab" data-testid="remove-brick" onclick={() => onremove()}>
			Take off
		</button>
	{/snippet}

	{#if flipped}
		<div class="flip" data-testid="brick-flip-side">
			<p class="real-name">{kind.realName}</p>
			<p>{kind.realExplanation}</p>
		</div>
	{:else}
		<div class="controls" data-testid="brick-controls-{brick.slot}" data-tutorial="brick-panel">
			<p class="whisper">{kind.description}</p>

			{#if Override}
				<Override {...panelProps} />
			{:else}
				<SchemaPanel {kind} {...panelProps} />
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

	/*
	 * The controls themselves are rendered by a child component — an override or
	 * `SchemaPanel` — so these reach through `:global`. Scoped to `.controls`,
	 * which only ever contains one panel body, so the reach is as short as the
	 * arrangement allows.
	 */
	:global(.controls .field) {
		display: grid;
		gap: var(--cab-space-1);
		font-size: var(--cab-text-sm);
		border: none;
		padding: 0;
		margin: 0;
	}

	:global(.controls legend) {
		padding: 0;
		font-size: var(--cab-text-sm);
		font-weight: 600;
	}

	:global(.controls .radio) {
		display: flex;
		align-items: center;
		gap: var(--cab-space-2);
		font-weight: 400;
	}

	:global(.controls select),
	:global(.controls input[type='number']),
	:global(.controls input[type='text']),
	:global(.controls textarea) {
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

	:global(.controls .switches) {
		display: grid;
		gap: var(--cab-space-2);
	}

	:global(.controls .switches-label) {
		margin: 0;
		font-size: var(--cab-text-sm);
		font-weight: 600;
	}
</style>
