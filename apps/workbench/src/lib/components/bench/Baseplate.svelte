<script lang="ts">
	import type { SlotId } from '@craftabot/core';
	import { SLOT_ORDER, SOCKET_LABELS, SOCKET_PLACEMENT } from '$lib/bricks.js';
	import type { DndController } from '$lib/dnd/dnd-state.svelte.js';
	import { draggable } from '$lib/dnd/draggable.svelte.js';
	import { dropzone } from '$lib/dnd/dropzone.svelte.js';
	import BrickShape from '$lib/components/kit/BrickShape.svelte';
	import SocketShape from '$lib/components/kit/SocketShape.svelte';

	/**
	 * The baseplate (03-UI-UX-DESIGN.md §4.2): the bot chassis with shaped
	 * sockets, so a piece only fits where it belongs. The bricks visually become
	 * body parts — head, backpack, belt, visor, wheels, chest.
	 *
	 * > **Amended 2026-08-13 (WP14 slice 4b):** the sockets are the **six slot
	 * > families** core owns (`14-…` §2.3), not six named bricks. The chassis was
	 * > always the fixed part of this — what changed is that it no longer implies
	 * > there is exactly one brick that can go in each hole.
	 */
	interface Props {
		controller: DndController;
		/** What is in a socket right now, if anything. */
		fittedIn: (slot: SlotId) => { kindId: string; name: string } | undefined;
		selected: SlotId | undefined;
		onselect: (slot: SlotId) => void;
		onremove: (slot: SlotId) => void;
	}

	let { controller, fittedIn, selected, onselect, onremove }: Props = $props();

	function socketState(slot: SlotId): 'empty' | 'candidate' | 'rejecting' | 'occupied' {
		if (controller.candidate === slot) return 'candidate';
		if (controller.rejecting === slot) return 'rejecting';
		if (fittedIn(slot)) return 'occupied';
		return 'empty';
	}

	function onKeyDown(event: KeyboardEvent, slot: SlotId): void {
		// Mid-carry the page handler owns the keyboard — see PartsTray for why.
		if (controller.carrying) return;

		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			event.stopPropagation();
			if (fittedIn(slot)) onselect(slot);
			return;
		}
		if ((event.key === 'Delete' || event.key === 'Backspace') && fittedIn(slot)) {
			event.preventDefault();
			onremove(slot);
		}
	}
</script>

<div class="baseplate" data-testid="baseplate" data-tutorial="baseplate">
	<p class="chassis-label" aria-hidden="true">Baseplate</p>

	{#each SLOT_ORDER as slot (slot)}
		{@const occupant = fittedIn(slot)}
		{@const state = socketState(slot)}
		<div
			class="socket socket--{SOCKET_PLACEMENT[slot]}"
			data-testid="socket-{slot}"
			data-state={state}
			data-fitted={occupant !== undefined}
			{@attach dropzone(slot, controller)}
		>
			<SocketShape {slot} {state} />
			<button
				type="button"
				class="slot"
				class:slot--selected={selected === slot}
				aria-label="{SOCKET_LABELS[slot]} socket. {occupant
					? `${occupant.name} fitted. Press Enter to open its panel, Delete to take it off.`
					: 'Empty.'}"
				aria-pressed={occupant !== undefined}
				onclick={() => (occupant ? onselect(slot) : undefined)}
				onkeydown={(event) => onKeyDown(event, slot)}
				{@attach draggable({
					brick: { kindId: occupant?.kindId ?? '', slot, name: occupant?.name ?? '' },
					origin: 'socket',
					controller,
					disabled: () => fittedIn(slot) === undefined
				})}
			>
				{#if occupant}
					<BrickShape kindId={occupant.kindId} {slot} fitted />
					<span class="fitted-name">{occupant.name}</span>
				{:else}
					<span class="socket-name">{SOCKET_LABELS[slot]}</span>
				{/if}
			</button>
		</div>
	{/each}
</div>

<style>
	.baseplate {
		position: relative;
		display: grid;
		grid-template-areas:
			'.        head     .'
			'.        visor    .'
			'backpack chest    belt'
			'.        wheels   .';
		grid-template-columns: 1fr 1.4fr 1fr;
		gap: var(--cab-space-3);
		padding: var(--cab-space-5) var(--cab-space-4) var(--cab-space-4);
		background: var(--cab-cream);
		border: var(--cab-border-panel) dashed color-mix(in srgb, var(--cab-blue) 45%, transparent);
		border-radius: var(--cab-radius-panel);
		min-height: calc(var(--cab-u) * 16);
	}

	.chassis-label {
		position: absolute;
		top: var(--cab-space-2);
		left: 50%;
		transform: translateX(-50%);
		margin: 0;
		font-size: var(--cab-text-xs);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		opacity: 0.5;
	}

	.socket {
		position: relative;
		min-height: calc(var(--cab-u) * 2.5);
	}

	.socket--head {
		grid-area: head;
	}
	.socket--visor {
		grid-area: visor;
	}
	.socket--backpack {
		grid-area: backpack;
	}
	.socket--chest {
		grid-area: chest;
	}
	.socket--belt {
		grid-area: belt;
	}
	.socket--wheels {
		grid-area: wheels;
	}

	.slot {
		position: relative;
		display: grid;
		place-items: center;
		gap: 2px;
		width: 100%;
		height: 100%;
		min-height: calc(var(--cab-u) * 2.5);
		padding: var(--cab-space-2);
		background: none;
		border: none;
		border-radius: var(--cab-radius-part);
		font: inherit;
		color: inherit;
		cursor: pointer;
		touch-action: none;
	}

	.slot:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	.slot--selected {
		box-shadow: 0 0 0 3px var(--cab-yellow);
	}

	.socket-name {
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		opacity: 0.55;
	}

	.fitted-name {
		font-size: var(--cab-text-xs);
		font-weight: 700;
	}
</style>
