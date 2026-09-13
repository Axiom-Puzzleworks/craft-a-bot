<script lang="ts">
	import { preferences } from '$lib/state/preferences.svelte.js';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { contentStore } from '$lib/state/content.svelte.js';
	import { paletteState } from '$lib/workshop/palette-state.svelte.js';
	import { captureOpener, returnFocus } from '$lib/a11y/return-focus.js';
	import { viewFromUrl, viewHref, viewsFor } from '$lib/workshop/views.js';
	import { routePath } from '$lib/edition.js';
	import {
		LENSES,
		RAIL_HREF,
		lensById,
		railLabel,
		type Density,
		type LensId
	} from '$lib/workshop/lens.js';

	/**
	 * The Workshop's persistent left rail (`17-…` §2).
	 *
	 * Built from a list rather than hand-written links because the information
	 * architecture grew, screen by screen, from one built entry to every one
	 * of them (`17-…` §4.7–§4.9's own retrofits) — a rail that silently
	 * omitted an unbuilt screen would misrepresent the product, and one that
	 * linked to it early would be lying about what is there. `spec` is the
	 * one entry that stays a non-link permanently by design, not because it
	 * is unbuilt: the Spec Lab has no screen of its own, it is always about a
	 * particular bot, so the rail says how to reach it rather than pretending
	 * it is missing.
	 */
	interface Props {
		current:
			| 'runs'
			| 'dashboard'
			| 'spec'
			| 'evals'
			| 'policies'
			| 'bench'
			| 'telemetry'
			| 'monitor'
			| 'conduct'
			| 'model-risk'
			| 'experiments'
			| 'incidents'
			| 'safety-case'
			| 'assurance'
			| 'catalogue'
			| 'export'
			| 'armour'
			| 'studio'
			| 'evaluators'
			| 'scenarios'
			| 'sinks'
			| 'evidence'
			| 'campaigns'
			| 'workflows'
			| 'playground';
	}

	let { current }: Props = $props();

	/**
	 * The rail under a lens (WP87, `78-LENSES.md` §3): the same destinations,
	 * grouped and ordered for the reader's question, labelled in the lens's
	 * words; a switcher at the top; the engineer's lens is the rail as it
	 * was. A lens hides nothing — every group is drawn, the reader's first.
	 */
	const lens = $derived(lensById(preferences.lens));
	const groups = $derived(
		lens.rail.map((group) => ({
			group: group.group,
			entries: group.routes.map((id) => ({ id, label: railLabel(lens, id), href: RAIL_HREF[id] }))
		}))
	);

	/** WP109 (`96-CONTROL-ROOM-V3.md` §2.2): the lens's saved views, and the form that saves the current URL as one. */
	const views = $derived(viewsFor(contentStore.records, lens.id));
	let savingView = $state(false);
	let viewTitle = $state('');
	/** WP110: the form is a small drawer; when it closes, focus returns to the button that opened it. */
	let saveOpener: HTMLElement | undefined;
	$effect(() => {
		if (savingView) saveOpener = captureOpener();
		else returnFocus(saveOpener);
	});
	async function saveView(): Promise<void> {
		const title = viewTitle.trim();
		if (!title) return;
		// The browser's URL, not `page.url`: a screen's `replaceState` (the Run Browser's filter) lands in the former first.
		await contentStore.save(viewFromUrl(lens.id, new URL(location.href), title, routePath));
		viewTitle = '';
		savingView = false;
	}
	const isCurrentView = (href: string): boolean =>
		`${routePath(page.url.pathname)}${page.url.search}` === href ||
		(typeof location !== 'undefined' &&
			`${routePath(location.pathname)}${location.search}` === href);
	const setDensity = (value: Density) => preferences.setDensity(value);
	/** `resolve` puts the base on the route and drops a search; the view's search goes back on. */
	const hrefOf = (view: { route: string; search: string }): string =>
		`${resolve(view.route as '/workshop')}${view.search}`;
</script>

