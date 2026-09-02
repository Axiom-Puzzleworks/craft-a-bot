<script lang="ts">
	import type { RunRecord } from '@craftabot/core';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import { sinksStore } from '$lib/state/sinks.svelte.js';

	/**
	 * **Sinks** (`35-TELEMETRY.md` §4.5, WP47): where a run's trace goes
	 * besides this browser. Each sink the telemetry package ships is listed
	 * with its config (JSON), an enabled switch, its declared egress for that
	 * config, and its last status; a stored run can be sent to any of them
	 * as a test. An enabled sink rides along every live run from the
	 * Playroom — a consumer of the bus, never a hand on the wheel.
	 */

	let drafts = $state<Record<string, string>>(
		Object.fromEntries(
			sinksStore.available.map((sink) => [
				sink.id,
				JSON.stringify(
					sinksStore.configurations.find((entry) => entry.sinkId === sink.id)?.config ??
						sink.configSchema.safeParse({}).data ?? { url: 'http://localhost:4318' },
					null,
					2
				)
			])
		)
	);
	let problems = $state<Record<string, string>>({});
	let runs = $state<RunRecord[]>([]);
	let selectedRunId = $state('');
	let sendNote = $state<Record<string, string>>({});

	$effect(() => {
		void (async () => {
			const storage = await appStorage();
			runs = await storage.listRuns();
			if (selectedRunId === '' && runs[0]) selectedRunId = runs[0].id;
		})();
	});

	function configured(sinkId: string) {
		return sinksStore.configurations.find((entry) => entry.sinkId === sinkId);
	}

	function parsedConfig(sinkId: string): unknown | undefined {
		try {
			return JSON.parse(drafts[sinkId] ?? '{}');
		} catch {
			return undefined;
		}
	}

	function save(sinkId: string, enabled: boolean): void {
		const sink = sinksStore.sinkById(sinkId);
		const raw = parsedConfig(sinkId);
		if (!sink || raw === undefined) {
			problems = { ...problems, [sinkId]: 'The config is not JSON.' };
			return;
		}
		const parsed = sink.configSchema.safeParse(raw);
		if (!parsed.success) {
			problems = { ...problems, [sinkId]: parsed.error.issues[0]?.message ?? 'invalid config' };
			return;
		}
		problems = { ...problems, [sinkId]: '' };
		sinksStore.set({ sinkId, config: parsed.data, enabled });
	}

	async function send(sinkId: string): Promise<void> {
		if (!selectedRunId) return;
		const storage = await appStorage();
		const run = await storage.getRun(selectedRunId);
		if (!run) return;
		const events = (await storage.getEvents(selectedRunId)).map((row) => row.event);
		const result = await sinksStore.send(sinkId, { run, events });
		sendNote = {
			...sendNote,
			[sinkId]: result.ok ? `Sent ${result.sent} spans.` : `Could not send: ${result.error}`
		};
	}

	const egressOf = (sinkId: string) => {
		const sink = sinksStore.sinkById(sinkId);
		const raw = parsedConfig(sinkId);
		return sink && raw !== undefined ? sink.egress(raw) : [];
	};
</script>

<svelte:head><title>Sinks — Workshop</title></svelte:head>

<main data-testid="sinks-page">
	<h1>Sinks</h1>
	<p class="hint">
		Where a run's trace goes besides this browser. An enabled sink rides along every live run from
		the Playroom; it is a consumer of the trace, and its failures stay here.
	</p>

	<label class="field">
		<span>A stored run to send as a test</span>
		<select bind:value={selectedRunId} data-testid="sinks-run-picker">
			{#each runs as run (run.id)}
				<option value={run.id}>{run.agentName} — {run.goalCardId} — {run.startedAt}</option>
			{/each}
		</select>
	</label>

	{#each sinksStore.available as sink (sink.id)}
		{@const entry = configured(sink.id)}
		{@const status = sinksStore.statuses[sink.id]}
		<section
			aria-label={sink.name}
			data-testid="sink-{sink.id}"
			data-enabled={entry?.enabled ?? false}
		>
			<h2>{sink.name} <span class="mono">{sink.id}</span></h2>
			<p class="hint">{sink.description}</p>
			<label class="field">
				<span>Config (JSON)</span>
				<textarea rows="4" bind:value={drafts[sink.id]} data-testid="sink-config-{sink.id}"
				></textarea>
			</label>
			{#if problems[sink.id]}<p class="error" data-testid="sink-problem-{sink.id}">
					{problems[sink.id]}
				</p>{/if}
			<p class="hint">
				Will call:
				{#each egressOf(sink.id) as declaration (declaration.host)}
					<span class="mono">{declaration.host}</span> ({declaration.purpose})
				{:else}
					nowhere
				{/each}
			</p>
			<div class="row">
				<button
					type="button"
					onclick={() => save(sink.id, true)}
					data-testid="sink-enable-{sink.id}">Save and enable</button
				>
				<button
					type="button"
					onclick={() => save(sink.id, false)}
					data-testid="sink-disable-{sink.id}">Save, disabled</button
				>
				<button
					type="button"
					disabled={!entry || !selectedRunId}
					onclick={() => send(sink.id)}
					data-testid="sink-send-{sink.id}">Send the stored run</button
				>
				{#if entry}<span class="hint" data-testid="sink-state-{sink.id}"
						>{entry.enabled ? 'enabled' : 'saved, disabled'}</span
					>{/if}
			</div>
			{#if sendNote[sink.id]}<p class="hint" data-testid="sink-sent-{sink.id}">
					{sendNote[sink.id]}
				</p>{/if}
			{#if status}
				<p class="hint mono" data-testid="sink-status-{sink.id}">
					sent {status.sent} · failed {status.failed} · buffered {status.buffered}{status.lastError
						? ` · ${status.lastError}`
						: ''}
				</p>
			{/if}
		</section>
	{/each}
</main>

<style>
	main {
		display: grid;
		gap: var(--cab-space-3);
		align-content: start;
		max-width: 900px;
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

	.field {
		display: grid;
		gap: var(--cab-space-1);
		margin-bottom: var(--cab-space-2);
	}

	.field span {
		font-size: var(--cab-text-sm);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-2);
		align-items: center;
	}

	.hint {
		margin: 0;
		font-size: var(--cab-text-sm);
		color: var(--cab-ink-muted);
	}

	.mono {
		font-family: var(--cab-font-mono);
		font-size: var(--cab-text-xs);
	}

	.error {
		margin: 0;
		font-size: var(--cab-text-sm);
		color: var(--cab-ink);
	}

	textarea {
		font-family: var(--cab-font-mono);
		font-size: var(--cab-text-sm);
	}
</style>
