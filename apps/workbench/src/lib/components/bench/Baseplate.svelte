<script lang="ts">
	import { BRICK_ORDER, SOCKET_LABELS, brickDefinition, type BrickKind } from '$lib/bricks.js';
	import type { DndController } from '$lib/dnd/dnd-state.svelte.js';
	import { draggable } from '$lib/dnd/draggable.svelte.js';
	import { dropzone } from '$lib/dnd/dropzone.svelte.js';
	import BrickShape from '$lib/components/kit/BrickShape.svelte';
	import SocketShape from '$lib/components/kit/SocketShape.svelte';

	/**
	 * The baseplate (03-UI-UX-DESIGN.md §4.2): the bot chassis with shaped
	 * sockets, so a piece only fits where it belongs. The bricks visually become
	 * body parts — head, backpack, belt, visor, wheels, chest.
	 */
	interface Props {
		controller: DndController;
		isFitted: (kind: BrickKind) => boolean;
		selected: BrickKind | undefined;
		onselect: (kind: BrickKind) => void;
		onremove: (kind: BrickKind) => void;
	}

	let { controller, isFitted, selected, onselect, onremove }: Props = $props();

	/** Grid placement on the chassis, roughly where that body part would be. */
	const PLACEMENT: Record<BrickKind, string> = {
		llm: 'head',
		sense: 'visor',
		memory: 'backpack',
		tools: 'belt',
		safety: 'chest',
		actions: 'wheels'
	};

	function socketState(kind: BrickKind): 'empty' | 'candidate' | 'rejecting' | 'occupied' {
		if (controller.candidate === kind) return 'candidate';
		if (controller.rejecting === kind) return 'rejecting';
		if (isFitted(kind)) return 'occupied';
		return 'empty';
	}

	function onKeyDown(event: KeyboardEvent, kind: BrickKind): void {
		// Mid-carry the page handler owns the keyboard — see PartsTray for why.
		if (controller.carrying) return;

		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			event.stopPropagation();
			if (isFitted(kind)) onselect(kind);
			return;
		}
		if ((event.key === 'Delete' || event.key === 'Backspace') && isFitted(kind)) {
			event.preventDefault();
			onremove(kind);
		}
	}
</script>

<div class="baseplate" data-testid="baseplate" data-tutorial="baseplate">
	<p class="chassis-label" aria-hidden="true">Baseplate</p>

	{#each BRICK_ORDER as kind (kind)}
		{@const brick = brickDefinition(kind)}
		{@const fitted = isFitted(kind)}
		{@const state = socketState(kind)}
		<div
			class="socket socket--{PLACEMENT[kind]}"
			data-testid="socket-{kind}"
			data-state={state}
			data-fitted={fitted}
			{@attach dropzone(kind, controller)}
		>
			<SocketShape {kind} {state} />
			<button
				type="button"
				class="slot"
				class:slot--selected={selected === kind}
				aria-label="{SOCKET_LABELS[kind]} socket. {fitted
					? `${brick.name} fitted. Press Enter to open its panel, Delete to take it off.`
					: `Empty — takes the ${brick.name}.`}"
				aria-pressed={fitted}
				onclick={() => (fitted ? onselect(kind) : undefined)}
				onkeydown={(event) => onKeyDown(event, kind)}
				{@attach draggable({ kind, origin: 'socket', controller, disabled: () => !fitted })}
			>
				{#if fitted}
					<BrickShape {kind} fitted />
					<span class="fitted-name">{brick.name}</span>
				{:else}
					<span class="socket-name">{SOCKET_LABELS[kind]}</span>
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