<nav class="rail" aria-label="Workshop">
	<span class="mark">CRAFT A BOT<em>workshop</em></span>
	<label class="lens">
		<span>Lens</span>
		<select
			value={lens.id}
			onchange={(event) => preferences.setLens(event.currentTarget.value as LensId)}
			data-testid="lens-switcher"
			aria-label="Lens"
		>
			{#each LENSES as entry (entry.id)}
				<option value={entry.id}>{entry.name} — {entry.question}</option>
			{/each}
		</select>
	</label>
	{#each groups as group (group.group)}
		<!-- WP110: each group a labelled section of the nav landmark. -->
		<section class="rail-group" aria-label={group.group}>
			{#if lens.rail.length > 1}
				<h2 class="group" data-testid="rail-group-{group.group.toLowerCase().replaceAll(' ', '-')}">
					{group.group}
				</h2>
			{/if}
			<ul>
				{#each group.entries as destination (destination.id)}
					<li>
						{#if destination.href}
							<a
								href={resolve(
									destination.href as
										| '/workshop'
										| '/workshop/runs'
										| '/workshop/evals'
										| '/workshop/policies'
										| '/workshop/bench'
										| '/workshop/telemetry'
										| '/workshop/monitor'
										| '/workshop/conduct'
										| '/workshop/model-risk'
										| '/workshop/experiments'
										| '/workshop/incidents'
										| '/workshop/safety-case'
										| '/workshop/assurance'
										| '/workshop/catalogue'
										| '/workshop/export'
										| '/workshop/armour'
										| '/workshop/studio'
										| '/workshop/evaluators'
										| '/workshop/scenarios'
										| '/workshop/sinks'
										| '/workshop/campaigns'
										| '/workshop/workflows'
										| '/workshop/evidence'
										| '/workshop/playground'
								)}
								aria-current={current === destination.id ? 'page' : undefined}
								data-testid="rail-{destination.id}">{destination.label}</a
							>
						{:else}
							<!-- Not a link, and it says why: the Spec Lab is always about a particular bot. -->
							<span class="pending" data-testid="rail-{destination.id}"
								>{destination.label}<em>per bot</em></span
							>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/each}
	<section class="views" aria-label="Saved views" data-testid="rail-views">
		<h2 class="group">Views</h2>
		{#if views.length === 0}
			<p class="none" data-testid="rail-views-none">None saved for this lens.</p>
		{:else}
			<ul>
				{#each views as view (view.id)}
					<li class="view">
						<!-- eslint-disable svelte/no-navigation-without-resolve -- resolve() builds the base path in hrefOf; its typed surface has no way to attach the view's query the rule can verify statically (the Pipeline's exception). -->
						<a
							href={hrefOf(view)}
							aria-current={isCurrentView(viewHref(view)) ? 'page' : undefined}
							data-testid="rail-view-{view.id.slice('local/views/'.length)}">{view.title}</a
						>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
						<button
							type="button"
							class="remove"
							aria-label="Remove the view {view.title}"
							data-testid="rail-view-remove-{view.id.slice('local/views/'.length)}"
							onclick={() => void contentStore.remove(view.id)}>×</button
						>
					</li>
				{/each}
			</ul>
		{/if}
		{#if savingView}
			<form
				class="save"
				onsubmit={(event) => {
					event.preventDefault();
					void saveView();
				}}
			>
				<label>
					<span class="visually-hidden">The view's name</span>
					<input
						type="text"
						bind:value={viewTitle}
						placeholder="Name this view"
						data-testid="rail-view-title"
						required
					/>
				</label>
				<button type="submit" data-testid="rail-view-save-confirm">Save</button>
				<button type="button" onclick={() => (savingView = false)}>Cancel</button>
			</form>
		{:else}
			<button
				type="button"
				class="save-view"
				data-testid="rail-view-save"
				onclick={() => (savingView = true)}>Save this view</button
			>
		{/if}
	</section>
	<div class="tools">
		<button
			type="button"
			class="goto"
			data-testid="rail-palette"
			onclick={() => paletteState.open()}
		>
			Go to… <kbd>Ctrl K</kbd>
		</button>
		<fieldset class="density" data-testid="rail-density">
			<legend>Density</legend>
			<label
				><input
					type="radio"
					name="density"
					value="comfortable"
					checked={preferences.density === 'comfortable'}
					onchange={() => setDensity('comfortable')}
					data-testid="density-comfortable"
				/>Comfortable</label
			>
			<label
				><input
					type="radio"
					name="density"
					value="dense"
					checked={preferences.density === 'dense'}
					onchange={() => setDensity('dense')}
					data-testid="density-dense"
				/>Dense</label
			>
		</fieldset>
	</div>
	<a class="back" href={resolve('/')}>← The Kit</a>
</nav>

<style>
	.rail {
		display: flex;
		flex-direction: column;
		gap: var(--cab-space-4);
		padding: var(--cab-space-4) var(--cab-space-3);
		min-width: 152px;
		background: var(--cab-panel);
		border-right: var(--cab-border-panel) solid var(--cab-ink);
	}

	.mark {
		display: grid;
		font-size: var(--cab-text-xs);
		font-weight: 700;
		letter-spacing: 0.1em;
		color: var(--cab-cream);
	}

	.lens {
		display: grid;
		gap: 2px;
		font-size: var(--cab-text-xs);
		color: var(--cab-cream-muted);
	}

	.lens select {
		max-width: 100%;
		font-size: var(--cab-text-xs);
	}

	.group {
		margin: var(--cab-space-2) 0 0;
		font-size: var(--cab-text-xs);
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--cab-cream-muted);
	}

	.mark em {
		font-style: normal;
		font-weight: 400;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--cab-cream-muted);
	}

	ul {
		display: grid;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	a,
	.pending {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--cab-space-2);
		padding: var(--cab-space-2);
		font-size: var(--cab-text-sm);
		border-radius: var(--cab-radius-part);
		text-decoration: none;
	}

	a {
		color: var(--cab-cream);
	}

	a[aria-current='page'] {
		background: var(--cab-cream);
		color: var(--cab-ink);
		font-weight: 600;
	}

	a:hover:not([aria-current='page']) {
		background: color-mix(in srgb, var(--cab-cream) 20%, transparent);
	}

	a:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	/*
	 * A muted token, not a dimmed one (`04-…` §2.3). The label still has to be
	 * readable — it is telling you what the product will be.
	 */
	.pending {
		color: var(--cab-cream-muted);
	}

	.pending em {
		font-style: normal;
		font-size: var(--cab-text-xs);
		letter-spacing: 0.06em;
	}

	.back {
		margin-top: auto;
		font-size: var(--cab-text-xs);
	}

	.rail-group {
		display: grid;
		gap: 2px;
	}

	/* WP109: the views, the palette's door and the density switch. */
	.views {
		display: grid;
		gap: 2px;
	}

	.views .none {
		margin: 0;
		font-size: var(--cab-text-xs);
		color: var(--cab-cream-muted);
	}

	.view {
		display: flex;
		align-items: baseline;
		gap: 2px;
	}

	.view a {
		flex: 1;
		min-width: 0;
	}

	.remove,
	.save-view,
	.goto,
	.save button {
		font: inherit;
		font-size: var(--cab-text-xs);
		padding: 2px var(--cab-space-2);
		color: var(--cab-cream);
		background: transparent;
		border: 1px solid var(--cab-cream-muted);
		border-radius: var(--cab-radius-part);
		cursor: pointer;
	}

	.remove {
		border: 0;
		padding: 2px 4px;
	}

	.save {
		display: grid;
		gap: 2px;
	}

	.save input {
		width: 100%;
		font: inherit;
		font-size: var(--cab-text-xs);
	}

	.tools {
		display: grid;
		gap: var(--cab-space-2);
	}

	.goto {
		display: flex;
		justify-content: space-between;
		gap: var(--cab-space-2);
		text-align: left;
	}

	.goto kbd {
		font-size: var(--cab-text-xs);
		color: var(--cab-cream-muted);
	}

	.density {
		display: grid;
		gap: 2px;
		margin: 0;
		padding: var(--cab-space-1) var(--cab-space-2);
		border: 1px solid var(--cab-cream-muted);
		border-radius: var(--cab-radius-part);
		font-size: var(--cab-text-xs);
		color: var(--cab-cream);
	}

	.density legend {
		padding: 0 2px;
		color: var(--cab-cream-muted);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.density label {
		display: flex;
		gap: var(--cab-space-1);
		align-items: center;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
