<script lang="ts">
	import type { EngineEvent, GridWorldState, RunOutcome } from '@craftabot/core';
	import { botExpressionWords, type BotExpression } from '$lib/bot-expression.js';
	import { fxCue } from '$lib/fx-cue.js';
	import {
		BACKDROP,
		BOT_FACES,
		BOT_POSES,
		CELL_HIGHLIGHT,
		CHARACTERS,
		CONTAINERS,
		FURNITURE,
		GRID,
		SCENE_ITEMS
	} from '$lib/assets/index.js';
	import { inlineSvg } from '$lib/assets/inline.js';
	import Art from '$lib/components/art/Art.svelte';
	import Fx from '$lib/components/play/Fx.svelte';

	/**
	 * The Playroom (03-UI-UX-DESIGN.md §5.1): the 8×6 room with the rug, the
	 * furniture, Teddy, the items, and the bot.
	 *
	 * **Drawn, as of WP18.** Everything in here was an emoji until the wave 1 art
	 * landed (`22-…` §5); the swap is a rendering change and nothing else, because
	 * the state still comes entirely from `world.changed` events and never from
	 * the engine's world object, which is what keeps hard rule 3 true.
	 *
	 * Every picture is looked up by the world's own id through `lib/assets`, which
	 * is the only module allowed to map an id to an artefact. Nothing in this file
	 * decides what a thing looks like.
	 */
	interface Props {
		world: GridWorldState | undefined;
		/** What the bot just said, as a speech bubble. */
		saying?: string | undefined;
		/**
		 * How the run is going, on the bot's face (`16-…` §1.6). Defaults to
		 * `idle` so a caller that has no session — the empty Playroom, a test —
		 * still draws a bot rather than nothing.
		 */
		expression?: BotExpression;
		/**
		 * How it ended, once it has. Teddy is the only thing that reads it: he is
		 * delighted on SUCCESS (`16-…` §2.3) and sitting patiently the rest of the
		 * time, which is the whole of his range.
		 */
		outcome?: RunOutcome | undefined;
		/**
		 * The run so far, for the effects (`20-…` §5.4). Only `fxCue` reads it, and
		 * only backwards from the end: an effect is about the most recent thing
		 * that happened, which is a property of the list rather than of a flag
		 * somebody has to remember to clear.
		 */
		events?: readonly EngineEvent[];
	}

	let { world, saying, expression = 'idle', outcome, events = [] }: Props = $props();

	const beat = $derived(fxCue(events));

	function cells(state: GridWorldState) {
		const grid: { x: number; y: number }[] = [];
		for (let y = 0; y < state.height; y++) {
			for (let x = 0; x < state.width; x++) grid.push({ x, y });
		}
		return grid;
	}

	function at<T extends { position: { x: number; y: number } }>(
		list: T[],
		x: number,
		y: number
	): T | undefined {
		return list.find((entry) => entry.position.x === x && entry.position.y === y);
	}

	function itemsOnFloor(state: GridWorldState, x: number, y: number) {
		return state.items.filter(
			(item) =>
				item.location.kind === 'floor' &&
				item.location.position.x === x &&
				item.location.position.y === y
		);
	}

	const carried = $derived(world?.items.find((item) => item.location.kind === 'carried'));

	/**
	 * The bot: one of two bodies, wearing one of six faces, sometimes holding a
	 * thing. Composed as markup rather than as three overlaid elements, because
	 * the slot origins live in the files (`SLOT_ORIGINS`, stamped in as a
	 * `transform`) and a second copy of those numbers here is the drift the whole
	 * named-group contract exists to prevent.
	 */
	const bot = $derived.by(() => {
		const item = carried ? SCENE_ITEMS[carried.id] : undefined;
		const slots: Record<string, string> = {
			// 48 × 48 is the slot; the face is drawn at exactly that, and a 72 px
			// scene item scales into it rather than being cropped by it.
			'face-slot': inlineSvg(BOT_FACES[expression], { size: 48 })
		};
		if (carried && item) slots['icon-slot'] = inlineSvg(item, { size: 48 });
		return inlineSvg(carried ? BOT_POSES.carry : BOT_POSES.walk, { slots });
	});

	/**
	 * The backdrop hard-codes the room (768 × 576, `20-…` §8.4) and is the only
	 * asset that does. A world of another shape gets the rug colour instead of a
	 * picture stretched to fit — a wrong room is worse than a plain one, and this
	 * is the seam that would tell us the grid had moved.
	 */
	const roomIsDrawn = $derived(world?.width === GRID.cols && world?.height === GRID.rows);
