<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		parseTraceFile,
		verifyTraceDigest,
		type GroupRunRecord,
		type RunRecord
	} from '@craftabot/core';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import { persistRunSummary } from '$lib/state/run-summaries.js';
	import {
		durationMs,
		facetsOf,
		filterRuns,
		groupRows,
		type RunFilter
	} from '$lib/workshop/run-filter.js';

	/**
	 * **The Run Browser** (`17-…` §4.3): every run the store holds, filterable,
	 * with a way in to the Run Lab.
	 *
	 * Reads the same `cab.runs` store the Kit's scrapbook reads (`15-…` §7 rule
	 * 1: no mode-private data models). What differs is what is shown — the
	 * scrapbook shows a child their adventures; this shows a practitioner the
	 * model that answered, the budget the run was held to, and the id they can
	 * quote in a bug report.
	 */

	let runs = $state<RunRecord[]>([]);
	/** WP29 (`23-…` §5.2, §10 stage F): loaded alongside `runs`, never filtered on its own. */
	let groupRuns = $state<GroupRunRecord[]>([]);
	let loaded = $state(false);
	let filter = $state<RunFilter>({});
	let importNote = $state<{ ok: boolean; text: string } | undefined>(undefined);
	/**
	 * Compare (`17-…` §4.3) takes exactly two — "side by side" reads as a pair,
	 * not an open set, and a third panel would not fit the promise of one
	 * shared scrubber driving everything on screen at once.
	 */
	let selected = $state<string[]>([]);

	const facets = $derived(facetsOf(runs));
	const shown = $derived(filterRuns(runs, filter));
	/**
	 * The table's actual rows: `shown`'s own filtered order, with a group
	 * episode's members nested under its own row (WP29, `23-…` §5.2). Filtering
	 * itself never learns groups exist — `shown` is exactly what it was before
	 * this field existed, and `groupRows` only re-shapes it for display.
	 */
	const rows = $derived(groupRows(shown, groupRuns));
	const compareHref = $derived(
		selected.length === 2
			? `${resolve('/workshop/compare')}?a=${encodeURIComponent(selected[0] ?? '')}&b=${encodeURIComponent(selected[1] ?? '')}`
			: undefined
	);

	$effect(() => {
		void load();
	});

	async function load(): Promise<void> {
		const storage = await appStorage();
		runs = await storage.listRuns();
		groupRuns = await storage.listGroupRuns();
		loaded = true;
	}

	async function togglePin(run: RunRecord): Promise<void> {
		const storage = await appStorage();
		await storage.setRunPinned(run.id, !run.pinned);
		await load();
	}

	async function toggleGroupPin(group: GroupRunRecord): Promise<void> {
		const storage = await appStorage();
		await storage.setGroupRunPinned(group.id, !group.pinned);
		await load();
	}

	/** A third check bumps the first off — never blocks a new pick with a full basket. */
	function toggleSelect(runId: string, checked: boolean): void {
		if (checked) {
			selected = selected.includes(runId) ? selected : [...selected.slice(-1), runId];
		} else {
			selected = selected.filter((id) => id !== runId);
		}
	}

	/**
	 * Import a trace someone else exported.
	 *
	 * **A trace that fails verification is imported anyway, and said so.** The
	 * instinct is to refuse it, and it is wrong: inspecting a trace that does not
	 * match its digest is exactly what a forensic tool is for. Refusing would
	 * mean the only artefact you cannot examine is the one worth examining. The
	 * result is surfaced on the row and never silently swallowed (`17-…` §4.3 —
	 * "digest verification surfaced").
	 */
	async function importTrace(event: Event): Promise<void> {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;

		try {
			const trace = parseTraceFile(JSON.parse(await file.text()));
			const verified = await verifyTraceDigest(trace);
			const storage = await appStorage();
			await storage.putRun(trace.run);
			await storage.appendEvents(trace.run.id, trace.events);
			await persistRunSummary(storage, trace.run.id, trace.events);
			await load();
			importNote = verified
				? { ok: true, text: `Imported ${trace.run.agentName}'s run — digest verified.` }
				: {
						ok: false,
						text: `Imported ${trace.run.agentName}'s run, but the digest does not match its events. Treat its contents as unverified.`
					};
		} catch (error) {
			importNote = {
				ok: false,
				text: `That file is not a trace this app can read: ${error instanceof Error ? error.message : String(error)}`
			};
		}
	}

	const when = (iso: string) => new Date(iso).toLocaleString();
	const seconds = (record: { startedAt: string; finishedAt?: string | undefined }) => {
		const ms = durationMs(record);
		return ms === undefined ? '—' : `${(ms / 1000).toFixed(1)}s`;
	};
	const clear = () => (filter = {});
	/** `''` is the "any" option; the filter wants the key absent, not empty. */
	const pick = (value: string) => (value === '' ? undefined : value);
