<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import type {
		ExperimentResult,
		RunRecord,
		StoredCampaignReport,
		StoredWorkflowRun
	} from '@craftabot/core';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import { contentStore } from '$lib/state/content.svelte.js';
	import { preferences } from '$lib/state/preferences.svelte.js';
	import { paletteActions } from '$lib/workshop/actions.svelte.js';
	import { lensById } from '$lib/workshop/lens.js';
	import { paletteState } from '$lib/workshop/palette-state.svelte.js';
	import {
		artefactEntries,
		rankPalette,
		routeEntries,
		type PaletteEntry
	} from '$lib/workshop/palette.js';

	/**
	 * **The command palette** (WP109, `96-CONTROL-ROOM-V3.md` §2.1; `83-…`
	 * §6.7.1): `Ctrl+K` / `⌘K` from any Workshop route — every route on the
	 * lens's rail, every stored artefact by id or title, every action the
	 * screen has registered — fuzzy, keyboard-only. A combobox over a
	 * listbox: `↑`/`↓` move, `Enter` goes, `Escape` returns focus to where it
	 * was. The artefacts are read from the store when the dialog opens, so
	 * what it lists is what the store holds now.
	 */
	let query = $state('');
	let active = $state(0);
	let input = $state<HTMLInputElement | undefined>(undefined);
	let restoreTo: HTMLElement | undefined;
	let store = $state<{
		runs: RunRecord[];
		reports: StoredCampaignReport[];
		workflowRuns: StoredWorkflowRun[];
		experiments: ExperimentResult[];
	}>({ runs: [], reports: [], workflowRuns: [], experiments: [] });

	const lens = $derived(lensById(preferences.lens));
	const entries = $derived.by((): PaletteEntry[] => [
		...paletteActions.list.map((action): PaletteEntry => ({
			kind: 'action',
			id: `action:${action.id}`,
			title: action.title,
			hint: action.disabled ? `${action.screen} · not now` : action.screen,
			run: action.disabled ? undefined : action.run
		})),
		...routeEntries(lens),
		...artefactEntries({ ...store, content: contentStore.records }, lens)
	]);
	const shown = $derived(rankPalette(entries, query));

	async function load(): Promise<void> {
		const storage = await appStorage();
		const [runs, reports, workflowRuns, experiments] = await Promise.all([
			storage.listRuns(),
			storage.listCampaignReports(),
			storage.listWorkflowRuns(),
			storage.listExperimentResults()
		]);
		store = { runs, reports, workflowRuns, experiments };
	}

	$effect(() => {
		if (!paletteState.isOpen) return;
		restoreTo = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
		query = '';
		active = 0;
		void load();
		void tick().then(() => input?.focus());
	});

	$effect(() => {
		// The query changed: start from the top.
		void query;
		active = 0;
	});

	function close(): void {
		paletteState.close();
		restoreTo?.focus();
	}

	function go(entry: PaletteEntry | undefined): void {
		if (!entry) return;
		if (entry.run) {
			close();
			entry.run();
			return;
		}
		if (entry.href) {
			close();
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() builds the base path in hrefOf; its typed surface has no way to attach an artefact's query the rule can verify statically (the Pipeline's exception).
			void goto(hrefOf(entry.href));
		}
	}

	function onKey(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			close();
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			active = shown.length === 0 ? 0 : (active + 1) % shown.length;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			active = shown.length === 0 ? 0 : (active - 1 + shown.length) % shown.length;
		} else if (event.key === 'Enter') {
			event.preventDefault();
			go(shown[active]);
		}
	}

	/** `resolve` puts the host's base on the path and drops a search; the search goes back on. */
	const hrefOf = (href: string): string => {
		const at = href.indexOf('?');
		const path = at === -1 ? href : href.slice(0, at);
		return `${resolve(path as '/workshop')}${at === -1 ? '' : href.slice(at)}`;
	};

	const KIND_WORD: Record<PaletteEntry['kind'], string> = {
		action: 'action',
		route: 'go to',
		view: 'view',
		artefact: 'open'
	};
