<script lang="ts">
	import { resolve } from '$app/paths';
	import BatteryCompartment from '$lib/components/settings/BatteryCompartment.svelte';
	import Panel from '$lib/components/kit/Panel.svelte';
	import Rocker from '$lib/components/kit/Rocker.svelte';
	import { createBatteryBay } from '$lib/state/battery.svelte.js';
	import { leafletStore } from '$lib/leaflet/leaflet.svelte.js';
	import { preferences } from '$lib/state/preferences.svelte.js';

	/**
	 * Settings (03-UI-UX-DESIGN.md §7): the battery compartment, preferences, and
	 * About.
	 *
	 * The sound switch was withheld in WP9 because nothing made a noise yet.
	 * WP10 adds the cues (`04` §6), so it appears here and controls something.
	 */
	const bay = createBatteryBay();
	const leaflet = leafletStore();

	const SPEEDS = [0.5, 1, 2, 4];
</script>

<svelte:head><title>Settings — Craft A Bot</title></svelte:head>

<main>
	<header class="head">
		<a class="back" href={resolve('/')}>← Shelf</a>
		<h1>Settings</h1>
	</header>

	<BatteryCompartment {bay} />

	<Panel title="Preferences" accent="var(--cab-blue)">
		<div class="prefs" data-testid="preferences">
			<Rocker
				label="Sound"
				hint="Small clunks and clicks as you build. Off by default."
				checked={preferences.sound}
				onchange={(value) => preferences.setSound(value)}
			/>

			<Rocker
				label="Reduce motion"
				hint="Snaps and settles become instant. Your system setting is honoured too."
				checked={preferences.reducedMotion}
				onchange={(value) => preferences.setReducedMotion(value)}
			/>

			<Rocker
				label="Read the story out loud"
				hint="Speaks what your bot is doing, for readers who aren’t reading yet. Off by default."
				checked={preferences.readAloud}
				onchange={(value) => preferences.setReadAloud(value)}
			/>

			<!--
				`15-…` §2: a profile-level choice with per-surface escape hatches, off
				by default so a child never falls into the Workshop by accident. It
				shows the door; it does not lock the rooms — a `/workshop` link
				someone has been given still opens, because a link that silently does
				nothing is worse than one that opens something unexpected.
			-->
			<Rocker
				label="Show the Workshop"
				hint="The grown-up view of the same bots and runs: full traces, filters, prompt diffs. Off by default."
				checked={preferences.workshop}
				onchange={(value) => preferences.setWorkshop(value)}
			/>

			<fieldset class="speed">
				<legend>Playroom speed</legend>
				<p class="hint">How fast a run goes when you press PLAY.</p>
				<div class="speeds">
					{#each SPEEDS as multiplier (multiplier)}
						<label class="speed-option">
							<input
								type="radio"
								name="tick-speed"
								value={multiplier}
								data-testid="tick-speed-{multiplier}"
								checked={preferences.tickSpeed === multiplier}
								onchange={() => preferences.setTickSpeed(multiplier)}
							/>
							<span>×{multiplier}</span>
						</label>
					{/each}
				</div>
			</fieldset>
		</div>
	</Panel>

	<Panel title="Instruction leaflet" accent="var(--cab-yellow)" accentInk="var(--cab-ink)">
		<div class="prefs">
			<p class="hint" data-testid="tutorial-progress">
				{leaflet.badges.length} of 6 merit badges earned.
			</p>
			<button type="button" data-testid="restart-tutorial" onclick={() => leaflet.restart()}>
				Start the instructions again
			</button>
		</div>
	</Panel>

	<Panel title="About" accent="var(--cab-blue)">
		<div class="prefs" data-testid="about">
			<p class="hint">
				<strong>Craft A Bot</strong> — an LLM and agent simulator built as a 1970s construction toy. Everything
				runs in this browser: your bots, your runs, and your API key never leave it.
			</p>
			<p class="hint">Built in public. Licence to be confirmed before release.</p>
		</div>
	</Panel>
</main>

<style>
	main {
		max-width: 720px;
		margin-inline: auto;
		padding: var(--cab-space-5) var(--cab-space-4) var(--cab-space-7);
		display: grid;
		gap: var(--cab-space-4);
	}

	.head {
		display: flex;
		align-items: baseline;
		gap: var(--cab-space-3);
	}

	.back {
		color: var(--cab-blue-text);
		font-size: var(--cab-text-sm);
		font-weight: 600;
		text-decoration: none;
	}

	.back:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	h1 {
		margin: 0;
		font-size: var(--cab-text-xl);
		color: var(--cab-blue-text);
	}

	.prefs {
		display: grid;
		gap: var(--cab-space-3);
	}

	.hint {
		margin: 0;
		font-size: var(--cab-text-sm);
		line-height: 1.5;
		opacity: 0.8;
	}

	.speed {
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		padding: 0;
		font-size: var(--cab-text-sm);
		font-weight: 600;
	}

	.speeds {
		display: flex;
		gap: var(--cab-space-2);
		margin-top: var(--cab-space-2);
	}

	.speed-option {
		display: flex;
		align-items: center;
		gap: var(--cab-space-1);
		font-size: var(--cab-text-sm);
	}

	button {
		font: inherit;
		font-size: var(--cab-text-sm);
		font-weight: 600;
		justify-self: start;
		padding: var(--cab-space-2) var(--cab-space-3);
		color: var(--cab-ink);
		background: var(--cab-cream);
		border: var(--cab-border-part) solid var(--cab-ink);
		border-radius: var(--cab-radius-part);
		cursor: pointer;
	}

	button:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}
</style>