</script>

<svelte:head><title>Runs — Workshop</title></svelte:head>

<main>
	<header>
		<h1>Runs</h1>
		<label class="import">
			Import trace…
			<input
				type="file"
				accept=".json,application/json"
				data-testid="import-trace"
				onchange={importTrace}
			/>
		</label>
	</header>

	{#if importNote}
		<p class="note" class:note--bad={!importNote.ok} role="status" data-testid="import-note">
			{importNote.text}
		</p>
	{/if}

	<div class="filters" data-testid="run-filters">
		<label>
			Search
			<input
				type="search"
				placeholder="bot, card, model, run id"
				data-testid="filter-text"
				value={filter.text ?? ''}
				oninput={(e) => (filter = { ...filter, text: e.currentTarget.value })}
			/>
		</label>

		<label>
			Bot
			<select
				data-testid="filter-bot"
				onchange={(e) => (filter = { ...filter, agentId: pick(e.currentTarget.value) })}
			>
				<option value="">Any</option>
				{#each facets.bots as bot (bot.id)}<option value={bot.id}>{bot.label}</option>{/each}
			</select>
		</label>

		<label>
			Card
			<select
				data-testid="filter-card"
				onchange={(e) => (filter = { ...filter, goalCardId: pick(e.currentTarget.value) })}
			>
				<option value="">Any</option>
				{#each facets.cards as card (card)}<option value={card}>{card}</option>{/each}
			</select>
		</label>

		<label>
			Outcome
			<select
				data-testid="filter-outcome"
				onchange={(e) => (filter = { ...filter, outcome: pick(e.currentTarget.value) })}
			>
				<option value="">Any</option>
				{#each facets.outcomes as outcome (outcome)}<option value={outcome}>{outcome}</option
					>{/each}
			</select>
		</label>

		<label class="check">
			<input
				type="checkbox"
				data-testid="filter-pinned"
				checked={filter.pinnedOnly === true}
				onchange={(e) => (filter = { ...filter, pinnedOnly: e.currentTarget.checked })}
			/>
			Pinned only
		</label>

		<button type="button" onclick={clear} data-testid="filter-clear">Clear</button>
	</div>

	<p class="count" data-testid="run-count">
		{shown.length} of {runs.length}
		{runs.length === 1 ? 'run' : 'runs'}
	</p>

	<p class="compare" data-testid="compare-bar">
		{#if compareHref}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() builds the base path here (see compareHref above); its typed surface has no way to attach the ?a=&b= query the rule can verify statically. -->
			<a href={compareHref} data-testid="compare-selected">Compare selected runs</a>
		{:else}
			<span class="hint">Check two runs to compare them side by side.</span>
		{/if}
	</p>

	{#if !loaded}
		<p class="empty">Reading the run store…</p>
	{:else if runs.length === 0}
		<p class="empty" data-testid="runs-empty">
			No runs stored yet. Play a run in the Kit and it will appear here.
		</p>
	{:else if shown.length === 0}
		<!-- Distinct from an empty store on purpose: one means "nothing here", the
		     other means "your filter is hiding it". -->
		<p class="empty" data-testid="runs-filtered-out">
			No run matches those filters. <button type="button" onclick={clear}>Clear them</button>
		</p>
	{:else}
		<table data-testid="run-table">
			<thead>
				<tr>
					<th scope="col"><span class="visually-hidden">Compare</span></th>
					<th scope="col"><span class="visually-hidden">Pinned</span></th>
					<th scope="col">Started</th>
					<th scope="col">Bot</th>
					<th scope="col">Card</th>
					<th scope="col">Outcome</th>
					<th scope="col">Turns</th>
					<th scope="col">Took</th>
					<th scope="col">Model</th>
					<th scope="col">Tokens</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as row (row.kind === 'group' ? row.group.id : row.run.id)}
					{#if row.kind === 'group'}
						<!-- The episode's own row (WP29, `23-…` §5.2) — a group has no
						     single bot or model, so those columns say so instead of lying
						     with one member's. -->
						<tr class="group-row" data-testid="group-row-{row.group.id}">
							<td></td>
							<td>
								<button
									type="button"
									class="pin"
									aria-pressed={row.group.pinned}
									title={row.group.pinned ? 'Unpin this episode' : 'Pin this episode'}
									data-testid="pin-group-{row.group.id}"
									onclick={() => toggleGroupPin(row.group)}
								>
									<span aria-hidden="true">{row.group.pinned ? '★' : '☆'}</span>
									<span class="visually-hidden">{row.group.pinned ? 'Pinned' : 'Not pinned'}</span>
								</button>
							</td>
							<td class="when">{when(row.group.startedAt)}</td>
							<td>
								<a href={resolve('/workshop/runs/[runId]', { runId: row.group.id })}>
									{row.members.length}-robot episode
								</a>
							</td>
							<td class="mono">{row.group.goalCardId}</td>
							<td
								><span class="outcome" data-outcome={row.group.outcome}>{row.group.outcome}</span
								></td
							>
							<td class="num">{row.group.rounds}<span class="of">rounds</span></td>
							<td class="num"
								>{seconds({ startedAt: row.group.startedAt, finishedAt: row.group.finishedAt })}</td
							>
							<td class="mono">—</td>
							<td class="num">{row.group.usage.inputTokens + row.group.usage.outputTokens}</td>
						</tr>
						{#each row.members as member (member.id)}
							<tr data-testid="run-row-{member.id}" class="member-row">
								<td>
									<input
										type="checkbox"
										aria-label="Select {member.agentName}'s run for comparison"
										data-testid="compare-check-{member.id}"
										checked={selected.includes(member.id)}
										onchange={(e) => toggleSelect(member.id, e.currentTarget.checked)}
									/>
								</td>
								<td>
									<button
										type="button"
										class="pin"
										aria-pressed={member.pinned}
										title={member.pinned ? 'Unpin this run' : 'Pin this run'}
										data-testid="pin-{member.id}"
										onclick={() => togglePin(member)}
									>
										<span aria-hidden="true">{member.pinned ? '★' : '☆'}</span>
										<span class="visually-hidden">{member.pinned ? 'Pinned' : 'Not pinned'}</span>
									</button>
								</td>
								<td class="when">{when(member.startedAt)}</td>
								<td class="indent">
									<a href={resolve('/workshop/runs/[runId]', { runId: member.id })}
										>↳ {member.agentName}</a
									>
								</td>
								<td class="mono">{member.goalCardId}</td>
								<td><span class="outcome" data-outcome={member.outcome}>{member.outcome}</span></td>
								<td class="num">{member.ticks}<span class="of">/{member.budgets.maxTicks}</span></td
								>
								<td class="num">{seconds(member)}</td>
								<td class="mono">{member.wireModel}</td>
								<td class="num">{member.usage.inputTokens + member.usage.outputTokens}</td>
							</tr>
						{/each}
					{:else}
						{@const run = row.run}
						<tr data-testid="run-row-{run.id}">
							<td>
								<input
									type="checkbox"
									aria-label="Select {run.agentName}'s run for comparison"
									data-testid="compare-check-{run.id}"
									checked={selected.includes(run.id)}
									onchange={(e) => toggleSelect(run.id, e.currentTarget.checked)}
								/>
							</td>
							<td>
								<button
									type="button"
									class="pin"
									aria-pressed={run.pinned}
									title={run.pinned ? 'Unpin this run' : 'Pin this run'}
									data-testid="pin-{run.id}"
									onclick={() => togglePin(run)}
								>
									<span aria-hidden="true">{run.pinned ? '★' : '☆'}</span>
									<span class="visually-hidden">{run.pinned ? 'Pinned' : 'Not pinned'}</span>
								</button>
							</td>
							<td class="when">{when(run.startedAt)}</td>
							<td>
								<a href={resolve('/workshop/runs/[runId]', { runId: run.id })}>{run.agentName}</a>
							</td>
							<td class="mono">{run.goalCardId}</td>
							<td><span class="outcome" data-outcome={run.outcome}>{run.outcome}</span></td>
							<td class="num">{run.ticks}<span class="of">/{run.budgets.maxTicks}</span></td>
							<td class="num">{seconds(run)}</td>
							<td class="mono">{run.wireModel}</td>
							<td class="num">{run.usage.inputTokens + run.usage.outputTokens}</td>
						</tr>
					{/if}
				{/each}
			</tbody>
		</table>
	{/if}
</main>

<style>
	main {
		display: grid;
		gap: var(--cab-space-3);
		align-content: start;
	}

	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--cab-space-4);
	}

	h1 {
		margin: 0;
		font-size: var(--cab-text-xl);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.import {
		font-size: var(--cab-text-sm);
		cursor: pointer;
	}

	.import input {
		display: block;
		margin-top: var(--cab-space-1);
		font-size: var(--cab-text-xs);
	}

	.note {
		margin: 0;
		padding: var(--cab-space-2) var(--cab-space-3);
		font-size: var(--cab-text-sm);
		background: var(--cab-cream);
		border-left: 3px solid var(--cab-scope);
	}

	/* Ink on cream either way; the rule is the marker, never colour alone. */
	.note--bad {
		border-left-color: var(--cab-red);
		font-weight: 600;
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--cab-space-3);
		padding: var(--cab-space-3);
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-panel);
	}

	.filters label {
		display: grid;
		gap: 2px;
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--cab-ink-muted);
	}

	.filters .check {
		display: flex;
		align-items: center;
		gap: var(--cab-space-1);
		text-transform: none;
		letter-spacing: 0;
		font-size: var(--cab-text-sm);
		color: var(--cab-ink);
	}

	input,
	select,
	button {
		font: inherit;
		font-size: var(--cab-text-sm);
		padding: 2px var(--cab-space-1);
		color: var(--cab-ink);
		background: var(--cab-paper);
		border: 1px solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-part);
	}

	button {
		cursor: pointer;
	}

	:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	.count,
	.empty {
		margin: 0;
		font-size: var(--cab-text-sm);
		color: var(--cab-ink-muted);
	}

	.compare {
		margin: 0;
		font-size: var(--cab-text-sm);
	}

	.compare .hint {
		color: var(--cab-ink-muted);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--cab-text-sm);
		background: var(--cab-cream);
	}

	th,
	td {
		padding: var(--cab-space-1) var(--cab-space-2);
		text-align: left;
		border-bottom: 1px solid color-mix(in srgb, var(--cab-ink) 15%, transparent);
	}

	th {
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--cab-ink-muted);
		white-space: nowrap;
	}

	.mono {
		font-family: var(--cab-font-mono);
		font-size: var(--cab-text-xs);
	}

	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.of {
		color: var(--cab-ink-muted);
	}

	.when {
		white-space: nowrap;
	}

	/*
	 * The episode's own row (WP29, `23-…` §5.2) — a tint, not just a rule,
	 * because a group row sits directly above the member rows it introduces
	 * and needs to read as the thing they belong to, not as one more row.
	 */
	.group-row {
		background: color-mix(in srgb, var(--cab-scope) 8%, transparent);
		font-weight: 600;
	}

	.member-row .indent {
		padding-left: var(--cab-space-4);
		font-weight: 400;
	}

	.outcome {
		font-size: var(--cab-text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
	}

	/*
	 * The outcome is a word first. `04-…` §7 — never colour alone — and here the
	 * word *is* the whole cell, so the colour is doing nothing but reinforcing.
	 */
	.outcome[data-outcome='SUCCESS'] {
		color: var(--cab-green-text);
	}

	.outcome[data-outcome='STOPPED_BY_GUARDRAIL'] {
		color: var(--cab-red-text);
	}

	.pin {
		border: 0;
		background: none;
		padding: 0 2px;
		cursor: pointer;
	}

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
</style>