</script>

{#if paletteState.isOpen}
	<button
		type="button"
		class="scrim"
		aria-label="Close"
		tabindex="-1"
		onclick={close}
		data-testid="palette-scrim"
	></button>
	<div
		class="palette"
		role="dialog"
		aria-modal="true"
		aria-label="Go to"
		tabindex="-1"
		data-testid="command-palette"
		onkeydown={onKey}
	>
		<label class="field">
			<span class="visually-hidden">Route, artefact or action</span>
			<input
				bind:this={input}
				bind:value={query}
				type="text"
				role="combobox"
				aria-expanded="true"
				aria-controls="palette-options"
				aria-activedescendant={shown.length > 0 ? `palette-option-${active}` : undefined}
				aria-autocomplete="list"
				autocomplete="off"
				spellcheck="false"
				placeholder="Type a screen, an id, a title…"
				data-testid="palette-input"
			/>
		</label>
		<ul id="palette-options" role="listbox" aria-label="Matches" data-testid="palette-options">
			{#each shown as entry, index (entry.id)}
				<li
					id="palette-option-{index}"
					role="option"
					aria-selected={index === active}
					class:active={index === active}
					class:disabled={entry.kind === 'action' && !entry.run}
					data-testid="palette-option"
					data-kind={entry.kind}
					onmousedown={(event) => {
						event.preventDefault();
						go(entry);
					}}
				>
					<span class="kind">{KIND_WORD[entry.kind]}</span>
					<span class="title">{entry.title}</span>
					{#if entry.hint}<span class="hint">{entry.hint}</span>{/if}
				</li>
			{:else}
				<li class="empty" role="option" aria-selected="false" data-testid="palette-empty">
					Nothing matches “{query}”.
				</li>
			{/each}
		</ul>
		<p class="keys" aria-hidden="true">↑↓ move · Enter go · Esc close</p>
	</div>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 40;
		padding: 0;
		border: 0;
		background: color-mix(in srgb, var(--cab-ink) 45%, transparent);
	}

	.palette {
		position: fixed;
		top: 12vh;
		left: 50%;
		z-index: 41;
		width: min(640px, calc(100vw - 2 * var(--cab-space-4)));
		transform: translateX(-50%);
		display: grid;
		gap: var(--cab-space-2);
		padding: var(--cab-space-3);
		background: var(--cab-paper);
		color: var(--cab-ink);
		border: var(--cab-border-panel) solid var(--cab-ink);
		border-radius: var(--cab-radius-part);
		box-shadow: 0 12px 32px color-mix(in srgb, var(--cab-ink) 35%, transparent);
	}

	.field input {
		width: 100%;
		padding: var(--cab-space-2) var(--cab-space-3);
		font: inherit;
		font-size: var(--cab-text-base);
		border: 1.5px solid var(--cab-ink);
		border-radius: var(--cab-radius-part);
		background: var(--cab-cream);
		color: var(--cab-ink);
	}

	.field input:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	ul {
		display: grid;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
		max-height: 50vh;
		overflow-y: auto;
	}

	li {
		display: grid;
		grid-template-columns: 4.5rem minmax(0, 1fr);
		column-gap: var(--cab-space-2);
		align-items: baseline;
		padding: var(--cab-space-1) var(--cab-space-2);
		border-radius: var(--cab-radius-part);
		cursor: pointer;
	}

	li.active {
		background: var(--cab-ink);
		color: var(--cab-cream);
	}

	li.disabled {
		opacity: 0.6;
		cursor: default;
	}

	.kind {
		font-size: var(--cab-text-xs);
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.title {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.hint {
		grid-column: 2;
		font-size: var(--cab-text-xs);
		opacity: 0.8;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.empty {
		grid-template-columns: 1fr;
		cursor: default;
		font-size: var(--cab-text-sm);
	}

	.keys {
		margin: 0;
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted, var(--cab-ink));
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
