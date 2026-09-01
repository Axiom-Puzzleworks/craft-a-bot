<script lang="ts">
	import type { BrickKindDefinition, SlotId } from '@craftabot/core';
	import { SLOT_ORDER, SOCKET_LABELS } from '$lib/bricks.js';
	import { createRegistry } from '$lib/packs.js';
	import type { CarriedBrick, DndController } from '$lib/dnd/dnd-state.svelte.js';
	import { draggable } from '$lib/dnd/draggable.svelte.js';
	import { preferences } from '$lib/state/preferences.svelte.js';
	import BrickShape from '$lib/components/kit/BrickShape.svelte';

	/**
	 * The parts tray (03-UI-UX-DESIGN.md §4.1): a moulded tray with one well per
	 * brick. A fitted brick leaves an empty well with its silhouette still
	 * showing, so you can always see what came out of the box.
	 *
	 * > **Amended 2026-08-13 (WP14 slice 4b):** the wells come from the
	 * > **registry**, in socket order, rather than from a hard-coded list of six.
	 * > Install an expansion pack and its bricks are in the tray; that is the
	 * > whole of what "the box can hold a seventh brick" means to a builder.
	 * >
	 * > A well is disabled when its *socket* is occupied — by anything, not only
	 * > by itself. V1's one-brick-per-socket rule (`14-…` §2.3) means a Monitor
	 * > cannot go in while the Safety Brick is in, and the well says which brick
	 * > is in the way rather than simply refusing.
	 *
	 * > **Amended 2026-09-01 (WP35 stage C, `25-ARMOUR-BRICK.md` §4.8):** a kind
	 * > whose `audience` is `'workshop'` is offered only while the Workshop
	 * > door is open (`preferences.workshop`) — the same shared-bench gate
	 * > `15-…` §4 names, expressed for the first time in the other direction: a
	 * > kind the Workshop has and the Kit does not. A kit file already carrying
	 * > one still validates and runs anywhere; only the *offering* is gated.
	 */
	interface Props {
		controller: DndController;
		/** What is in a socket right now, if anything. */
		fittedIn: (slot: SlotId) => { kindId: string; name: string } | undefined;
		onselect: (slot: SlotId) => void;
	}

	let { controller, fittedIn, onselect }: Props = $props();

	const registry = createRegistry();

	/** Every installed kind, grouped the way the chassis is read: top to bottom — minus any Workshop-only kind while the door is shut. */
	const kinds = $derived(
		SLOT_ORDER.flatMap((slot) => registry.listBrickKinds(slot)).filter(
			(kind) => kind.audience !== 'workshop' || preferences.workshop
		)
	);

	const carried = (kind: BrickKindDefinition): CarriedBrick => ({
		kindId: kind.id,
		slot: kind.slot,
		name: kind.name
	});

	function onKeyDown(event: KeyboardEvent, kind: BrickKindDefinition): void {
		// Already carrying? Let the press bubble to the page handler, which aims
		// and places. Without this guard the tray would re-lift on every Enter and
		// the brick could never be put down.
		if (controller.carrying) return;
		if (fittedIn(kind.slot)) return;
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			// Stop the *same* press reaching the page handler, which would see a
			// carry in progress and place the brick instantly — lifting and
			// dropping in one keystroke.
			event.stopPropagation();
			controller.liftWithKeyboard(carried(kind), 'tray');
		}
	}

	/** Why a well is closed, in the builder's words. */
	function unavailable(kind: BrickKindDefinition, occupant: { kindId: string; name: string }) {
		return occupant.kindId === kind.id
			? 'Already fitted to your bot.'
			: `The ${occupant.name} is in the ${SOCKET_LABELS[kind.slot]} socket. Take it off first.`;
	}
</script>

<ul class="tray" data-testid="parts-tray">
	{#each kinds as kind (kind.id)}
		{@const occupant = fittedIn(kind.slot)}
		{@const isThisOne = occupant?.kindId === kind.id}
		<li class="well" class:well--empty={occupant !== undefined}>
			<button
				type="button"
				class="part"
				data-testid="tray-{kind.id}"
				data-tutorial="tray-{kind.id}"
				data-fitted={isThisOne}
				aria-label="{kind.name}. {occupant
					? unavailable(kind, occupant)
					: `${kind.description} Press Enter to pick it up.`}"
				disabled={occupant !== undefined}
				onclick={() => onselect(kind.slot)}
				onkeydown={(event) => onKeyDown(event, kind)}
				{@attach draggable({
					brick: carried(kind),
					origin: 'tray',
					controller,
					disabled: () => fittedIn(kind.slot) !== undefined
				})}
			>
				<span class="art"><BrickShape kindId={kind.id} slot={kind.slot} /></span>
				<span class="name">{kind.name}</span>
				<span class="whisper">
					{#if isThisOne}Fitted{:else if occupant}Socket taken{:else}{kind.description}{/if}
				</span>
			</button>
		</li>
	{/each}
</ul>

<style>
	.tray {
		list-style: none;
		margin: 0;
		padding: var(--cab-space-2);
		display: grid;
		gap: var(--cab-space-2);
		background: color-mix(in srgb, var(--cab-ink) 8%, var(--cab-paper));
		border-radius: var(--cab-radius-panel);
		box-shadow: inset 0 2px 6px var(--cab-shadow);
	}

	.well {
		border-radius: var(--cab-radius-part);
		background: color-mix(in srgb, var(--cab-ink) 6%, transparent);
		box-shadow: inset 0 2px 4px var(--cab-shadow);
	}

	.part {
		display: grid;
		gap: 2px;
		width: 100%;
		padding: var(--cab-space-2);
		background: none;
		border: none;
		border-radius: var(--cab-radius-part);
		cursor: grab;
		text-align: center;
		font: inherit;
		color: inherit;
		touch-action: none;
		transition: transform var(--cab-pop-ms) ease-out;
	}

	.part:hover:not(:disabled) {
		transform: translateY(-2px);
	}

	.part:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	.part:disabled {
		cursor: default;
		opacity: 0.4;
	}

	.art {
		display: block;
		margin-inline: auto;
		max-width: calc(var(--cab-sub) * 4);
	}

	.name {
		font-size: var(--cab-text-sm);
		font-weight: 700;
	}

	.whisper {
		font-size: var(--cab-text-xs);
		opacity: 0.75;
	}

	@media (prefers-reduced-motion: reduce) {
		.part {
			transition: none;
		}
		.part:hover:not(:disabled) {
			transform: none;
		}
	}
</style>
