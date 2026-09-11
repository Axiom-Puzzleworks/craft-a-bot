<script lang="ts">
	import { SITE_FRAMING_PAGE } from '$lib/workshop/site.js';
	import { resolve } from '$app/paths';
	import BatteryCompartment from '$lib/components/settings/BatteryCompartment.svelte';
	import GeapCredentialCompartment from '$lib/components/settings/GeapCredentialCompartment.svelte';
	import Panel from '$lib/components/kit/Panel.svelte';
	import Rocker from '$lib/components/kit/Rocker.svelte';
	import { createBatteryBay } from '$lib/state/battery.svelte.js';
	import { createGeapCredentialBay } from '$lib/state/geap-credential.svelte.js';
	import { leafletStore } from '$lib/leaflet/leaflet.svelte.js';
	import { preferences } from '$lib/state/preferences.svelte.js';
	import { LENSES, type LensId } from '$lib/workshop/lens.js';
	import { createRegistry } from '$lib/packs.js';
	import { OLLAMA_BASE_URL } from '@craftabot/pack-ollama';
	import { evidenceStores } from '@craftabot/evidence';
	import { allowsRoute, edition, sectionFor } from '$lib/edition.js';

	/**
	 * Settings (03-UI-UX-DESIGN.md §7): the battery compartment, preferences, and
	 * About.
	 *
	 * The sound switch was withheld in WP9 because nothing made a noise yet.
	 * WP10 adds the cues (`04` §6), so it appears here and controls something.
	 *
	 * **One compartment per registered provider that needs a key** (WP26).
	 * "New battery slots appear per provider automatically from
	 * `keyRequirement`" (`06-…` §8) was the design from the first day this doc
	 * was written; until this WP there was only ever one provider to prove it
	 * against. A keyless provider (Ollama, running locally) gets no
	 * compartment at all — there is nothing to plug in.
	 */
	const registry = createRegistry();
	const compartments = registry
		.listProviderFactories()
		.filter((provider) => provider.keyRequirement === 'required')
		.map((provider) => ({
			provider,
			bay: createBatteryBay({
				providerId: provider.id,
				validate: (key) => provider.create({ apiKey: key }).validateKey(key)
			})
		}));
	// The Armour Brick's own battery (`25-…` §4.6/§4.8, WP35 stage E) — shown
	// only while the Workshop door is open, the same gate `PartsTray.svelte`
	// already uses for the brick itself (stage C).
	const geapBay = createGeapCredentialBay();
	// The evidence store's workspace token (WP70, `58-…` §4.5): a bearer token
	// minted by the team, so there is nothing to validate against but the store
	// itself — the compartment reads "fitted — not checked yet" and the Evidence
	// page's push is the check.
	const evidenceCompartments = evidenceStores
		.filter((store) => store.credential !== undefined)
		.map((store) => ({
			store,
			credential: store.credential as NonNullable<(typeof store)['credential']>,
			bay: createBatteryBay({
				providerId: (store.credential as NonNullable<(typeof store)['credential']>).id,
				validate: async (key) => ({
					ok: key.trim() !== '',
					message: 'Fitted; the Evidence page checks it against the store.'
				})
			})
		}));
	const leaflet = leafletStore();
	// The door (WP69, `59-…` §4.3): in a box with no Workshop, a link to the section that has it — not a toggle.
	const workshopHere = allowsRoute(edition, '/workshop');
	const workshopSection = sectionFor('/workshop');

	const SPEEDS = [0.5, 1, 2, 4];
	/** The reason the last Ollama address was refused, if it was (WP52). */
	let endpointProblem = $state<string | undefined>(undefined);
</script>

<svelte:head><title>Settings — Craft A Bot</title></svelte:head>