</script>

{#if !world}
	<div class="waiting" data-testid="world-waiting">
		<p>Press STEP to send your bot into the Playroom.</p>
	</div>
{:else}
	<div
		class="room"
		class:room--drawn={roomIsDrawn}
		data-testid="world-view"
		style="--cols: {world.width}; --rows: {world.height}"
		role="img"
		aria-label="The Playroom, {world.width} by {world.height}. Your bot is at column {world.bot
			.position.x + 1}, row {world.bot.position.y + 1}."
	>
		{#if roomIsDrawn}
			<span class="backdrop" data-testid="backdrop"><Art source={BACKDROP} /></span>
		{/if}

		{#each cells(world) as cell (`${cell.x},${cell.y}`)}
			{@const container = at(world.containers, cell.x, cell.y)}
			{@const furniture = at(world.furniture, cell.x, cell.y)}
			{@const character = at(world.characters, cell.x, cell.y)}
			{@const loose = itemsOnFloor(world, cell.x, cell.y)}
			{@const isBot = world.bot.position.x === cell.x && world.bot.position.y === cell.y}
			<div class="cell" data-testid="cell-{cell.x}-{cell.y}" data-bot={isBot}>
				{#if isBot}
					<!-- A frame, not a pad: the cue must not cover what it points at. -->
					<span class="highlight"><Art source={CELL_HIGHLIGHT} /></span>
				{/if}

				{#if container}
					{@const chest = CONTAINERS[container.id]}
					<span class="thing thing--container" data-state={container.state}>
						<!-- One file, three baked states, switched by the world's own word. -->
						{#if chest}<Art source={chest} variants={{ state: container.state }} />{/if}
						<span class="caption">chest</span>
					</span>
				{:else if furniture}
					{@const piece = FURNITURE[furniture.id]}
					<span class="thing thing--furniture">
						{#if piece}<Art source={piece} />{/if}
						<span class="caption">{furniture.id}</span>
					</span>
				{/if}

				{#if character}
					{@const mood = outcome === 'SUCCESS' ? 'happy' : 'idle'}
					{@const teddy = CHARACTERS[character.id]}
					<span class="thing thing--teddy" data-testid="teddy" data-mood={mood}>
						{#if teddy}<Art source={teddy[mood]} />{/if}
						<span class="caption">{character.name}</span>
					</span>
				{/if}

				{#if loose.length > 0}
					<span class="items">
						{#each loose as item (item.id)}
							{@const art = SCENE_ITEMS[item.id]}
							<span class="item" data-testid="item-{item.id}">
								{#if art}
									<Art source={art} />
								{:else}
									<!-- A thing some pack added and nobody drew. Better a dot than
									     a picture of the wrong object. -->
									<span class="undrawn">•</span>
								{/if}
							</span>
						{/each}
					</span>
				{/if}

				{#if isBot}
					<span class="thing thing--bot" data-testid="bot" data-expression={expression}>
						<span class="body" data-pose={carried ? 'carry' : 'walk'}>
							<!-- eslint-disable-next-line svelte/no-at-html-tags -- build-time asset markup, composed by lib/assets/inline.ts -->
							{@html bot}
						</span>
						<span class="visually-hidden" data-testid="bot-expression">
							Your bot is {botExpressionWords(expression)}.
						</span>
						{#if carried}
							<span class="visually-hidden" data-testid="bot-carrying">
								Carrying {carried.name}.
							</span>
						{/if}
						{#if saying}
							<span class="bubble" data-testid="speech-bubble">{saying}</span>
						{/if}
					</span>

					{#if beat}
						<!--
							Keyed on the event that raised it, not on the cue: two refusals
							in a row are two puffs, and a component keyed on `'puzzled'`
							would animate the first and sit still for the second.
						-->
						{#key beat.at}
							<Fx cue={beat.cue} />
						{/key}
					{/if}
				{/if}
			</div>
		{/each}
	</div>

	<p class="held" data-testid="teddy-holding">
		{#each world.characters as character (character.id)}
			{@const held = world.items.filter(
				(item) => item.location.kind === 'held-by' && item.location.characterId === character.id
			)}
			{character.name} is holding: {held.length > 0
				? held.map((item) => item.name).join(', ')
				: 'nothing'}.
		{/each}
	</p>
{/if}

<style>
	.waiting {
		display: grid;
		place-items: center;
		min-height: calc(var(--cab-sub) * 10);
		background: var(--cab-cream);
		border: var(--cab-border-panel) dashed color-mix(in srgb, var(--cab-ink) 25%, transparent);
		border-radius: var(--cab-radius-panel);
	}

	.waiting p {
		margin: 0;
		opacity: 0.75;
	}

	.room {
		position: relative;
		display: grid;
		grid-template-columns: repeat(var(--cols), 1fr);
		grid-template-rows: repeat(var(--rows), 1fr);
		aspect-ratio: var(--cols) / var(--rows);
		background: var(--cab-rug);
		border: var(--cab-border-panel) solid var(--cab-board);
		border-radius: var(--cab-radius-panel);
		overflow: hidden;
	}

	/*
	 * No gap and no per-cell wash once there is a room behind the grid: both were
	 * there to make an invisible 8 × 6 legible, and both now show as seams across
	 * a drawn floor. The grid is still exactly where it was — the bot's cell
	 * highlight is what says so.
	 */
	.backdrop {
		position: absolute;
		inset: 0;
		z-index: 0;
	}

	.cell {
		position: relative;
		z-index: 1;
		display: grid;
		place-items: center;
		min-height: var(--cab-sub);
	}

	.room:not(.room--drawn) .cell {
		background: color-mix(in srgb, var(--cab-cream) 22%, transparent);
		border-radius: 4px;
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cab-ink) 8%, transparent);
	}

	.highlight {
		position: absolute;
		inset: 0;
		z-index: 1;
		/* Yellow is Safety's colour, so the target cue borrows the accent instead
		   (`04-…` §2.2 — a colour means one thing). */
		--part-tint: var(--cab-teal);
	}

	.thing {
		position: absolute;
		inset: 0;
		z-index: 2;
		display: grid;
		place-items: center;
		line-height: 1;
	}

	/*
	 * Every asset fills the box it is given and letterboxes rather than
	 * distorting — `preserveAspectRatio` is doing the work, so a 72 px item in a
	 * 96 px cell keeps its 12 px of clearance without a number here.
	 */
	.thing :global(svg),
	.backdrop :global(svg),
	.highlight :global(svg),
	.item :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}

	.items {
		position: absolute;
		inset: 12%;
		z-index: 2;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/*
	 * Items share a cell by sharing its width rather than by stacking. Two blocks
	 * on one square used to be one block, drawn twice in the same place.
	 */
	.item {
		flex: 1 1 0;
		min-width: 0;
		max-width: 100%;
	}

	.undrawn {
		font-size: 10px;
	}

	/*
	 * Captions get their own backing rather than sitting on the rug. Nothing
	 * passes AA against `--cab-rug` — even full-strength ink reaches only about
	 * 4.3 — so a colour was never going to fix this one; the label needed to
	 * stop being on the carpet.
	 */
	.caption {
		position: absolute;
		bottom: 0;
		left: 50%;
		transform: translateX(-50%);
		padding: 0 2px;
		border-radius: 2px;
		background: var(--cab-cream);
		color: var(--cab-ink);
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		white-space: nowrap;
	}

	.thing--bot {
		z-index: 3;
	}

	.body {
		display: block;
		width: 100%;
		height: 100%;
		/* Discrete cell hops with a little squash — 04 §6. */
		animation: hop var(--cab-hop-ms) ease-out;
	}

	.body :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}

	/*
	 * The face is decoration for a sighted child and information for everybody
	 * else, so the picture is hidden from the reader and the words are given to
	 * it.
	 */
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
		border: 0;
	}

	.bubble {
		position: absolute;
		bottom: 100%;
		left: 50%;
		transform: translateX(-50%);
		margin-bottom: 4px;
		padding: 2px var(--cab-space-2);
		width: max-content;
		max-width: calc(var(--cab-sub) * 7);
		background: var(--cab-cream);
		border: 2px solid var(--cab-ink);
		border-radius: 10px;
		font-size: var(--cab-text-xs);
		z-index: 4;
	}

	.held {
		margin: var(--cab-space-2) 0 0;
		font-size: var(--cab-text-sm);
		opacity: 0.85;
	}

	@keyframes hop {
		from {
			transform: translateY(-3px) scale(1.06);
		}
		to {
			transform: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.body {
			animation: none;
		}
	}
</style>
