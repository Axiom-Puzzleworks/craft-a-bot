<script lang="ts">
	import type { LeafletController } from '$lib/leaflet/leaflet.svelte.js';
	import { preferences } from '$lib/state/preferences.svelte.js';
	import BadgePage from './BadgePage.svelte';
	import Spotlight from './Spotlight.svelte';

	/**
	 * The Instruction Leaflet (03-UI-UX-DESIGN.md §6): the fold-out paper
	 * instructions from a real kit — numbered steps, minimal words, yellowed
	 * paper — running as an overlay that points at the live UI.
	 *
	 * The whole chapter is listed, not just the current step, because that is how
	 * a real leaflet works: you can see what you have done and what is coming.
	 * It also solves a small honesty problem — several steps are already true when
	 * a chapter opens (a new bot arrives on the Say Hello card), and showing them
	 * ticked is better than silently skipping them.
	 *
	 * Paper texture, fold creases and arrow stickers are P1 assets
	 * (`11-VISUAL-ASSET-MANIFEST.md` §J) arriving at WP10.
	 */

	interface Props {
		leaflet: LeafletController;
	}

	let { leaflet }: Props = $props();

	let showBadges = $state(false);

	/**
	 * Which corner to sit in.
	 *
	 * A fixed panel in the bottom-right covered the Playroom's run controls, so
	 * the tutorial hid the STEP button it was telling you to press. The panel now
	 * docks away from whatever it is pointing at: anchor on the right, panel on
	 * the left, and vice versa.
	 */
	let dock = $state<'left' | 'right'>('right');

	$effect(() => {
		const anchor = leaflet.step?.anchor;
		if (anchor === undefined) {
			dock = 'right';
			return;
		}
		const element = document.querySelector(`[data-tutorial="${anchor}"]`);
		if (!element) {
			dock = 'right';
			return;
		}
		const box = element.getBoundingClientRect();
		dock = box.left + box.width / 2 > window.innerWidth / 2 ? 'left' : 'right';
	});
</script>

