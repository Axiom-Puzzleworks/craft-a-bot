<script lang="ts">
	import { page } from '$app/state';
	import { afterNavigate, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		REVIEW_SUBJECT_KINDS,
		reviewSchema,
		reviewsFromContent,
		type ReviewVerdict
	} from '@craftabot/core';
	import {
		READING_KIND_LABELS,
		readingProgress,
		readingQueue,
		readingSubjects,
		type ReadingBlueprintNote,
		type ReadingItem
	} from '@craftabot/governance/reports';
	import Readout from '$lib/components/control-room/Readout.svelte';
	import Strip from '$lib/components/control-room/Strip.svelte';
	import { installedPacks } from '$lib/packs.js';
	import { contentStore } from '$lib/state/content.svelte.js';
	import { evidenceStoresStore } from '$lib/state/evidence.svelte.js';
	import { preferences } from '$lib/state/preferences.svelte.js';
	import { browserPrincipal, browserPrincipalId } from '$lib/state/principal.js';
	import { itemForReview } from '$lib/workshop/evidence.js';
	import {
		filterQueue,
		readingFilterFrom,
		readingFilterQuery,
		readingSources,
		readingWord,
		reviewFor,
		reviewRecord,
		type ReadingFilter,
		type ReadingFilterState
	} from '$lib/workshop/readings.js';

	/**
	 * **Readings** (WP129, `108-READINGS.md` §6; `100-…` §6.8, D21): the
	 * reading desk. Every subject a pack ships pending across the eight kinds —
	 * catalogue entries, calibration rows, control rows, decision rights,
	 * blueprint items, screening lists, error and reviewer models — with its
	 * source beside it and three buttons. A reading is a `review` record beside
	 * the row, never an edit to it; accepted or amended turns the row's check
	 * green, an amendment waits for a maintainer to edit it in. The filter lives
	 * in the URL, so a saved view holds it.
	 */
	/** The packs' subjects at once; the blueprint notes' when their chunk arrives (`blueprint-notes.ts`). */
	let blueprints = $state<readonly ReadingBlueprintNote[]>([]);
	$effect(() => {
		void import('$lib/workshop/blueprint-notes.js').then((module) => {
			blueprints = module.BLUEPRINT_NOTES;
		});
	});
	const subjects = $derived(readingSubjects(readingSources(installedPacks, blueprints)));
	const reviews = $derived(
		reviewsFromContent([...contentStore.of('review'), ...contentStore.of('control-review')])
	);
	const queue = $derived(readingQueue(subjects, reviews));
	const progress = $derived(readingProgress(queue));
	const open = $derived(progress.reduce((sum, row) => sum + row.open, 0));
	const read = $derived(progress.reduce((sum, row) => sum + row.read, 0));

	let filter = $state<ReadingFilter>(readingFilterFrom(page.url.searchParams));
	afterNavigate(() => {
		const fromUrl = readingFilterFrom(page.url.searchParams);
		if (readingFilterQuery(fromUrl) !== readingFilterQuery(filter)) filter = fromUrl;
	});
	function updateFilter(next: ReadingFilter): void {
		filter = next;
		const wanted = readingFilterQuery(next);
		if (wanted === page.url.search) return;
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() builds the base path; the filter is a query the typed surface cannot carry.
		replaceState(`${resolve('/workshop/readings')}${wanted}`, {});
	}
	const shown = $derived(filterQueue(queue, filter));
	const groups = $derived(
		REVIEW_SUBJECT_KINDS.map((kind) => ({
			kind,
			items: shown.filter((item) => item.subject.kind === kind)
		})).filter((group) => group.items.length > 0)
	);

	const needsName = $derived(preferences.displayName.trim() === '');
	/** The subject whose Amend or Reject form is open, and what it holds. */
	let editing = $state<{ key: string; verdict: 'amended' | 'rejected' } | undefined>(undefined);
	let field = $state('');
	let value = $state('');
	let note = $state('');
	let status = $state('');
	const keyOf = (item: ReadingItem) => `${item.subject.kind} ${item.subject.id}`;
	const testIdOf = (item: ReadingItem) =>
		`${item.subject.kind}-${item.subject.id}`.replace(/[^a-zA-Z0-9-]+/g, '-');

	function openForm(item: ReadingItem, verdict: 'amended' | 'rejected'): void {
		editing = { key: keyOf(item), verdict };
		field = verdict === 'amended' ? (item.review?.amendment?.field ?? '') : '';
		value = '';
		note = '';
	}

	async function record(item: ReadingItem, verdict: ReviewVerdict): Promise<void> {
		try {
			const review = reviewFor(
				item.subject,
				verdict,
				browserPrincipal(preferences.displayName),
				new Date().toISOString(),
				{ note, field, value }
			);
			await contentStore.save(reviewRecord(review));
			editing = undefined;
			status = `${item.title}: ${verdict}.`;
		} catch (error) {
			status = `Not recorded: ${error instanceof Error ? error.message : String(error)}`;
		}
	}

	async function push(item: ReadingItem): Promise<void> {
		const storeId = evidenceStoresStore.configurations[0]?.storeId ?? '';
		const instance = evidenceStoresStore.instance(storeId);
		if (!instance || !item.review) return;
		try {
			const receipt = await instance.push(
				// Parsed afresh: a plain object off the store's proxy (a snapshot of the recursive JSON type is too deep to type).
				await itemForReview(reviewSchema.parse(item.review), { principal: browserPrincipalId() })
			);
			status = `Pushed the reading of ${item.title} — digest ${receipt.digest.slice(0, 12)}….`;
		} catch (error) {
			status = `Could not push: ${error instanceof Error ? error.message : String(error)}`;
		}
	}

	/** The form's first field takes focus as it opens, so a keyboard reader types straight into it. */
	function focusOnMount(node: HTMLInputElement): void {
		node.focus();
	}

	const STATE_LABELS: Record<ReadingFilterState, string> = {
		open: 'Open (unread or rejected)',
		unread: 'Unread',
		accepted: 'Accepted',
		amended: 'Amended',
		rejected: 'Rejected',
		all: 'Everything'
	};
