<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		safeParseStoredWorkflowRun,
		workflowRunSchema,
		type StoredWorkflowRun,
		type WorkflowSpec
	} from '@craftabot/core';
	import CaseTable from '$lib/components/control-room/CaseTable.svelte';
	import Lamp from '$lib/components/control-room/Lamp.svelte';
	import Readout from '$lib/components/control-room/Readout.svelte';
	import Strip from '$lib/components/control-room/Strip.svelte';
	import { createRegistry } from '$lib/packs.js';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import { workflowRowOf } from '$lib/workshop/pipeline.js';

	/**
	 * **Workflows** (WP86, `77-PIPELINE-AND-BOUNDARY.md` §4; `64-…` §6.2.4):
	 * every workflow run the store holds — a book campaign's cells, a what-if,
	 * an import — one row each with the stage statuses as a strip; a row
	 * opens the Pipeline. A `workflow-run.json` the harness wrote, or a stored
	 * run with its item, imports here.
	 */
	const specs = new Map<string, WorkflowSpec>(
		createRegistry()
			.listWorkflows()
			.map((workflow) => [workflow.id, workflow])
	);

	let stored = $state<StoredWorkflowRun[]>([]);
	let loaded = $state(false);
	let importNote = $state<{ ok: boolean; text: string } | undefined>(undefined);

	$effect(() => {
		void load();
	});

	async function load(): Promise<void> {
		const storage = await appStorage();
		stored = await storage.listWorkflowRuns();
		loaded = true;
	}

	const rows = $derived(stored.map((entry) => workflowRowOf(entry, specs)));
	const columns = [
		{ id: 'workflowName', label: 'Workflow', kind: 'text' as const },
		{ id: 'itemId', label: 'Item', kind: 'text' as const },
		{ id: 'outcome', label: 'Outcome', kind: 'status' as const },
		{ id: 'strip', label: 'Stages', kind: 'text' as const },
		{ id: 'touches', label: 'Touches', kind: 'number' as const },
		{ id: 'source', label: 'From', kind: 'text' as const },
		{ id: 'startedAt', label: 'Started (simulated)', kind: 'text' as const }
	];
	const tableRows = $derived(
		rows.map((row) => ({
			id: row.id,
			cells: {
				workflowName: row.workflowName,
				itemId: row.itemId,
				outcome: row.outcome,
				strip: row.strip,
				touches: row.touches,
				source: row.forkedFrom ? `${row.source} ← ${row.forkedFrom.slice(0, 8)}` : row.source,
				startedAt: row.startedAt.slice(0, 16).replace('T', ' ')
			}
		}))
	);
	const completed = $derived(rows.filter((row) => row.outcomeWord === 'completed').length);

	async function importRun(event: Event): Promise<void> {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		try {
			const raw: unknown = JSON.parse(await file.text());
			const envelope = safeParseStoredWorkflowRun(raw);
			const record: StoredWorkflowRun = envelope.success
				? envelope.data
				: {
						run: workflowRunSchema.parse(raw),
						source: { kind: 'import' },
						createdAt: new Date().toISOString(),
						schemaVersion: 1
					};
			const storage = await appStorage();
			await storage.putWorkflowRun(record);
			importNote = {
				ok: true,
				text: `Imported ${record.run.workflowId} run ${record.run.id.slice(0, 8)}… — ${record.run.stages.length} stages, ${record.run.outcome}${record.item ? ', with its item' : ', without its item (no what-if)'}.`
			};
			await load();
		} catch (error) {
			importNote = {
				ok: false,
				text: `Not a workflow run: ${error instanceof Error ? error.message : String(error)}`
			};
		} finally {
			input.value = '';
		}
	}

	function open(runId: string): void {
		void goto(resolve('/workshop/workflows/[runId]', { runId }));
	}
</script>

<svelte:head><title>Workflows — Workshop</title></svelte:head>

<main data-testid="workflows-page">
	<header class="head">
		<h1>Workflows</h1>
		<label class="import">
			Import a workflow run
			<input
				type="file"
				accept=".json,application/json"
				data-testid="import-workflow-run"
				onchange={importRun}
			/>
		</label>
	</header>
	<p class="status">
		Every journey the store holds — a book campaign's cells, a what-if, an import — with its stages
		as a strip. Open one for the Pipeline: every stage's input and output, the bot's run at each
		stage, and a what-if from any stage.
	</p>
	{#if importNote}
		<p
			class="note"
			class:note--bad={!importNote.ok}
			role="status"
			data-testid="workflow-import-note"
		>
			{importNote.text}
		</p>
	{/if}

	<Strip label="Workflow runs" icon="chain" testId="workflows-strip">
		<Readout label="runs" value={rows.length} testId="workflows-count" />
		<Readout label="completed" value={completed} testId="workflows-completed" />
		<Readout label="workflows" value={new Set(rows.map((row) => row.workflowId)).size} />
		<Lamp
			status={rows.length === 0 ? 'inconclusive' : completed === rows.length ? 'pass' : 'fail'}
			label={rows.length === 0 ? 'no runs yet' : `${rows.length - completed} stopped`}
		/>
	</Strip>

	{#if !loaded}
		<p class="status">Reading the store…</p>
	{:else if rows.length === 0}
		<p class="status" data-testid="workflows-empty">
			No workflow run stored yet. Queue a book on Campaigns, run a what-if, or import a
			<code>workflow-run.json</code> the harness wrote.
		</p>
	{:else}
		<CaseTable {columns} rows={tableRows} onRow={open} testId="workflows-table" />
	{/if}
</main>

<style>
	main {
		display: grid;
		gap: var(--cab-space-4);
		align-content: start;
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: end;
		gap: var(--cab-space-3);
	}

	h1 {
		margin: 0;
		font-size: var(--cab-text-xl);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.import {
		display: grid;
		gap: var(--cab-space-1);
		font-size: var(--cab-text-sm);
	}

	.status,
	.note {
		margin: 0;
		font-size: var(--cab-text-sm);
		color: var(--cab-ink-muted);
	}

	.note--bad {
		color: var(--cab-fail);
	}
</style>
