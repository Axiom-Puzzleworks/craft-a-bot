<script lang="ts">
	import { BRICK_ORDER, brickDefinition, type BrickKind } from '$lib/bricks.js';
	import type { DndController } from '$lib/dnd/dnd-state.svelte.js';
	import { draggable } from '$lib/dnd/draggable.svelte.js';
	import BrickShape from '$lib/components/kit/BrickShape.svelte';

	/**
	 * The parts tray (03-UI-UX-DESIGN.md §4.1): a moulded tray with one well per
	 * brick type. A fitted brick leaves an empty well with its silhouette still
	 * showing, so you can always see what came out of the box.
	 */
	interface Props {
		controller: DndController;
		isFitted: (kind: BrickKind) => boolean;
		onselect: (kind: BrickKind) => void;
	}

	let { controller, isFitted, onselect }: Props = $props();

	function onKeyDown(event: KeyboardEvent, kind: BrickKind): void {
		// Already carrying? Let the press bubble to the page handler, which aims
		// and places. Without this guard the tray would re-lift on every Enter and
		// the brick could never be put down.
		if (controller.carrying) return;
		if (isFitted(kind)) return;
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			// Stop the *same* press reaching the page handler, which would see a
			// carry in progress and place the brick instantly — lifting and
			// dropping in one keystroke.
			event.stopPropagation();
			controller.liftWithKeyboard(kind, 'tray');
		}
	}
</script>

<ul class="tray" data-testid="parts-tray">
	{#each BRICK_ORDER as kind (kind)}
		{@const brick = brickDefinition(kind)}
		{@const fitted = isFitted(kind)}
		<li class="well" class:well--empty={fitted}>
			<button
				type="button"
				class="part"
				data-testid="tray-{kind}"
				data-fitted={fitted}
				aria-label="{brick.name}. {fitted
					? 'Already fitted to your bot.'
					: `${brick.description} Press Enter to pick it up.`}"
				disabled={fitted}
				onclick={() => onselect(kind)}
				onkeydown={(event) => onKeyDown(event, kind)}
				{@attach draggable({ kind, origin: 'tray', controller, disabled: () => fitted })}
			>
				<span class="art"><BrickShape {kind} /></span>
				<span class="name">{brick.name}</span>
				<span class="whisper">{fitted ? 'Fitted' : brick.description}</span>
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
		max-width: calc(var(--cab-u) * 4);
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
