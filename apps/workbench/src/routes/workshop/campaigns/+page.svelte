<script lang="ts">
	import { agentOptionLabel } from '$lib/workshop/agent-labels.js';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		caretRangesFor,
		brickKindsFor,
		buildKitFile,
		localContentReferencedBy,
		type AgentRecord,
		type StoredCampaignReport
	} from '@craftabot/core';
	import {
		campaignCells,
		campaignSchema,
		injectionBaseline,
		renderCampaignScorecard,
		renderJUnit,
		renderSarif,
		summariseCampaign,
		type Campaign,
		type CampaignCell,
		type ConfusionMatrix
	} from '@craftabot/evals';
	import CaseTable from '$lib/components/control-room/CaseTable.svelte';
	import Matrix from '$lib/components/control-room/Matrix.svelte';
	import Lamp from '$lib/components/control-room/Lamp.svelte';
	import Meter from '$lib/components/control-room/Meter.svelte';
	import { page } from '$app/state';
	import { editionId } from '$lib/edition-id.js';
	import { createRegistry, packVersions } from '$lib/packs.js';
	import { defaultShippedCampaign, shippedCampaigns } from '$lib/workshop/shipped-campaigns.js';
	import { campaignRunner } from '$lib/state/campaign-runner-app.svelte.js';
	import { failedFirst } from '$lib/workshop/case-order.js';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import { contentStore } from '$lib/state/content.svelte.js';
	import { slugOf } from '@craftabot/core';
	import { persistRunSummary } from '$lib/state/run-summaries.js';
	import { evidenceStoresStore } from '$lib/state/evidence.svelte.js';
	import { browserPrincipalId } from '$lib/state/principal.js';
	import { itemForReport } from '$lib/workshop/evidence.js';
	import {
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

	/**
	 * Every campaign the installed packs ship (UX-5): the Playroom's injection
	 * baseline and each desk's own. `?baseline=<id>` opens on one — the desk
	 * pages link here that way — and the Playground section opens on the
	 * Advice Desk's rather than the Playroom's.
	 */
	const shipped = shippedCampaigns();
	const openedOn = defaultShippedCampaign(
		shipped,
		page.url.searchParams.get('baseline') ??
			(editionId === 'playground' ? 'fs-advice-baseline' : undefined)
	);
	let baselinePick = $state(openedOn?.id ?? 'injection-baseline');
	let source = $state(JSON.stringify(openedOn?.campaign() ?? injectionBaseline(), null, '\t'));
	let stored = $state<StoredCampaignReport[]>([]);
	/**
	 * **The run is the runner store's, in a Worker** (WP77, `64-…` §6.6.1;
	 * UX-12's other half). This page queues a campaign and reads the store:
	 * the Worker runs it, the store persists the report when it lands, and the
	 * tab answers throughout — leave for the Run Browser mid-run and the
	 * report is still stored. **Cancel** stops at the next cell boundary and
	 * stores nothing: a partial report would be a report over cells it never
	 * ran, and the report's digest is over all of them.
	 */
	const running = $derived(campaignRunner.running);
	const progress = $derived(campaignRunner.progress);
	const cancelRequested = $derived(campaignRunner.cancelRequested);
	const lastQueued = $derived(campaignRunner.queue.at(-1));
	const cancelled = $derived(!running && lastQueued?.status === 'cancelled');
	let nowMs = $state(0);
	const elapsedMs = $derived(running ? Math.max(0, nowMs - campaignRunner.startedAtMs) : 0);
	/**
	 * When each cell finished (NEW-6): the estimate is a trailing average over
	 * the last twenty cells, not the mean since the start — the first cell is
	 * the slowest, and a mean that includes it ran about twice long and rose
	 * as the run went on. Said as "about a minute" past a threshold, because
	 * the seconds were never honest.
	 */
	const TRAILING = 20;
	const remainingMs = $derived.by(() => {
		if (!running || progress.done < 2) return undefined;
		void nowMs;
		const recent = campaignRunner.cellDoneAt.slice(-TRAILING - 1);
		if (recent.length < 2) return undefined;
		const perCell = ((recent.at(-1) ?? 0) - (recent[0] ?? 0)) / (recent.length - 1);
		return Math.round(perCell * (progress.total - progress.done));
	});
	const clock = (ms: number) => {
		const seconds = Math.round(ms / 1000);
		return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
	};
	/** The remaining time as a rough reading: under a minute, about a minute, about N minutes. */
	const roughly = (ms: number) => {
		const minutes = ms / 60_000;
		if (minutes < 0.75) return 'under a minute left';
		if (minutes < 1.5) return 'about a minute left';
		return `about ${Math.round(minutes)} minutes left`;
	};
	$effect(() => {
		if (!running) return;
		const timer = setInterval(() => (nowMs = Date.now()), 1000);
		return () => clearInterval(timer);
	});
	const report = $derived(campaignRunner.report);
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
		campaignRunner.forgetReport();
	}
	const traces = $derived(campaignRunner.traces);

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
	/**
	 * **The cases table, in pages and failures first** (UX-13). The table used
	 * to render its first 200 rows in cell order and point at the JSON for the
	 * rest; a reviewer looking for the case that went wrong may not have found
	 * it on screen at all. Now: the rows that failed — an error, or an outcome
	 * that is not SUCCESS — come first, a filter narrows by any text on the
	 * row, and the table grows a page at a time.
	 */
	const CASE_ROWS = 100;
	let caseFilter = $state('');
	let casePages = $state(1);
	const matchingCases = $derived.by(() => {
		const needle = caseFilter.trim().toLowerCase();
		const all = [...(summary?.cases ?? [])].sort(failedFirst);
		if (needle === '') return all;
		return all.filter((row) =>
			[
				row.scenario,
				row.guard,
				row.brain,
				String(row.seed),
				row.error ? 'error' : (row.outcome ?? ''),
				...Object.values(row.cohort ?? {}),
				...Object.values(row.labels)
			]
				.join(' ')
				.toLowerCase()
				.includes(needle)
		);
	});
	const shownCases = $derived(matchingCases.slice(0, CASE_ROWS * casePages));
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
		shownCases.map((row, index) => ({
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
		const entry = shipped.find((candidate) => candidate.id === baselinePick);
		source = JSON.stringify(entry ? entry.campaign() : injectionBaseline(), null, '\t');
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

	let runNote = $state('');
	/**
	 * **Books and sweeps** (WP80, `64-…` §6.6.3; `73-…` §6): a book through a
	 * workflow's reference configurations, and one knob over every build —
	 * both are campaigns with a `source`, put in the editor and queued as any
	 * campaign is, so the file CI would run is exactly what ran here. The
	 * book is drawn on this thread and carried inline, so the cell count is
	 * known before the run and the Worker draws nothing.
	 */
	const workflows = createRegistry().listWorkflows();
	let bookWorkflow = $state(workflows[0]?.id ?? '');
	let bookSize = $state(200);
	let bookSeed = $state(1);
	let bookNote = $state('');
	const bookConfigurationIds = $derived(
		Object.keys(workflows.find((workflow) => workflow.id === bookWorkflow)?.configurations ?? {})
	);
	let bookPicked = $state<string[]>([]);
	const bookConfigurations = $derived(
		bookPicked.filter((id) => bookConfigurationIds.includes(id)).length > 0
			? bookPicked.filter((id) => bookConfigurationIds.includes(id))
			: bookConfigurationIds
	);
	function toggleConfiguration(id: string): void {
		bookPicked = bookPicked.includes(id)
			? bookPicked.filter((entry) => entry !== id)
			: [...bookPicked, id];
	}
	function queueBook(): void {
		const registry = createRegistry();
		const workflow = registry.getWorkflow(bookWorkflow);
		if (!workflow) return;
		if (!workflow.book) {
			bookNote = `${workflow.name} draws no book of its own.`;
			return;
		}
		const world = registry.getWorld(workflow.worldId);
		const size = Math.max(1, Math.floor(Number(bookSize) || 1));
		const seed = Math.floor(Number(bookSeed) || 1);
		const book = workflow.book({ seed, size });
		const overrides = {
			senses: (world?.senses ?? []).map((sense) => sense.id),
			actions: (world?.actions ?? []).map((action) => action.id)
		};
		const configurations = bookConfigurations.length > 0 ? bookConfigurations : ['default'];
		const campaign = {
			schemaVersion: 1,
			id: `book-${slugOf(workflow.id)}-${seed}-${size}`,
			title: `${workflow.name} — the book at seed ${seed}, ${size} customers`,
			scenarios: [],
			source: { kind: 'book', workflowId: workflow.id, book },
			builds: configurations.map((configuration) => ({
				id: configuration,
				base: { kind: 'starter-default' },
				overrides: {
					...overrides,
					...(bookConfigurationIds.includes(configuration) ? { configuration } : {})
				}
			})),
			guards: [{ id: 'none', fit: [] }],
			brains: [{ id: 'scripted-optimal', tier: 'scripted-optimal' }],
			seeds: [seed],
			gates: [
				{
					id: 'a-measurement-not-a-judgment',
					require: { kind: 'outcome-rate', outcome: 'SUCCESS', atLeast: 0 }
				}
			]
		};
		source = JSON.stringify(campaign, null, '\t');
		bookNote = `${book.items.length} work items drawn; ${configurations.length} configuration${configurations.length === 1 ? '' : 's'}.`;
		execute();
	}
	let sweepKnob = $state('');
	let sweepValues = $state('');
	let sweepNote = $state('');
	const knobValue = (text: string): number | string | boolean => {
		if (text === 'true') return true;
		if (text === 'false') return false;
		const number = Number(text);
		return text.trim() !== '' && Number.isFinite(number) ? number : text;
	};
	function queueSweep(): void {
		if (!parsed.ok) return;
		const knob = sweepKnob.trim();
		const values = sweepValues
			.split(',')
			.map((entry) => entry.trim())
			.filter((entry) => entry !== '');
		if (knob === '' || values.length === 0) {
			sweepNote = 'A sweep wants a knob and its values.';
			return;
		}
		const base = parsed.campaign;
		const swept = {
			...base,
			id: `${base.id}-sweep-${slugOf(knob)}`,
			title: `${base.title} — ${knob} swept over ${values.join(', ')}`,
			builds: base.builds.flatMap((build) =>
				values.map((value) => ({
					...build,
					id: `${build.id}@${knob}=${value}`,
					overrides: {
						...(build.overrides ?? {}),
						knobs: { ...(build.overrides?.knobs ?? {}), [knob]: knobValue(value) }
					}
				}))
			)
		};
		source = JSON.stringify(swept, null, '\t');
		sweepNote = `${swept.builds.length} builds — ${base.builds.length} × ${values.length} values of ${knob}.`;
		execute();
	}

	function execute(): void {
		if (!parsed.ok || hasLive) return;
		openSlice = undefined;
		fromStore = false;
		const wasRunning = running;
		const queued = campaignRunner.enqueue(parsed.campaign);
		runNote =
			typeof queued === 'string'
				? queued
				: wasRunning
					? `Queued ${queued.title} (${queued.cells} cells) behind the running one.`
					: '';
		nowMs = Date.now();
	}
	// The stored list follows the store: a report lands there from the Worker whether or not this page is open.
	$effect(() => {
		void campaignRunner.report;
		void loadStored();
	});

	function openStored(row: StoredCampaignReport): void {
		const loaded = reportFrom(row);
		if (!loaded) return;
		campaignRunner.showStored(loaded);
		fromStore = true;
		openSlice = undefined;
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
			<label class="import">
				Shipped
				<select data-testid="baseline-pick" bind:value={baselinePick}>
					{#each shipped as entry (entry.id)}
						<option value={entry.id} title={entry.description}>{entry.title}</option>
					{/each}
				</select>
			</label>
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
						<option value={agent.id}>{agentOptionLabel(agent, agents)}</option>
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
					disabled={!parsed.ok || hasLive || size === 0}
					data-testid="run-campaign"
					onclick={execute}
				>
					{running ? 'Queue campaign' : 'Run campaign'}
				</button>
				{#if runNote}<span class="hint" data-testid="campaign-run-note">{runNote}</span>{/if}
				{#if running}
					<span class="run-status" role="status" data-testid="campaign-progress">
						Running {progress.done}/{progress.total}…
					</span>
					<!-- The way out, and the honest clock (UX-12). -->
					<button
						type="button"
						class="cancel"
						disabled={cancelRequested}
						data-testid="cancel-campaign"
						onclick={() => campaignRunner.cancel()}
					>
						{cancelRequested ? 'Stopping after this cell…' : 'Cancel'}
					</button>
					<span class="run-status" role="status" data-testid="campaign-clock">
						{clock(elapsedMs)} elapsed{remainingMs !== undefined ? `, ${roughly(remainingMs)}` : ''} —
						running in a Worker, so this page stays live; the report is stored when it finishes, even
						if you leave.
					</span>
				{:else if cancelled}
					<span class="run-status" role="status" data-testid="campaign-cancelled">
						Cancelled after {progress.done} of {progress.total} cells; nothing was stored.
					</span>
				{/if}
			</div>
		</div>
		{#if campaignRunner.queue.length > 0}
			<!-- The queue (WP77): several campaigns, one running, in the order they were asked for. -->
			<ol class="queue" data-testid="campaign-queue" aria-label="The queue">
				{#each campaignRunner.queue as entry (entry.id)}
					<li data-testid="queued-{entry.id}" data-status={entry.status}>
						{entry.title} · {entry.cells} cells · <strong>{entry.status}</strong>{entry.error
							? ` — ${entry.error}`
							: ''}
						{#if entry.status !== 'running'}
							<button type="button" onclick={() => campaignRunner.remove(entry.id)}>Remove</button>
						{/if}
					</li>
				{/each}
			</ol>
		{/if}
		{#if workflows.length > 0}
			<!-- Books and sweeps (WP80): campaigns with a source, made here and queued as any campaign is. -->
			<div class="books" data-testid="books">
				<fieldset>
					<legend>Book</legend>
					<label>
						Workflow
						<select data-testid="book-workflow" bind:value={bookWorkflow}>
							{#each workflows as workflow (workflow.id)}
								<option value={workflow.id}>{workflow.name}</option>
							{/each}
						</select>
					</label>
					<label>
						Customers
						<input type="number" min="1" data-testid="book-size" bind:value={bookSize} />
					</label>
					<label>
						Seed
						<input type="number" data-testid="book-seed" bind:value={bookSeed} />
					</label>
					{#if bookConfigurationIds.length > 0}
						<span class="configurations" data-testid="book-configurations">
							{#each bookConfigurationIds as id (id)}
								<label class="pick">
									<input
										type="checkbox"
										data-testid="book-configuration-{id}"
										checked={bookConfigurations.includes(id)}
										onchange={() => toggleConfiguration(id)}
									/>
									{id}
								</label>
							{/each}
						</span>
					{/if}
					<button type="button" data-testid="queue-book" onclick={queueBook}>
						{running ? 'Queue the book' : 'Run the book'}
					</button>
					{#if bookNote}<span class="hint" data-testid="book-note">{bookNote}</span>{/if}
				</fieldset>
				<fieldset>
					<legend>Sweep</legend>
					<label>
						Knob
						<input
							type="text"
							data-testid="sweep-knob"
							bind:value={sweepKnob}
							placeholder="referRatioPercent"
						/>
					</label>
					<label>
						Values
						<input
							type="text"
							data-testid="sweep-values"
							bind:value={sweepValues}
							placeholder="50, 60, 70"
						/>
					</label>
					<button
						type="button"
						disabled={!parsed.ok}
						data-testid="queue-sweep"
						onclick={queueSweep}
					>
						{running ? 'Queue the sweep' : 'Run the sweep'}
					</button>
					{#if sweepNote}<span class="hint" data-testid="sweep-note">{sweepNote}</span>{/if}
				</fieldset>
			</div>
		{/if}
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
										range={gate.interval}
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

		{#if report.schemaVersion < 3}
			<p class="hint" data-testid="campaign-upgraded">
				This report was written at schema v{report.schemaVersion}; it computed no fairness metrics
				and no drift, so those panes are empty. Run the campaign again for them.
			</p>
		{/if}

		{#if summary && summary.fairness.length > 0}
			<!-- The fairness metrics' verdicts (WP82, `64-…` §6.4.4): the value with its interval on a Meter, the power as a Lamp. -->
			<section aria-label="Fairness" data-testid="campaign-fairness">
				<h2>Fairness</h2>
				<p class="hint">
					Each parity gate's metric over the cells its <code>where</code> selected, with the interval
					and the cases it rests on. An underpowered row says so rather than pretending.
				</p>
				<div class="fairness">
					{#each summary.fairness as row (row.gateId)}
						<div class="fairness-row" data-testid="fairness-{row.gateId}">
							<Meter
								value={row.value}
								range={row.interval}
								label={`${row.metric} across ${row.across}`}
								min={row.metric === 'disparate-impact' ? 0 : -1}
								max={1}
								format={(v) => v.toFixed(3)}
								testId="fairness-meter-{row.gateId}"
							/>
							<div class="fairness-facts">
								<p class="mono">{row.gateId}</p>
								<p>
									{row.metric} across {row.across}{row.stratify ? ` within ${row.stratify}` : ''} · n
									=
									{row.n}
								</p>
								<p class="lamps">
									<Lamp
										status={row.inconclusive ? 'inconclusive' : row.passed ? 'pass' : 'fail'}
										testId="fairness-lamp-{row.gateId}"
									/>
									<Lamp
										status={row.underpowered ? 'inconclusive' : 'pass'}
										label={row.underpowered ? 'underpowered' : 'powered'}
										testId="fairness-power-{row.gateId}"
									/>
								</p>
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		{#if summary && summary.drift.length > 0}
			<!-- The drift verdicts (WP82): a distance against a reference, and the bound. -->
			<section aria-label="Drift" data-testid="campaign-drift">
				<h2>Drift</h2>
				<table data-testid="campaign-drift-table">
					<thead>
						<tr>
							<th scope="col">Gate</th>
							<th scope="col">Metric</th>
							<th scope="col">Feature</th>
							<th scope="col">Reference</th>
							<th scope="col">Value</th>
							<th scope="col">Bound</th>
							<th scope="col">Verdict</th>
						</tr>
					</thead>
					<tbody>
						{#each summary.drift as row (row.gateId)}
							<tr data-testid="drift-{row.gateId}">
								<td class="mono">{row.gateId}</td>
								<td>{row.metric}</td>
								<td>{row.feature ?? '—'}</td>
								<td>{row.reference}</td>
								<td class="num">{row.value === undefined ? '—' : row.value.toFixed(3)}</td>
								<td class="num">{row.atMost === undefined ? '—' : `≤ ${row.atMost}`}</td>
								<td>
									<Lamp
										status={row.reason ? 'inconclusive' : row.flagged ? 'fail' : 'pass'}
										label={row.reason ? 'inconclusive' : row.flagged ? 'drifted' : 'stable'}
										testId="drift-lamp-{row.gateId}"
									/>
									{#if row.reason}<span class="hint">{row.reason}</span>{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</section>
		{/if}

		{#if summary && summary.humanLoad.length > 0}
			<!-- Human load by build (WP80, `64-…` §6.4.1a): the bottom-up figures, by autonomy level. -->
			<section aria-label="Human load" data-testid="campaign-human-load">
				<h2>Human load</h2>
				<p class="hint">
					Touches per case and the ceiling-breach rate by build — a configuration, an autonomy level
					— over the book's journeys. A breach is a decision taken above its kind's ceiling:
					counted, never prevented.
				</p>
				<table data-testid="campaign-human-load-table">
					<thead>
						<tr>
							<th>Build</th>
							<th>Level</th>
							<th>Cases</th>
							<th>Touches per case</th>
							<th>Unattended</th>
							<th>Decisions</th>
							<th>Breaches</th>
							<th>Breach rate</th>
						</tr>
					</thead>
					<tbody>
						{#each summary.humanLoad as row (row.build)}
							<tr data-testid="human-load-{row.build}">
								<td>{row.build}</td>
								<td>{row.autonomy ?? '—'}</td>
								<td>{row.cells}</td>
								<td>
									{row.touchesPerCase.toFixed(2)}
									<small
										>[{row.touchesInterval[0].toFixed(2)}, {row.touchesInterval[1].toFixed(
											2
										)}]</small
									>
								</td>
								<td>{pct(row.unattendedRate)}</td>
								<td>{row.decisions}</td>
								<td>{row.breaches}</td>
								<td>
									{pct(row.ceilingBreachRate)}
									<small>[{pct(row.breachInterval[0])}, {pct(row.breachInterval[1])}]</small>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
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
				<div class="case-tools">
					<label>
						Find
						<input
							type="search"
							placeholder="scenario, guard, brain, seed, outcome, cohort, label"
							data-testid="campaign-case-filter"
							value={caseFilter}
							oninput={(e) => {
								caseFilter = e.currentTarget.value;
								casePages = 1;
							}}
						/>
					</label>
					<span class="hint" data-testid="campaign-case-count">
						Failures first. Showing {shownCases.length} of {matchingCases.length}{matchingCases.length !==
						summary.cases.length
							? ` (${summary.cases.length} in all)`
							: ''}.
					</span>
				</div>
				<CaseTable columns={caseColumns} rows={caseRows} testId="campaign-case-table" />
				{#if shownCases.length < matchingCases.length}
					<p>
						<button type="button" data-testid="campaign-case-more" onclick={() => (casePages += 1)}>
							Show the next {Math.min(CASE_ROWS, matchingCases.length - shownCases.length)}
						</button>
					</p>
				{/if}
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
	/* One measure rule (UX-6): instruments and tables take the width; only prose is capped, per block. */
	main {
		display: grid;
		gap: var(--cab-space-4);
		align-content: start;
	}
	.case-tools {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--cab-space-3);
		margin-bottom: var(--cab-space-2);
		font-size: var(--cab-text-sm);
	}
	.case-tools input {
		font: inherit;
		margin-left: var(--cab-space-1);
		padding: 2px var(--cab-space-2);
		min-width: 22rem;
		border: var(--cab-border-part) solid var(--cab-engrave);
		border-radius: var(--cab-radius-pill);
		background: var(--cab-cream);
	}
	.fairness {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-4);
	}
	.fairness-row {
		display: flex;
		align-items: center;
		gap: var(--cab-space-3);
	}
	.fairness-facts p {
		margin: 0;
		font-size: var(--cab-text-sm);
	}
	.lamps {
		display: flex;
		gap: var(--cab-space-3);
	}
	.books {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-3);
		margin: var(--cab-space-2) 0;
		font-size: var(--cab-text-sm);
	}
	.books fieldset {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--cab-space-2);
		border: var(--cab-border-part) solid var(--cab-engrave);
		border-radius: var(--cab-radius-tile);
		padding: var(--cab-space-2) var(--cab-space-3);
	}
	.books input[type='number'] {
		width: 6rem;
	}
	.books .configurations {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-2);
	}
	.queue {
		margin: var(--cab-space-2) 0;
		padding-left: var(--cab-space-4);
		font-size: var(--cab-text-sm);
	}
	.queue li {
		margin: var(--cab-space-1) 0;
	}
	.run-status {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--cab-space-2);
		font-size: var(--cab-text-sm);
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
