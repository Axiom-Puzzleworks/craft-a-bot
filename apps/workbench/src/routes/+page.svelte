<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { agentsStore } from '$lib/state/agents.svelte.js';
	import { storageStatus } from '$lib/state/app-storage.svelte.js';
	import { SLOT_ORDER } from '$lib/bricks.js';
	import TakeApartConfirm from '$lib/components/kit/TakeApartConfirm.svelte';
	import type { FittedBrick, SlotId } from '@craftabot/core';

	/**
	 * The Shelf (03-UI-UX-DESIGN.md §3): your bots as toy boxes on a wooden
	 * shelf, plus the expansion packs "still in the shop" — establishing the
	 * merchandising fiction from the first screen.
	 */

	const storage = storageStatus();
	let importError = $state('');
	let busy = $state(false);

	/** The bot the Bin is currently asking about — `undefined` when it isn't asking. */
	let pendingRemoval = $state<{ id: string; name: string } | undefined>();

	$effect(() => {
		// Loading from IndexedDB is inherently async and cannot be derived.
		void agentsStore.load();
	});

	async function newBot(): Promise<void> {
		busy = true;
		try {
			const record = await agentsStore.create();
			await goto(resolve('/bench/[agentId]', { agentId: record.id }));
		} finally {
			busy = false;
		}
	}

	async function onImportFile(event: Event & { currentTarget: HTMLInputElement }): Promise<void> {
		const file = event.currentTarget.files?.[0];
		if (!file) return;
		importError = '';
		const result = await agentsStore.importKit(await file.text());
		if (!result.ok) importError = result.problem.message;
		event.currentTarget.value = '';
	}

	async function exportKit(id: string, name: string): Promise<void> {
		const json = await agentsStore.exportKit(id);
		if (json === undefined) return;
		const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.craftabot.json`;
		link.click();
		URL.revokeObjectURL(url);
	}

	/**
	 * Which sockets a bot has filled, as the colour strip on its box lid (03 §3).
	 *
	 * > **Amended 2026-08-13 (WP14 slice 4b):** matched by **socket**, where this
	 * > matched V1 kind ids and said that a Monitor in the safety socket "has no
	 * > colour on this strip and should not borrow one". That was the right call
	 * > while colour was keyed to six named bricks; it is the wrong one now that
	 * > colour is keyed to the concept a socket stands for (`04-…` §2.2). A bot
	 * > with a Monitor fitted is a bot with governance on board, and a lid that
	 * > showed a gap there was lying about what was in the box.
	 */
	function filledSockets(bricks: readonly FittedBrick[]): SlotId[] {
		const filled = new Set(bricks.map((brick) => brick.slot));
		return SLOT_ORDER.filter((slot) => filled.has(slot));
	}
</script>

<svelte:head><title>Craft A Bot</title></svelte:head>

<main>
	<header class="masthead">
		<h1>Craft A Bot</h1>
		<p class="tagline">Build · Connect · Give it a Goal · Watch it Act</p>
	</header>

	{#if storage.kind === 'memory' && storage.fallbackReason}
		<p class="notice" role="status" data-testid="storage-notice">
			{storage.fallbackReason} Your bots will vanish when you close this tab — export anything you want
			to keep.
		</p>
	{/if}

	<section class="shelf" aria-labelledby="your-kits">
		<div class="shelf-head">
			<h2 id="your-kits">Your kits</h2>
			<div class="shelf-actions">
				<button
					type="button"
					class="primary"
					data-testid="new-bot"
					data-tutorial="new-bot"
					disabled={busy}
					onclick={newBot}
				>
					New bot
				</button>
				<label class="import">
					Import kit
					<input
						type="file"
						accept=".json,application/json"
						data-testid="import-kit"
						onchange={onImportFile}
					/>
				</label>
			</div>
		</div>

		{#if importError}
			<p class="error" role="alert" data-testid="import-error">{importError}</p>
		{/if}

		<ul class="boxes" data-testid="agent-list">
			{#each agentsStore.agents as agent (agent.id)}
				<li>
					<article class="box">
						<a
							class="lid"
							href={resolve('/bench/[agentId]', { agentId: agent.id })}
							data-testid="open-{agent.id}"
						>
							<span class="strip" aria-hidden="true">
								{#each filledSockets(agent.spec.bricks) as slot (slot)}
									<span class="swatch swatch--{slot}"></span>
								{/each}
							</span>
							<h3>{agent.spec.name}</h3>
							<p class="contents">
								{filledSockets(agent.spec.bricks).length} of 6 bricks fitted
							</p>
						</a>
						<div class="box-actions">
							<button type="button" onclick={() => agentsStore.duplicate(agent.id)}
								>Duplicate</button
							>
							<button type="button" onclick={() => exportKit(agent.id, agent.spec.name)}
								>Export</button
							>
							<button
								type="button"
								data-testid="bin-{agent.id}"
								onclick={() => (pendingRemoval = { id: agent.id, name: agent.spec.name })}
								>Bin</button
							>
						</div>
					</article>
				</li>
			{:else}
				<li class="empty">
					<p>The shelf is bare. Open a new box to build your very first agent.</p>
				</li>
			{/each}
		</ul>
	</section>

	<section class="shelf shelf--shop" aria-labelledby="expansions">
		<h2 id="expansions">Expansion packs</h2>
		<ul class="boxes">
			<li>
				<article class="box box--shop">
					<h3>LLM Multi-Pack</h3>
					<p class="contents">6 Models · 6 Special Skills</p>
					<p class="sticker">Coming soon</p>
				</article>
			</li>
		</ul>
	</section>
</main>

{#if pendingRemoval}
	<TakeApartConfirm
		botName={pendingRemoval.name}
		onexport={() => void exportKit(pendingRemoval!.id, pendingRemoval!.name)}
		oncancel={() => (pendingRemoval = undefined)}
		onconfirm={() => {
			void agentsStore.remove(pendingRemoval!.id);
			pendingRemoval = undefined;
		}}
	/>
{/if}

<style>
	main {
		max-width: 1100px;
		margin-inline: auto;
		padding: var(--cab-space-6) var(--cab-space-4) var(--cab-space-7);
		display: grid;
		gap: var(--cab-space-6);
	}

	.masthead {
		text-align: center;
	}

	h1 {
		margin: 0;
		font-size: var(--cab-text-2xl);
		color: var(--cab-blue-text);
		letter-spacing: -0.01em;
	}

	.tagline {
		margin: var(--cab-space-1) 0 0;
		font-size: var(--cab-text-sm);
		text-transform: uppercase;
		letter-spacing: 0.14em;
		opacity: 0.7;
	}

	.notice,
	.error {
		margin: 0;
		padding: var(--cab-space-3);
		border-radius: var(--cab-radius-panel);
		font-size: var(--cab-text-sm);
	}

	.notice {
		background: color-mix(in srgb, var(--cab-yellow) 30%, var(--cab-cream));
		border: var(--cab-border-part) solid var(--cab-yellow);
	}

	.error {
		background: color-mix(in srgb, var(--cab-red) 15%, var(--cab-cream));
		border: var(--cab-border-part) solid var(--cab-red);
		color: var(--cab-red-text);
	}

	.shelf {
		display: grid;
		gap: var(--cab-space-3);
		padding: var(--cab-space-4);
		background: color-mix(in srgb, var(--cab-board) 30%, var(--cab-paper));
		border-radius: var(--cab-radius-panel);
		border-bottom: 6px solid var(--cab-board);
	}

	.shelf-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--cab-space-3);
		flex-wrap: wrap;
	}

	h2 {
		margin: 0;
		font-size: var(--cab-text-lg);
	}

	.shelf-actions {
		display: flex;
		gap: var(--cab-space-2);
		align-items: center;
	}

	button,
	.import {
		font: inherit;
		font-size: var(--cab-text-sm);
		padding: var(--cab-space-2) var(--cab-space-3);
		background: var(--cab-cream);
		color: var(--cab-ink);
		border: var(--cab-border-part) solid var(--cab-ink);
		border-radius: var(--cab-radius-pill);
		cursor: pointer;
	}

	button.primary {
		background: var(--cab-blue);
		color: var(--cab-cream);
		border-color: var(--cab-blue);
		font-weight: 700;
	}

	button:focus-visible,
	.import:focus-within {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	.import input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
	}

	.boxes {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: var(--cab-space-3);
	}

	.box {
		display: grid;
		gap: var(--cab-space-2);
		height: 100%;
		padding: var(--cab-space-3);
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-blue);
		border-radius: var(--cab-radius-panel);
		box-shadow: var(--cab-drop-shadow);
		transition: transform var(--cab-pop-ms) ease-out;
	}

	.box:hover {
		transform: rotate(-0.6deg) translateY(-2px);
	}

	.lid {
		display: grid;
		gap: var(--cab-space-2);
		color: inherit;
		text-decoration: none;
	}

	.lid:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	h3 {
		margin: 0;
		font-size: var(--cab-text-base);
	}

	.strip {
		display: flex;
		gap: 3px;
		min-height: 10px;
	}

	.swatch {
		width: 18px;
		height: 10px;
		border-radius: 3px;
	}

	.swatch--brain {
		background: var(--cab-brick-slot-brain);
	}
	.swatch--memory {
		background: var(--cab-brick-slot-memory);
	}
	.swatch--equipment {
		background: var(--cab-brick-slot-equipment);
	}
	.swatch--perception {
		background: var(--cab-brick-slot-perception);
	}
	.swatch--mobility {
		background: var(--cab-brick-slot-mobility);
	}
	.swatch--safety {
		background: var(--cab-brick-slot-safety);
	}

	.contents {
		margin: 0;
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted);
	}

	.box-actions {
		display: flex;
		gap: var(--cab-space-1);
		flex-wrap: wrap;
	}

	.box-actions button {
		padding: 2px var(--cab-space-2);
		font-size: var(--cab-text-xs);
	}

	.empty p {
		margin: 0;
		font-size: var(--cab-text-sm);
		opacity: 0.8;
	}

	/*
	 * "Still in the shop" is said with grey and a sticker, not by dimming the
	 * whole box — the opacity took its text down with it, and a box you cannot
	 * buy yet is still a box you should be able to read.
	 */
	.box--shop {
		border-color: color-mix(in srgb, var(--cab-ink) 35%, transparent);
		filter: grayscale(0.7);
	}

	.box--shop .contents,
	.box--shop h3 {
		color: var(--cab-ink-muted);
	}

	.sticker {
		justify-self: start;
		margin: 0;
		padding: 2px var(--cab-space-2);
		background: var(--cab-yellow);
		border-radius: var(--cab-radius-pill);
		font-size: var(--cab-text-xs);
		font-weight: 700;
		transform: rotate(-4deg);
	}

	@media (prefers-reduced-motion: reduce) {
		.box {
			transition: none;
		}
		.box:hover {
			transform: none;
		}
	}
</style>