{#if leaflet.open}
	<Spotlight anchor={leaflet.step?.anchor} />

	<aside
		class="leaflet"
		class:leaflet--left={dock === 'left'}
		data-testid="leaflet"
		data-dock={dock}
		aria-label="Instruction leaflet"
	>
		{#if leaflet.complete}
			<header>
				<p class="eyebrow">Instruction leaflet</p>
				<h2 data-testid="leaflet-title">All six chapters built!</h2>
			</header>
			<p class="teaches">
				You have built a bot that senses, remembers, uses tools, looks things up, and asks
				permission before it acts. That is an agent.
			</p>
			<BadgePage earned={leaflet.badges} />
			<div class="actions">
				<button type="button" data-testid="leaflet-restart" onclick={() => leaflet.restart()}>
					Start again
				</button>
				<button
					type="button"
					class="primary"
					data-testid="leaflet-close"
					onclick={() => leaflet.hide()}
				>
					Close
				</button>
			</div>
		{:else if leaflet.chapter}
			{@const chapter = leaflet.chapter}
			<header>
				<p class="eyebrow">Chapter {chapter.number} of 6</p>
				<h2 data-testid="leaflet-title">{chapter.title}</h2>
			</header>
			<p class="teaches" data-testid="leaflet-teaches">{chapter.teaches}</p>

			<ol data-testid="leaflet-steps">
				{#each leaflet.steps as view (view.step.id)}
					<li
						class:done={view.done}
						class:current={view.current}
						data-testid="leaflet-step-{view.step.id}"
						data-current={view.current}
						data-done={view.done}
					>
						<span class="tick" aria-hidden="true">{view.done ? '✓' : ''}</span>
						<span class="text">{view.step.text}</span>
						{#if view.current && view.step.ack}
							<button
								type="button"
								class="got-it"
								data-testid="leaflet-ack"
								onclick={() => leaflet.ack(view.step.id)}
							>
								Got it
							</button>
						{/if}
					</li>
				{/each}
			</ol>

			{#if showBadges}
				<BadgePage earned={leaflet.badges} />
			{/if}

			<div class="actions">
				<button
					type="button"
					data-testid="leaflet-badges"
					aria-expanded={showBadges}
					onclick={() => (showBadges = !showBadges)}
				>
					{showBadges ? 'Hide badges' : 'Badges'}
				</button>
				<button type="button" data-testid="leaflet-skip" onclick={() => leaflet.skip()}>
					I've built kits before
				</button>
				<button type="button" data-testid="leaflet-close" onclick={() => leaflet.hide()}>
					Close
				</button>
			</div>
		{/if}
	</aside>
{:else}
	<!-- The drawer handle, present in both modes (03 §6). -->
	<button
		type="button"
		class="handle"
		data-testid="leaflet-handle"
		onclick={() => {
			preferences.cue('rustle');
			leaflet.show();
		}}
	>
		Instructions
	</button>
{/if}

{#if leaflet.justEarned}
	{@const badge = leaflet.badges.at(-1)}
	<div class="popper" role="status" data-testid="badge-earned" data-badge={leaflet.justEarned}>
		<span class="popper-badge" aria-hidden="true">★</span>
		<p>Merit badge earned: <strong>{badge}</strong></p>
		<button type="button" data-testid="badge-dismiss" onclick={() => leaflet.dismissBadge()}>
			Nice
		</button>
	</div>
{/if}

<style>
	.leaflet {
		position: fixed;
		right: var(--cab-space-3);
		left: auto;
		bottom: var(--cab-space-3);
		z-index: 30;
		display: grid;
		gap: var(--cab-space-2);
		width: min(360px, calc(100vw - var(--cab-space-4)));
		max-height: min(72vh, 640px);
		overflow-y: auto;
		padding: var(--cab-space-4);
		background: var(--cab-paper);
		border: var(--cab-border-panel) solid var(--cab-blue);
		border-radius: var(--cab-radius-panel);
		box-shadow: var(--cab-lift-shadow);
	}

	.leaflet--left {
		right: auto;
		left: var(--cab-space-3);
	}

	.eyebrow {
		margin: 0;
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--cab-blue-text);
	}

	h2 {
		margin: 0;
		font-size: var(--cab-text-lg);
		color: var(--cab-ink);
	}

	.teaches {
		margin: 0;
		font-size: var(--cab-text-xs);
		line-height: 1.5;
		color: var(--cab-ink);
		opacity: 0.8;
	}

	ol {
		display: grid;
		gap: var(--cab-space-1);
		margin: 0;
		padding: 0;
		list-style: none;
		counter-reset: step;
	}

	li {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--cab-space-2);
		align-items: start;
		padding: var(--cab-space-2);
		font-size: var(--cab-text-sm);
		line-height: 1.45;
		color: var(--cab-ink);
		background: transparent;
		border-radius: var(--cab-radius-part);
		opacity: 0.55;
	}

	/* Current step is marked by weight and a rule, not by colour alone (03 §8). */
	li.current {
		opacity: 1;
		font-weight: 600;
		background: var(--cab-cream);
		box-shadow: inset 3px 0 0 var(--cab-yellow);
	}

	li.done {
		opacity: 0.75;
	}

	li.done .text {
		text-decoration: line-through;
	}

	.tick {
		width: 1em;
		font-weight: 700;
		color: var(--cab-green-text);
	}

	.got-it {
		grid-column: 2;
		justify-self: start;
		margin-top: var(--cab-space-1);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-2);
	}

	button {
		font: inherit;
		font-size: var(--cab-text-xs);
		font-weight: 600;
		padding: var(--cab-space-1) var(--cab-space-2);
		color: var(--cab-ink);
		background: var(--cab-cream);
		border: var(--cab-border-part) solid var(--cab-ink);
		border-radius: var(--cab-radius-part);
		cursor: pointer;
	}

	button.primary {
		background: var(--cab-green-fill);
		color: var(--cab-cream);
	}

	button:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: 2px;
	}

	.handle {
		position: fixed;
		right: 0;
		bottom: var(--cab-space-6);
		z-index: 30;
		padding: var(--cab-space-2) var(--cab-space-3);
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		background: var(--cab-yellow);
		border-radius: var(--cab-radius-part) 0 0 var(--cab-radius-part);
	}

	.popper {
		position: fixed;
		left: 50%;
		bottom: var(--cab-space-5);
		transform: translateX(-50%);
		z-index: 40;
		display: flex;
		align-items: center;
		gap: var(--cab-space-2);
		padding: var(--cab-space-2) var(--cab-space-4);
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-yellow);
		border-radius: var(--cab-radius-pill);
		box-shadow: var(--cab-lift-shadow);
	}

	.popper p {
		margin: 0;
		font-size: var(--cab-text-sm);
		color: var(--cab-ink);
	}

	.popper-badge {
		font-size: var(--cab-text-lg);
	}
</style>
