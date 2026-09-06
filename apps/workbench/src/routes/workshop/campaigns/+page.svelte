<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		caretRangesFor,
		brickKindsFor,
		buildKitFile,
		localContentReferencedBy,
		type AgentRecord,
		type AgentSpecV2,
		type EngineEvent,
		type StoredCampaignReport
	} from '@craftabot/core';
	import {
		campaignCells,
		campaignSchema,
		injectionBaseline,
		renderCampaignScorecard,
		renderJUnit,
		renderSarif,
		runCampaign,
		summariseCampaign,
		type Campaign,
		type CampaignCell,
		type CampaignReport,
		type ConfusionMatrix
	} from '@craftabot/evals';
	import CaseTable from '$lib/components/control-room/CaseTable.svelte';
	import Matrix from '$lib/components/control-room/Matrix.svelte';
	import Lamp from '$lib/components/control-room/Lamp.svelte';
	import Meter from '$lib/components/control-room/Meter.svelte';
	import { createRegistry, installedPacks, packVersions } from '$lib/packs.js';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import { contentStore } from '$lib/state/content.svelte.js';
	import { slugOf } from '@craftabot/core';
	import { persistRunSummary } from '$lib/state/run-summaries.js';
	import { evidenceStoresStore } from '$lib/state/evidence.svelte.js';
	import { browserPrincipalId } from '$lib/state/principal.js';
	import { itemForReport } from '$lib/workshop/evidence.js';
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
	/** The shelf, for "add a bot as a build" (WP49, `37-…` §4.2). */
	let agents = $state<AgentRecord[]>([]);
	let shelfPick = $state('');

	/**
	 * A shelf bot as a `kit` build: the same kit file the Kit exports, with
	 * the bot's own id inside, so the report can be held against its safety
	 * case. Appended to the JSON in the editor — the campaign stays the file
	 * CI would run, with one more build in it.
	 */
	function addShelfBot(): void {
		if (!parsed.ok || !shelfPick) return;
		const found = agents.find((agent) => agent.id === shelfPick);
		if (!found) return;
		// A plain copy: the shelf is reactive state, and the kit builder clones the spec it is handed.
		const record = $state.snapshot(found);
		try {
			const kit = buildKitFile(record.spec, {
				exportedBy: 'craftabot-workbench/0.0.1',
				requires: {
					core: '>=0.0.1',
					packs: caretRangesFor(packVersions()),
					brickKinds: brickKindsFor(record.spec, createRegistry())
				},
				// The bot's own cards travel with it (WP46), exactly as the shelf's export sends them.
				localContent: localContentReferencedBy(record.spec)
					.map((cardId) => contentStore.records.find((entry) => entry.id === cardId))
					.filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)
			});
			const id = `shelf-${slugOf(record.spec.name)}`;
			const campaign = {
				...parsed.campaign,
				builds: [
					...parsed.campaign.builds.filter((build) => build.id !== id),
					{ id, base: { kind: 'kit', kit } }
				]
			};
			source = JSON.stringify(campaign, null, '\t');
			importNote = `Added ${record.spec.name} as build ${id}.`;
		} catch (error) {
			importNote = `Could not add ${record.spec.name}: ${error instanceof Error ? error.message : String(error)}`;
		}
	}

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
	/**
	 * The readers' numbers (WP61, `50-DOMAIN-METRICS.md` §4.6): the summary the
	 * run folded once — a stored v1 report gets one on read. Each pane appears
	 * only when the summary has something for it: no labelled evaluator, no
	 * matrix; no cohort, no cohort table; never an empty pane.
	 */
	const summary = $derived(
		report ? (report.summary ?? summariseCampaign(report.cells)) : undefined
	);
	const wholeMatrices = $derived(
		(summary?.matrices ?? []).filter((matrix) => matrix.slice.scenario === undefined)
	);
	const cohortEvaluators = $derived(
		[
			...new Set((summary?.cohorts ?? []).flatMap((row) => Object.keys(row.evaluatorPassRates)))
		].sort()
	);
	const obligationEvaluators = $derived(
		[
			...new Set((summary?.obligations ?? []).flatMap((row) => Object.keys(row.evaluatorPassRates)))
		].sort()
	);
	const parityGates = $derived((report?.gates ?? []).filter((gate) => gate.kind === 'parity'));
	const unmatchedParity = $derived(parityGates.filter((gate) => gate.matched !== true).length);
	const CASE_ROWS = 200;
	const caseColumns = $derived([
		{ id: 'scenario', label: 'Scenario', kind: 'text' as const },
		{ id: 'guard', label: 'Guard', kind: 'text' as const },
		{ id: 'brain', label: 'Brain', kind: 'text' as const },
		{ id: 'seed', label: 'Seed', kind: 'number' as const },
		{ id: 'outcome', label: 'Outcome', kind: 'text' as const },
		{ id: 'ticks', label: 'Ticks', kind: 'number' as const },
		{ id: 'cost', label: 'Cost', kind: 'number' as const },
		{ id: 'approvals', label: 'Approvals', kind: 'number' as const },
		...[...new Set((summary?.cases ?? []).flatMap((row) => Object.keys(row.cohort ?? {})))]
			.sort()
			.map((attribute) => ({ id: `cohort:${attribute}`, label: attribute, kind: 'text' as const })),
		...[...new Set((summary?.cases ?? []).flatMap((row) => Object.keys(row.labels)))]
			.sort()
			.map((id) => ({ id: `label:${id}`, label: short(id), kind: 'text' as const }))
	]);
	const caseRows = $derived(
		(summary?.cases ?? []).slice(0, CASE_ROWS).map((row, index) => ({
			id: `${row.scenario}-${row.guard}-${row.brain}-${row.seed}-${index}`,
			cells: {
				scenario: row.scenario,
				guard: row.guard,
				brain: row.brain,
				seed: row.seed,
				outcome: row.error ? 'error' : (row.outcome ?? '—'),
				ticks: row.ticks,
				cost: row.cost,
				approvals: row.approvals,
				...Object.fromEntries(
					Object.entries(row.cohort ?? {}).map(([attribute, value]) => [
						`cohort:${attribute}`,
						value
					])
				),
				...Object.fromEntries(
					Object.entries(row.labels).map(([id, label]) => [`label:${id}`, label])
				)
			}
		}))
	);
	/**
	 * A rate gate as a `Meter` (WP71, `60-…` §4.1): the observed rate against
	 * the required one, the needle's good side from the operator. A gate whose
	 * requirement is not a rate (a metric, a count, a parity spread) has no
	 * meter — a meter is for a rate against a gate, nothing else.
	 */
	function meterFor(gate: { required: string; observed?: number | undefined; kind: string }) {
		if (gate.observed === undefined || gate.kind === 'metric') return undefined;
		const match = /^(>=|<=|>|<)\s*(0(?:\.\d+)?|1(?:\.0+)?)$/.exec(gate.required.trim());
		if (!match) return undefined;
		return {
			gate: Number(match[2]),
			direction: match[1]?.startsWith('<') ? ('down' as const) : ('up' as const)
		};
	}

	/** A confusion matrix as `Matrix` draws it: actual down, predicted across, the count as the fact and the fill. */
	function confusionCell(matrix: ConfusionMatrix) {
		const counts: Record<string, number> = {
			'actual-positive/predicted-positive': matrix.tp,
			'actual-positive/predicted-negative': matrix.fn,
			'actual-negative/predicted-positive': matrix.fp,
			'actual-negative/predicted-negative': matrix.tn
		};
		const most = Math.max(1, ...Object.values(counts));
		return (rowId: string, colId: string) => {
			const count = counts[`${rowId}/${colId}`] ?? 0;
			return { value: count / most, label: String(count) };
		};
	}
	const MATRIX_ROWS = [
		{ id: 'actual-positive', label: 'actual +' },
		{ id: 'actual-negative', label: 'actual −' }
	];
	const MATRIX_COLS = [
		{ id: 'predicted-positive', label: 'predicted +' },
		{ id: 'predicted-negative', label: 'predicted −' }
	];
	const num = (value: number | undefined): string =>
		value === undefined ? '—' : String(Math.round(value * 100) / 100);
	const slug = (value: string): string => value.replace(/[^a-z0-9-]/gi, '-');

	$effect(() => {
		void loadStored();
	});

	let pushNote = $state<Record<string, string>>({});

	// Push a saved report to the evidence store (WP70, `58-…` §4.5) — shown only once a store is configured.
	async function pushReport(row: StoredCampaignReport): Promise<void> {
		const storeId = evidenceStoresStore.configurations[0]?.storeId ?? '';
		const instance = evidenceStoresStore.instance(storeId);
		if (!instance) return;
		try {
			const receipt = await instance.push(
				await itemForReport($state.snapshot(row), { principal: browserPrincipalId() })
			);
			pushNote = { ...pushNote, [row.id]: `pushed ${receipt.digest.slice(0, 12)}…` };
		} catch (error) {
			pushNote = {
				...pushNote,
				[row.id]: `could not push: ${error instanceof Error ? error.message : String(error)}`
			};
		}
	}

	async function loadStored(): Promise<void> {
		const storage = await appStorage();
		stored = await storage.listCampaignReports();
		agents = await storage.listAgents();
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
			const storage = await appStorage();
			await storage.putCampaignReport(envelopeFor(result));
			await loadStored();
			// Shown only once stored (WP56 stage A): a verdict on screen used to
			// be a few milliseconds ahead of the report a safety case reads, and
			// a navigation in that gap left the screen honest and the store empty.
			traces = collected;
			report = result;
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
			{#if importNote}<span class="hint" data-testid="campaign-note">{importNote}</span>{/if}
			<label class="shelf">
				Add a shelf bot as a build
				<select
					data-testid="shelf-bot-picker"
					value={shelfPick}
					onchange={(e) => (shelfPick = e.currentTarget.value)}
				>
					<option value="">Choose a bot…</option>
					{#each agents as agent (agent.id)}
						<option value={agent.id}>{agent.spec.name}</option>
					{/each}
				</select>
				<button
					type="button"
					disabled={!parsed.ok || !shelfPick}
					data-testid="add-shelf-bot"
					onclick={addShelfBot}>Add</button
				>
			</label>
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
				<Lamp
					status={report.passed ? 'pass' : 'fail'}
					label={report.passed ? 'PASSED' : 'FAILED'}
					testId="campaign-verdict-lamp"
				/>
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
						{@const meter = meterFor(gate)}
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
								{#if meter && gate.observed !== undefined}
									<Meter
										value={gate.observed}
										gate={meter.gate}
										direction={meter.direction}
										label={gate.id}
										testId="gate-meter-{gate.id}"
									/>
								{:else}
									{gate.observed === undefined
										? '—'
										: gate.kind === 'metric'
											? Math.round(gate.observed * 100) / 100
											: pct(gate.observed)}
								{/if}
							</td>
							<td class="num">{gate.cells}</td>
							<td>
								<Lamp
									status={gate.inconclusive ? 'inconclusive' : gate.passed ? 'pass' : 'fail'}
									testId="gate-lamp-{gate.id}"
								/>
							</td>
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
									<td><Lamp status={cell.assertions[id] ? 'pass' : 'fail'} /></td>
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

		{#if wholeMatrices.length > 0}
			<section aria-label="Confusion matrices" data-testid="campaign-matrices">
				<h2>Confusion matrices</h2>
				<div class="matrices">
					{#each wholeMatrices as matrix (matrix.evaluatorId)}
						<div class="matrix" data-testid="campaign-matrix-{slug(matrix.evaluatorId)}">
							<h3 class="mono">{matrix.evaluatorId}</h3>
							<Matrix
								corner="all cells"
								rows={MATRIX_ROWS}
								cols={MATRIX_COLS}
								cell={confusionCell(matrix)}
								testId="matrix-{slug(matrix.evaluatorId)}"
							/>
							<p class="hint">
								precision {num(matrix.precision)} · recall {num(matrix.recall)} · F1 {num(
									matrix.f1
								)}
								· FPR {num(matrix.falsePositiveRate)}
							</p>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		{#if summary && summary.cohorts.length > 0}
			<section aria-label="Cohorts" data-testid="campaign-cohorts">
				<h2>Cohorts</h2>
				{#if parityGates.length > 0}
					<p class="hint" data-testid="campaign-cohorts-matched">
						{#if unmatchedParity > 0}
							{unmatchedParity} of {parityGates.length} parity gates compare
							<strong>unmatched</strong> cohorts: the cases differ in more than the attribute, so a spread
							is a caveat, not a finding.
						{:else}
							Every parity gate compares matched cohorts.
						{/if}
					</p>
				{/if}
				<!-- The cohort comparison on a Matrix (WP71, `60-…` §4.1): a row per cohort value, success and every evaluator across, the rate in the cell. -->
				<Matrix
					corner="Cohort"
					rows={summary.cohorts.map((row) => ({
						id: `${slug(row.attribute)}-${slug(row.value)}`,
						label: `${row.attribute} = ${row.value} (${row.cells})`
					}))}
					cols={[
						{ id: 'success', label: 'success' },
						...cohortEvaluators.map((id) => ({ id, label: short(id) }))
					]}
					cell={(rowId, colId) => {
						const row = summary.cohorts.find(
							(candidate) => `${slug(candidate.attribute)}-${slug(candidate.value)}` === rowId
						);
						if (!row) return undefined;
						const rate = colId === 'success' ? row.successRate : row.evaluatorPassRates[colId];
						return rate === undefined ? undefined : { value: rate, label: pct(rate) };
					}}
					testId="cohort"
				/>
			</section>
		{/if}

		{#if summary && summary.obligations.length > 0 && obligationEvaluators.length > 0}
			<section aria-label="Obligations" data-testid="campaign-obligations">
				<h2>Obligations</h2>
				<!-- The obligation table on a Matrix (WP71): a row per tag, success and every evaluator across. -->
				<Matrix
					corner="Obligation"
					rows={summary.obligations.map((row) => ({
						id: slug(row.tag),
						label: `${row.tag} (${row.cells})`
					}))}
					cols={[
						{ id: 'success', label: 'success' },
						...obligationEvaluators.map((id) => ({ id, label: short(id) }))
					]}
					cell={(rowId, colId) => {
						const row = summary.obligations.find((candidate) => slug(candidate.tag) === rowId);
						if (!row) return undefined;
						const rate = colId === 'success' ? row.successRate : row.evaluatorPassRates[colId];
						return rate === undefined ? undefined : { value: rate, label: pct(rate) };
					}}
					testId="obligation"
				/>
			</section>
		{/if}

		{#if summary && summary.cases.length > 0}
			<section aria-label="Cases" data-testid="campaign-cases">
				<h2>Cases</h2>
				{#if summary.cases.length > CASE_ROWS}
					<p class="hint">
						The first {CASE_ROWS} of {summary.cases.length}; the rest are in the report's JSON.
					</p>
				{/if}
				<CaseTable columns={caseColumns} rows={caseRows} testId="campaign-case-table" />
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
							<td
								><Lamp
									status={row.passed ? 'pass' : 'fail'}
									label={row.passed ? 'passed' : 'failed'}
								/></td
							>
							<td>
								<button
									type="button"
									class="drill"
									data-testid="open-report-{row.id}"
									onclick={() => openStored(row)}
								>
									Open
								</button>
								{#if evidenceStoresStore.configured}
									<button
										type="button"
										class="drill"
										data-testid="push-report-{row.id}"
										onclick={() => pushReport(row)}
									>
										Push
									</button>
									{#if pushNote[row.id]}<span class="hint" data-testid="pushed-report-{row.id}"
											>{pushNote[row.id]}</span
										>{/if}
								{/if}
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

	.shelf {
		display: inline-flex;
		align-items: center;
		gap: var(--cab-space-1);
		font-size: var(--cab-text-sm);
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