</script>

<svelte:head><title>Readings — Workshop</title></svelte:head>

<main data-testid="readings-page">
	<h1>Readings</h1>
	<p class="intro">
		What the packs ship <em>pending</em> until someone reads it against its source. A reading is a
		record beside the row, under your name, never an edit to it. <strong>Accept</strong> or
		<strong>Amend</strong> turns the row's check green; an amendment waits for a maintainer to edit
		it in. <strong>Reject</strong> keeps it red and says why. The maintainer's list is
		<code>craftabot readings export --format markdown</code>.
	</p>
	{#if needsName}
		<p class="warn" data-testid="readings-name">
			A reading goes on the record under your name. <a href={resolve('/settings')}
				>Set it in Settings</a
			> first, or it is filed under this browser's id alone.
		</p>
	{/if}

	<Strip label="Readings" icon="reading" testId="readings-strip">
		<Readout label="read" value={read} unit="of {queue.length}" testId="readings-read" />
		<Readout label="open" value={open} testId="readings-open" />
		{#each progress as row (row.kind)}
			<Readout
				label={READING_KIND_LABELS[row.kind]}
				value={row.read}
				unit="of {row.total}"
				testId="readings-{row.kind}"
			/>
		{/each}
	</Strip>

	<form class="filter" aria-label="Filter the queue" onsubmit={(event) => event.preventDefault()}>
		<label>
			Kind
			<select
				value={filter.kind ?? ''}
				onchange={(event) => {
					const kind = event.currentTarget.value;
					updateFilter({
						state: filter.state,
						...(kind === '' ? {} : { kind: kind as (typeof REVIEW_SUBJECT_KINDS)[number] })
					});
				}}
				data-testid="readings-kind"
			>
				<option value="">Every kind</option>
				{#each REVIEW_SUBJECT_KINDS as kind (kind)}
					<option value={kind}>{READING_KIND_LABELS[kind]}</option>
				{/each}
			</select>
		</label>
		<label>
			Show
			<select
				value={filter.state}
				onchange={(event) =>
					updateFilter({
						...(filter.kind ? { kind: filter.kind } : {}),
						state: event.currentTarget.value as ReadingFilterState
					})}
				data-testid="readings-state"
			>
				{#each Object.entries(STATE_LABELS) as [state, label] (state)}
					<option value={state}>{label}</option>
				{/each}
			</select>
		</label>
		<p class="muted" role="status" data-testid="readings-count">
			{shown.length} shown{status ? ` · ${status}` : ''}
		</p>
	</form>

	{#if groups.length === 0}
		<p class="muted" data-testid="readings-empty">Nothing here under this filter.</p>
	{/if}
	{#each groups as group (group.kind)}
		<section aria-labelledby="readings-h-{group.kind}">
			<h2 id="readings-h-{group.kind}">
				{READING_KIND_LABELS[group.kind]} <span class="muted">({group.items.length})</span>
			</h2>
			<ol class="queue">
				{#each group.items as item (keyOf(item))}
					<li class="subject" data-testid="reading-{testIdOf(item)}" data-state={item.state}>
						<div class="head">
							<h3>{item.title}</h3>
							<span class="where">{item.group} · <code>{item.subject.id}</code></span>
						</div>
						<dl class="source">
							{#each item.source as line, index (index)}
								<dt>{line.label}</dt>
								<dd>
									{#if line.url}
										<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- an external citation -->
										<a href={line.url} rel="external noopener" target="_blank">{line.value}</a>
									{:else}
										{line.value}
									{/if}
								</dd>
							{/each}
						</dl>
						<p class="reading state-{item.state}" data-testid="reading-word">
							{readingWord(item)}
						</p>
						<div class="buttons">
							<button type="button" onclick={() => record(item, 'accepted')}>Accept</button>
							<button type="button" onclick={() => openForm(item, 'amended')}>Amend…</button>
							<button type="button" onclick={() => openForm(item, 'rejected')}>Reject…</button>
							{#if evidenceStoresStore.configured && item.review}
								<button type="button" class="push" onclick={() => push(item)}>Push</button>
							{/if}
						</div>
						{#if editing?.key === keyOf(item)}
							<form
								class="edit"
								aria-label="{editing.verdict === 'amended' ? 'Amend' : 'Reject'} {item.title}"
								onsubmit={(event) => {
									event.preventDefault();
									void record(item, editing!.verdict);
								}}
							>
								{#if editing.verdict === 'amended'}
									<label>
										Field
										<input
											bind:value={field}
											use:focusOnMount
											required
											placeholder="distribution.25-34"
											data-testid="reading-field"
										/>
									</label>
									<label>
										Value
										<input bind:value required placeholder="0.18" data-testid="reading-value" />
									</label>
								{/if}
								<label>
									{editing.verdict === 'rejected' ? 'Why' : 'Note (optional)'}
									{#if editing.verdict === 'rejected'}
										<input bind:value={note} use:focusOnMount required data-testid="reading-note" />
									{:else}
										<input bind:value={note} data-testid="reading-note" />
									{/if}
								</label>
								<div class="buttons">
									<button type="submit" data-testid="reading-save"
										>{editing.verdict === 'amended'
											? 'Record the amendment'
											: 'Record the rejection'}</button
									>
									<button type="button" onclick={() => (editing = undefined)}>Cancel</button>
								</div>
							</form>
						{/if}
					</li>
				{/each}
			</ol>
		</section>
	{/each}
</main>

<style>
	main {
		display: grid;
		gap: var(--cab-space-4);
		align-content: start;
	}
	h1 {
		margin: 0;
		font-size: var(--cab-text-xl);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	h2 {
		margin: 0 0 var(--cab-space-2);
		font-size: var(--cab-text-md);
	}
	h3 {
		margin: 0;
		font-size: var(--cab-text-md);
	}
	.intro,
	.warn {
		margin: 0;
		max-width: 72ch;
		font-size: var(--cab-text-sm);
	}
	.warn {
		padding: var(--cab-space-2) var(--cab-space-3);
		background: var(--cab-cream);
		border: var(--cab-border-part) solid var(--cab-engrave);
		border-radius: var(--cab-radius-panel);
	}
	.muted {
		margin: 0;
		font-size: var(--cab-text-sm);
		color: var(--cab-ink-muted);
	}
	.filter {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-3);
		align-items: end;
	}
	.filter label,
	.edit label {
		display: grid;
		gap: var(--cab-space-1);
		font-size: var(--cab-text-sm);
	}
	.queue {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--cab-space-3);
	}
	.subject {
		display: grid;
		gap: var(--cab-space-2);
		padding: var(--cab-space-3);
		border: var(--cab-border-part) solid var(--cab-engrave);
		border-radius: var(--cab-radius-panel);
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-2);
		align-items: baseline;
	}
	.where {
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted);
		overflow-wrap: anywhere;
	}
	.source {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: var(--cab-space-1) var(--cab-space-3);
		margin: 0;
		font-size: var(--cab-text-sm);
	}
	.source dt {
		font-weight: 600;
	}
	.source dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.reading {
		margin: 0;
		font-size: var(--cab-text-sm);
	}
	.state-unread {
		color: var(--cab-ink-muted);
	}
	.state-rejected {
		font-weight: 600;
	}
	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-2);
	}
	.edit {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-3);
		align-items: end;
	}
</style>
