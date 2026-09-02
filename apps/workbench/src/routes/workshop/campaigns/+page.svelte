<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { AgentSpecV2, EngineEvent, StoredCampaignReport } from '@craftabot/core';
	import {
		campaignCells,
		campaignSchema,
		injectionBaseline,
		renderCampaignScorecard,
		renderJUnit,
		renderSarif,
		runCampaign,
		type Campaign,
		type CampaignCell,
		type CampaignReport
	} from '@craftabot/evals';
	import { installedPacks } from '$lib/packs.js';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import { contentStore } from '$lib/state/content.svelte.js';
	import { slugOf } from '@craftabot/core';
	import { persistRunSummary } from '$lib/state/run-summaries.js';
	import {
		envelopeFor,
		recordForCampaignCell,
		reportFrom,
		sliceId,
		slicesOf,
		type CampaignSlice
	} from '$lib/workshop/campaign-cells.js';

	/**
	 * **Campaigns** (`28-CAMPAIGNS.md` §4.9): a guardrail regression suite as
	 * a file, run here in the browser over the same `runCampaign` the harness
	 * and CI call — so a gate that is green here is green there.
	 *
	 * The campaign is edited as JSON, because that is what it *is*: the file
	 * CI runs. Load the shipped baseline, or import one, change what you
	 * like, run. Scripted cells only, for the Eval Matrix's reason — a live
	 * brain needs the campaign's own `budget` and a key, and the harness is
	 * where that runs. Traces stay in memory for this visit; a cell is
	 * persisted only when opened in the Run Lab, so a 320-cell campaign never
	 * evicts a child's scrapbook. The *report* is persisted every time, and
	 * listed here — it is the record of an experiment.
	 */

	let source = $state(JSON.stringify(injectionBaseline(), null, '\t'));
	let stored = $state<StoredCampaignReport[]>([]);
	let running = $state(false);
	let progress = $state({ done: 0, total: 0 });
	let report = $state<CampaignReport | undefined>(undefined);
	let fromStore = $state(false);
	let openSlice = $state<CampaignSlice | undefined>(undefined);
	let importNote = $state('');
	let saveNote = $state('');

	async function saveCampaign(): Promise<void> {
		if (!parsed.ok) return;
		const id = `local/campaigns/${slugOf(parsed.campaign.id)}`;
		await contentStore.save({
			id,
			kind: 'campaign',
			title: parsed.campaign.title,
			record: JSON.parse(source) as unknown,
			savedAt: new Date().toISOString(),
			schemaVersion: 1
		});
		saveNote = `Saved as ${id}.`;
	}

	function loadSaved(record: unknown): void {
		source = JSON.stringify(record, null, '\t');
		report = undefined;
	}
	type Trace = { events: readonly EngineEvent[]; spec: AgentSpecV2 };
	// Raw on purpose: hundreds of event arrays that never change once collected.
	let traces = $state.raw<Record<string, Trace>>({});

	const parsed = $derived.by<{ ok: true; campaign: Campaign } | { ok: false; message: string }>(
		() => {
			try {
				const result = campaignSchema.safeParse(JSON.parse(source));
				return result.success
					? { ok: true, campaign: result.data }
					: { ok: false, message: result.error.issues[0]?.message ?? 'invalid campaign' };
			} catch (error) {
				return { ok: false, message: error instanceof Error ? error.message : String(error) };
			}
		}
	);
	const size = $derived(parsed.ok ? campaignCells(parsed.campaign).length : 0);
	const hasLive = $derived(parsed.ok && parsed.campaign.brains.some((b) => b.tier === 'live'));
	const slices = $derived(report ? slicesOf(report) : []);
	const cardIds = $derived(
		report ? [...new Set(report.cells.flatMap((cell) => Object.keys(cell.assertions)))] : []
	);

	$effect(() => {
		void loadStored();
	});

	async function loadStored(): Promise<void> {
		const storage = await appStorage();
		stored = await storage.listCampaignReports();
	}

	function loadBaseline(): void {
		source = JSON.stringify(injectionBaseline(), null, '\t');
		importNote = '';
	}

	async function importFile(event: Event): Promise<void> {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		source = await file.text();
		importNote = parsed.ok
			? `Loaded ${file.name}.`
			: `${file.name} is not a campaign: ${parsed.ok ? '' : parsed.message}`;
	}

	async function execute(): Promise<void> {
		if (!parsed.ok || hasLive) return;
		running = true;
		openSlice = undefined;
		fromStore = false;
		traces = {};
		progress = { done: 0, total: size };
		const collected: Record<string, Trace> = {};
		try {
			const result = await runCampaign(parsed.campaign, {
				// A macrotask between cells, so the count can paint (the Eval Matrix's own lesson).
				betweenCells: () => new Promise((r) => setTimeout(r, 0)),
				packs: installedPacks,
				onCell: (_cell, done, total) => (progress = { done, total }),
				onTrace: (cell, trace) => {
					if (cell.runId) collected[cell.runId] = trace;
				}
			});
			traces = collected;
			report = result;
			const storage = await appStorage();
			await storage.putCampaignReport(envelopeFor(result));
			await loadStored();
		} finally {
			running = false;
		}
	}

	function openStored(row: StoredCampaignReport): void {
		const loaded = reportFrom(row);
		if (!loaded) return;
		report = loaded;
		fromStore = true;
		openSlice = undefined;
		traces = {};
	}

	async function openInRunLab(cell: CampaignCell): Promise<void> {
		const trace = cell.runId === undefined ? undefined : traces[cell.runId];
		if (!trace) return;
		const record = recordForCampaignCell(cell, trace.events, trace.spec);
		if (!record) return;
		const storage = await appStorage();
		await storage.putRun(record);
		await storage.appendEvents(record.id, trace.events);
		await persistRunSummary(storage, record.id, trace.events);
		await goto(resolve('/workshop/runs/[runId]', { runId: record.id }));
	}

	function download(text: string, filename: string, type = 'application/json'): void {
		const url = URL.createObjectURL(new Blob([text], { type }));
		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		link.click();
		URL.revokeObjectURL(url);
	}

	const pct = (value: number) => `${Math.round(value * 100)}%`;
	const short = (id: string) => id.replace(/^.*\//, '');
	const when = (iso: string) => new Date(iso).toLocaleString();
</script>

<svelte:head><title>Campaigns — Workshop</title></svelte:head>

<main>
	<h1>Campaigns</h1>

	<section class="editor" aria-label="The campaign">
		<div class="toolbar">
			<button type="button" data-testid="load-baseline" onclick={loadBaseline}>Load baseline</button
			>
			<label class="import">
				Import…
				<input
					type="file"
					accept="application/json,.json"
					data-testid="import-campaign"
					onchange={importFile}
				/>
			</label>
			{#if importNote}<span class="hint">{importNote}</span>{/if}
			<button type="button" disabled={!parsed.ok} data-testid="save-campaign" onclick={saveCampaign}
				>Save to your content</button
			>
			{#if saveNote}<span class="hint" data-testid="campaign-saved">{saveNote}</span>{/if}
			<div class="go">
				<p class="size" data-testid="campaign-size">
					{#if parsed.ok}{size} cells{:else}—{/if}
				</p>
				<button
					type="button"
					disabled={running || !parsed.ok || hasLive || size === 0}
					data-testid="run-campaign"
					onclick={execute}
				>
					{running ? `Running ${progress.done}/${progress.total}…` : 'Run campaign'}
				</button>
			</div>
		</div>
		<textarea
			bind:value={source}
			spellcheck="false"
			rows="14"
			aria-label="Campaign JSON"
			data-testid="campaign-source"></textarea>
		{#if !parsed.ok}
			<p class="problem" data-testid="campaign-problem">Not a campaign: {parsed.message}</p>
		{:else if hasLive}
			<p class="hint" data-testid="campaign-live">
				This campaign has a live brain. Live cells cost money and need a key; run it from the
				harness — <code>npm run craftabot -- campaign --file …</code> — with the campaign's own
				<code>budget</code>.
			</p>
		{/if}
		{#if contentStore.of('campaign').length > 0}
			<ul class="saved" data-testid="local-campaigns">
				{#each contentStore.of('campaign') as entry (entry.id)}
					<li data-testid="local-campaign-{entry.id}">
						{entry.title} <span class="hint">{entry.id}</span>
						<button type="button" onclick={() => loadSaved(entry.record)}>Load</button>
						<button type="button" onclick={() => contentStore.remove(entry.id)}>Delete</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if report}
		<section aria-label="Verdict">
			<h2>Verdict</h2>
			<p class="verdict" data-testid="campaign-verdict">
				<strong>{report.passed ? '✅ PASSED' : '❌ FAILED'}</strong>
				— {report.gates.filter((g) => g.passed).length} of {report.gates.length} gates ·
				{report.cells.length} cells · {report.campaignTitle}
				{#if fromStore}<em
						>(a stored report — cells cannot be opened without their traces; run it again to drill
						in)</em
					>{/if}
			</p>
			<div class="downloads">
				<button
					type="button"
					data-testid="download-report"
					onclick={() =>
						download(
							JSON.stringify(report, null, '\t'),
							`${report?.campaignId}.campaign-report.json`
						)}>Report JSON</button
				>
				<button
					type="button"
					data-testid="download-markdown"
					onclick={() =>
						report &&
						download(
							renderCampaignScorecard(report),
							`${report.campaignId}.scorecard.md`,
							'text/markdown'
						)}>Scorecard</button
				>
				<button
					type="button"
					data-testid="download-junit"
					onclick={() =>
						report &&
						download(renderJUnit(report), `${report.campaignId}.junit.xml`, 'application/xml')}
					>JUnit</button
				>
				<button
					type="button"
					data-testid="download-sarif"
					onclick={() =>
						report &&
						download(JSON.stringify(renderSarif(report), null, '\t'), `${report.campaignId}.sarif`)}
					>SARIF</button
				>
			</div>
		</section>

		<section aria-label="Gates">
			<h2>Gates</h2>
			<table data-testid="gates">
				<thead>
					<tr>
						<th scope="col">Gate</th>
						<th scope="col">Where</th>
						<th scope="col">Required</th>
						<th scope="col">Observed</th>
						<th scope="col">Cells</th>
						<th scope="col">Verdict</th>
					</tr>
				</thead>
				<tbody>
					{#each report.gates as gate (gate.id)}
						<tr data-testid="gate-{gate.id}" class:failed={!gate.passed}>
							<td class="mono">{gate.id}</td>
							<td class="mono">
								{gate.where
									? Object.entries(gate.where)
											.filter(([, v]) => v !== undefined)
											.map(([k, v]) => `${k}=${v}`)
											.join(' ')
									: 'all'}
							</td>
							<td>{gate.required}</td>
							<td class="num">
								{gate.observed === undefined
									? '—'
									: gate.kind === 'metric'
										? Math.round(gate.observed * 100) / 100
										: pct(gate.observed)}
							</td>
							<td class="num">{gate.cells}</td>
							<td>{gate.inconclusive ? '⚪ inconclusive' : gate.passed ? '✅ pass' : '❌ fail'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>

		<section aria-label="Cells">
			<h2>Cells</h2>
			<table data-testid="slices">
				<thead>
					<tr>
						<th scope="col">Scenario</th>
						<th scope="col">Guard</th>
						<th scope="col">Brain</th>
						<th scope="col">Cells</th>
						<th scope="col">Success</th>
						{#each cardIds as id (id)}<th scope="col" class="mono">{short(id)}</th>{/each}
						<th scope="col"></th>
					</tr>
				</thead>
				<tbody>
					{#each slices as slice (sliceId(slice))}
						<tr>
							<td class="mono">{slice.scenario}</td>
							<td class="mono">{slice.guard}</td>
							<td class="mono">{slice.brain}</td>
							<td class="num"
								>{slice.cells.length}{#if slice.errors > 0}
									<span class="problem">({slice.errors} errored)</span>{/if}</td
							>
							<td class="num">{pct(slice.successRate)}</td>
							{#each cardIds as id (id)}
								<td class="num">{pct(slice.assertionPassRates[id] ?? 0)}</td>
							{/each}
							<td>
								<button
									type="button"
									class="drill"
									data-testid="slice-{sliceId(slice)}"
									onclick={() => (openSlice = slice)}
								>
									runs
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>

		{#if openSlice}
			<section aria-label="The runs behind a slice">
				<h2>{openSlice.scenario} · {openSlice.guard} · {openSlice.brain}</h2>
				<table data-testid="slice-runs">
					<thead>
						<tr>
							<th scope="col">Seed</th>
							<th scope="col">Outcome</th>
							<th scope="col">Turns</th>
							{#each cardIds as id (id)}<th scope="col" class="mono">{short(id)}</th>{/each}
							<th scope="col"></th>
						</tr>
					</thead>
					<tbody>
						{#each openSlice.cells as cell (`${cell.seed}-${cell.runId ?? ''}`)}
							<tr>
								<td class="num">{cell.seed}</td>
								<td>{cell.error ? `error: ${cell.error}` : (cell.outcome ?? '—')}</td>
								<td class="num">{cell.metrics.ticksUsed}</td>
								{#each cardIds as id (id)}
									<td>{cell.assertions[id] ? '✅' : '❌'}</td>
								{/each}
								<td>
									{#if cell.runId && traces[cell.runId]}
										<button
											type="button"
											class="drill"
											data-testid="open-campaign-cell-{cell.seed}"
											onclick={() => openInRunLab(cell)}
										>
											Open in Run Lab
										</button>
									{:else}
										<span class="hint">no trace</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</section>
		{/if}
	{/if}

	<section aria-label="Stored reports">
		<h2>Stored reports</h2>
		{#if stored.length === 0}
			<p class="hint" data-testid="campaign-reports-empty">No campaign has been run here yet.</p>
		{:else}
			<table data-testid="campaign-reports">
				<thead>
					<tr>
						<th scope="col">When</th>
						<th scope="col">Campaign</th>
						<th scope="col">Gates</th>
						<th scope="col">Cells</th>
						<th scope="col">Verdict</th>
						<th scope="col"></th>
					</tr>
				</thead>
				<tbody>
					{#each stored as row (row.id)}
						<tr data-testid="campaign-report-{row.id}">
							<td>{when(row.createdAt)}</td>
							<td>{row.title}</td>
							<td class="num">{row.gatesPassed}/{row.gatesTotal}</td>
							<td class="num">{row.cells}</td>
							<td>{row.passed ? '✅ passed' : '❌ failed'}</td>
							<td>
								<button
									type="button"
									class="drill"
									data-testid="open-report-{row.id}"
									onclick={() => openStored(row)}
								>
									Open
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>
</main>

<style>
	main {
		display: grid;
		gap: var(--cab-space-4);
		align-content: start;
		max-width: 1100px;
	}

	h1 {
		margin: 0;
		font-size: var(--cab-text-xl);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	h2 {
		margin: 0 0 var(--cab-space-2);
		font-size: var(--cab-text-sm);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--cab-ink-muted);
	}

	section {
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-panel);
		padding: var(--cab-space-3);
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-2);
		align-items: center;
		margin-bottom: var(--cab-space-2);
	}

	.import {
		font-size: var(--cab-text-sm);
	}

	.import input {
		font-size: var(--cab-text-xs);
	}

	.go {
		margin-left: auto;
		display: flex;
		gap: var(--cab-space-2);
		align-items: center;
	}

	.size {
		margin: 0;
		font-size: var(--cab-text-sm);
		font-variant-numeric: tabular-nums;
	}

	textarea {
		width: 100%;
		box-sizing: border-box;
		font-family: var(--cab-font-mono);
		font-size: var(--cab-text-xs);
		color: var(--cab-ink);
		background: var(--cab-paper);
		border: 1px solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-part);
		padding: var(--cab-space-2);
	}

	.hint {
		margin: var(--cab-space-1) 0 0;
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted);
	}

	.problem {
		margin: var(--cab-space-1) 0 0;
		font-size: var(--cab-text-xs);
		color: var(--cab-red-text, var(--cab-ink));
	}

	.verdict {
		margin: 0;
		font-size: var(--cab-text-sm);
	}

	.verdict em {
		display: block;
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted);
	}

	.downloads {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-2);
		margin-top: var(--cab-space-2);
	}

	button,
	input {
		font: inherit;
		font-size: var(--cab-text-sm);
		padding: 2px var(--cab-space-2);
		color: var(--cab-ink);
		background: var(--cab-paper);
		border: 1px solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-part);
	}

	button {
		cursor: pointer;
	}

	button:disabled {
		cursor: not-allowed;
		color: var(--cab-ink-muted);
	}

	:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--cab-text-sm);
	}

	th,
	td {
		padding: var(--cab-space-1) var(--cab-space-2);
		text-align: left;
		border-bottom: 1px solid color-mix(in srgb, var(--cab-ink) 12%, transparent);
	}

	thead th {
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--cab-ink-muted);
		white-space: nowrap;
	}

	tr.failed td {
		font-weight: 600;
	}

	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.mono {
		font-family: var(--cab-font-mono);
		font-size: var(--cab-text-xs);
	}

	.drill {
		font-size: var(--cab-text-xs);
		white-space: nowrap;
	}
</style>
