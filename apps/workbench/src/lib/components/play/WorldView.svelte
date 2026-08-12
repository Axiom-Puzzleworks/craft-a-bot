<script lang="ts">
	import type { PlayroomState } from '@craftabot/pack-starter';

	/**
	 * The Playroom (03-UI-UX-DESIGN.md §5.1): the 8×6 room with the rug, the
	 * furniture, Teddy, the items, and the bot.
	 *
	 * Placeholder art in the fixed token colours, same approach as WP5's bricks —
	 * the real painted scene arrives with the visual workstream (11 §E). The
	 * state comes entirely from `world.changed` events, never from the engine's
	 * world object, which is what keeps hard rule 3 true.
	 */
	interface Props {
		world: PlayroomState | undefined;
		/** What the bot just said, as a speech bubble. */
		saying?: string | undefined;
	}

	let { world, saying }: Props = $props();

	/** Short labels so a cell reads at a glance without hover. */
	const ITEM_GLYPHS: Record<string, string> = {
		snack: '🍪',
		'block-a': 'C',
		'block-b': 'A',
		'block-c': 'B',
		'red-key': '🔑',
		ball: '⬤'
	};

	function cells(state: PlayroomState) {
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

	function itemsOnFloor(state: PlayroomState, x: number, y: number) {
		return state.items.filter(
			(item) =>
				item.location.kind === 'floor' &&
				item.location.position.x === x &&
				item.location.position.y === y
		);
	}

	const carried = $derived(world?.items.find((item) => item.location.kind === 'carried'));
</script>

{#if !world}
	<div class="waiting" data-testid="world-waiting">
		<p>Press STEP to send your bot into the Playroom.</p>
	</div>
{:else}
	<div
		class="room"
		data-testid="world-view"
		style="--cols: {world.width}; --rows: {world.height}"
		role="img"
		aria-label="The Playroom, {world.width} by {world.height}. Your bot is at column {world.bot
			.position.x + 1}, row {world.bot.position.y + 1}."
	>
		{#each cells(world) as cell (`${cell.x},${cell.y}`)}
			{@const container = at(world.containers, cell.x, cell.y)}
			{@const furniture = at(world.furniture, cell.x, cell.y)}
			{@const character = at(world.characters, cell.x, cell.y)}
			{@const loose = itemsOnFloor(world, cell.x, cell.y)}
			{@const isBot = world.bot.position.x === cell.x && world.bot.position.y === cell.y}
			<div class="cell" data-testid="cell-{cell.x}-{cell.y}" data-bot={isBot}>
				{#if container}
					<span class="thing thing--container" data-state={container.state}>
						<span class="glyph">{container.state === 'locked' ? '🔒' : '🧰'}</span>
						<span class="caption">chest</span>
					</span>
				{:else if furniture}
					<span class="thing thing--furniture">
						<span class="glyph">{furniture.id === 'table' ? '🛋' : '🗄'}</span>
						<span class="caption">{furniture.id}</span>
					</span>
				{/if}

				{#if character}
					<span class="thing thing--teddy" data-testid="teddy">
						<span class="glyph">🧸</span>
						<span class="caption">{character.name}</span>
					</span>
				{/if}

				{#each loose as item (item.id)}
					<span class="thing thing--item" data-testid="item-{item.id}">
						<span class="glyph">{ITEM_GLYPHS[item.id] ?? '•'}</span>
					</span>
				{/each}

				{#if isBot}
					<span class="thing thing--bot" data-testid="bot">
						<span class="glyph">🤖</span>
						{#if carried}
							<span class="carrying" data-testid="bot-carrying">
								{ITEM_GLYPHS[carried.id] ?? '•'}
							</span>
						{/if}
						{#if saying}
							<span class="bubble" data-testid="speech-bubble">{saying}</span>
						{/if}
					</span>
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
		min-height: calc(var(--cab-u) * 10);
		background: var(--cab-cream);
		border: var(--cab-border-panel) dashed color-mix(in srgb, var(--cab-ink) 25%, transparent);
		border-radius: var(--cab-radius-panel);
	}

	.waiting p {
		margin: 0;
		opacity: 0.75;
	}

	.room {
		display: grid;
		grid-template-columns: repeat(var(--cols), 1fr);
		grid-template-rows: repeat(var(--rows), 1fr);
		gap: 2px;
		padding: var(--cab-space-2);
		aspect-ratio: 8 / 6;
		background: var(--cab-rug);
		border: var(--cab-border-panel) solid var(--cab-board);
		border-radius: var(--cab-radius-panel);
	}

	.cell {
		position: relative;
		display: grid;
		place-items: center;
		border-radius: 4px;
		background: color-mix(in srgb, var(--cab-cream) 22%, transparent);
		min-height: var(--cab-u);
	}

	.cell[data-bot='true'] {
		background: color-mix(in srgb, var(--cab-yellow) 35%, transparent);
	}

	.thing {
		display: grid;
		place-items: center;
		line-height: 1;
	}

	.glyph {
		font-size: clamp(14px, 2.2vw, 24px);
	}

	.caption {
		font-size: 8px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		opacity: 0.7;
	}

	.thing--item {
		position: absolute;
		right: 2px;
		bottom: 2px;
		font-size: 10px;
	}

	.thing--bot {
		position: relative;
		z-index: 2;
		/* Discrete cell hops with a little squash — 04 §6. */
		animation: hop var(--cab-hop-ms) ease-out;
	}

	.carrying {
		position: absolute;
		right: -6px;
		top: -4px;
		font-size: 11px;
	}

	.bubble {
		position: absolute;
		bottom: 100%;
		left: 50%;
		transform: translateX(-50%);
		margin-bottom: 4px;
		padding: 2px var(--cab-space-2);
		width: max-content;
		max-width: calc(var(--cab-u) * 7);
		background: var(--cab-cream);
		border: 2px solid var(--cab-ink);
		border-radius: 10px;
		font-size: var(--cab-text-xs);
		z-index: 3;
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
		.thing--bot {
			animation: none;
		}
	}
</style>