<main>
	<header class="head">
		<a class="back" href={resolve('/')}>← Shelf</a>
		<h1>Settings</h1>
	</header>

	{#each compartments as { provider, bay } (provider.id)}
		<BatteryCompartment
			{bay}
			providerId={provider.id}
			providerName={provider.name}
			keysUrl={provider.keysUrl ?? ''}
		/>
	{/each}

	{#if preferences.workshop}
		<GeapCredentialCompartment bay={geapBay} />
		{#each evidenceCompartments as { store, credential, bay } (store.id)}
			<BatteryCompartment
				{bay}
				providerId={credential.id}
				providerName={`${store.name} — ${credential.name}`}
				keysUrl={credential.keysUrl ?? ''}
				role="service"
			/>
		{/each}

		<!--
			The run cap (WP36 stage C): `07-…` §2's fifty was a constant, and a
			practitioner building an experiment corpus needs the scrapbook to
			keep more than a child's does. Workshop-gated like the Armour
			battery above — a child never needs to see it, and the default is
			exactly the cap the Kit has always had.
		-->
		<Panel title="Workshop" accent="var(--cab-ink)">
			<div class="prefs" data-testid="workshop-preferences">
				<label class="cap">
					<span>Runs to keep</span>
					<input
						type="number"
						min="5"
						max="500"
						step="5"
						data-testid="run-cap"
						value={preferences.runCap}
						onchange={(event) => {
							const value = Number((event.currentTarget as HTMLInputElement).value);
							if (Number.isInteger(value) && value >= 5 && value <= 500)
								preferences.setRunCap(value);
						}}
					/>
				</label>
				<p class="hint">
					How many adventures the scrapbook keeps before the oldest unpinned ones are tidied away.
					Pinned adventures and Robot Friends episodes never count. Default 50.
				</p>
				<!--
					The name on the trace (WP65, `55-…` §4.2): every run this browser
					starts and every approval it answers names its principal — an id
					minted once for this browser, and this name when given.
				-->
				<label class="cap">
					<span>Your name, on the trace</span>
					<input
						type="text"
						maxlength="60"
						data-testid="display-name"
						value={preferences.displayName}
						onchange={(event) =>
							preferences.setDisplayName((event.currentTarget as HTMLInputElement).value)}
					/>
				</label>
				<p class="hint" data-testid="display-name-note">
					Written on every run you start and every approval you answer, beside an id this browser
					made up once. Leave it blank and the trace carries the id alone.
				</p>
			</div>
		</Panel>
	{/if}

	<!--
		Where Ollama listens (WP52, `40-DEBTS.md` §4.3): the one endpoint a person
		may set, and only to this computer — `06-…` §5's "revisit for Ollama later
		with localhost-only validation", done. Refused before it is stored, with the
		reason; the pack refuses anything else a second time.
	-->
	<Panel title="Local models" accent="var(--cab-ink)">
		<div class="prefs" data-testid="local-models">
			<label class="cap">
				<span>Ollama address</span>
				<input
					type="url"
					data-testid="ollama-endpoint"
					value={preferences.ollamaEndpoint}
					onchange={(event) => {
						const value = (event.currentTarget as HTMLInputElement).value;
						endpointProblem = preferences.setOllamaEndpoint(value);
						if (endpointProblem !== undefined)
							(event.currentTarget as HTMLInputElement).value = preferences.ollamaEndpoint;
					}}
				/>
			</label>
			{#if endpointProblem}
				<p class="hint" role="alert" data-testid="ollama-endpoint-refused">{endpointProblem}</p>
			{:else}
				<p class="hint" data-testid="ollama-endpoint-note">
					Only this computer is allowed — localhost or 127.0.0.1. Default
					<span class="mono">{OLLAMA_BASE_URL}</span>.
				</p>
			{/if}
		</div>
	</Panel>

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
			{#if workshopHere}
				<Rocker
					label="Show the Workshop"
					hint="The grown-up view of the same bots and runs: full traces, filters, prompt diffs. Off by default."
					checked={preferences.workshop}
					onchange={(value) => preferences.setWorkshop(value)}
				/>
				{#if preferences.workshop}
					<!-- The lens (WP87, `78-LENSES.md` §3): whose question the Workshop's rail is ordered for. -->
					<label class="field lens-field">
						<span>Workshop lens</span>
						<select
							value={preferences.lens}
							onchange={(event) => preferences.setLens(event.currentTarget.value as LensId)}
							data-testid="settings-lens"
						>
							{#each LENSES as lens (lens.id)}
								<option value={lens.id}>{lens.name} — {lens.question}</option>
							{/each}
						</select>
						<small>A lens orders the rail and speaks its reader's words; it hides nothing.</small>
					</label>
				{/if}
			{:else if workshopSection}
				<p class="door-link" data-testid="workshop-door-link">
					The Workshop — the grown-up view of the same bots and runs — is in another box:
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- another section of the same host, not a route of this app -->
					<a href="{workshopSection.base}/">open {workshopSection.title}</a>. Export a bot here and
					import it there.
				</p>
			{/if}

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
			<p class="hint">Built in public, under the Apache License 2.0.</p>
			<p class="hint" data-testid="about-site">
				One half of an investigation: the thought experiment asks whether a small team can govern an
				AI bank; the simulator measures it.
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- an external page on the site, not a route of this app. -->
				<a href={SITE_FRAMING_PAGE}>Read the two side by side.</a>
			</p>
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
