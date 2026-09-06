<script lang="ts">
	import { resolve } from '$app/paths';
	import type {
		AgentRecord,
		ContentRecord,
		EvidenceItem,
		EvidenceKind,
		EvidenceReceipt,
		GroupRunRecord,
		RunRecord,
		StoredCampaignReport
	} from '@craftabot/core';
	import {
		assurancePackFromStorage,
		type AssuranceCampaignReportLike
	} from '@craftabot/governance/reports';
	import Lamp from '$lib/components/control-room/Lamp.svelte';
	import { createRegistry } from '$lib/packs.js';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import { contentStore } from '$lib/state/content.svelte.js';
	import { evidenceStoresStore } from '$lib/state/evidence.svelte.js';
	import { createBrowserKeyVault } from '$lib/state/keys.js';
	import { browserPrincipalId } from '$lib/state/principal.js';
	import { persistRunSummary } from '$lib/state/run-summaries.js';
	import { reportFrom } from '$lib/workshop/campaign-cells.js';
	import {
		importPulled,
		itemForAssurance,
		itemForContent,
		itemForGroup,
		itemForReport,
		itemForRun,
		verifyPulled
	} from '$lib/workshop/evidence.js';

	/**
	 * **Evidence** (`58-EVIDENCE-STORE.md` §4.5, WP70; `41-…` §6.11, D1): the
	 * shared evidence store — a sync target for artefacts only. One card per
	 * registered store with its config (the Sinks page's shape) and the
	 * state of its battery; a push row over what this browser holds; a pull
	 * row listing what the workspace holds, each item's digest verified
	 * before it can be imported. Never a key, never required: the rest of
	 * the Workshop shows a push control only once a store is configured here.
	 */

	let drafts = $state<Record<string, string>>(
		Object.fromEntries(
			evidenceStoresStore.available.map((store) => [
				store.id,
				JSON.stringify(
					evidenceStoresStore.configurations.find((entry) => entry.storeId === store.id)?.config ??
						store.configSchema.safeParse({}).data ?? {
							url: 'https://<ref>.supabase.co',
							anonKey: '',
							workspace: 'team'
						},
					null,
					2
				)
			])
		)
	);
	let problems = $state<Record<string, string>>({});
	let tokenDraft = $state<Record<string, string>>({});
	let tokens = $state<Record<string, boolean>>(readTokens());

	let runs = $state<RunRecord[]>([]);
	let groups = $state<GroupRunRecord[]>([]);
	let reports = $state<StoredCampaignReport[]>([]);
	let agents = $state<AgentRecord[]>([]);
	let pushKind = $state<'run' | 'group' | 'campaign-report' | 'assurance-pack' | 'content'>('run');
	let pushId = $state('');
	let pushStore = $state('');
	let pushNote = $state<{ ok: boolean; text: string } | undefined>(undefined);

	let pullKind = $state<EvidenceKind | ''>('');
	let pullSince = $state('');
	let pulled = $state<Array<{ item: EvidenceItem; verified: boolean }>>([]);
	let pullNote = $state<{ ok: boolean; text: string } | undefined>(undefined);
	let importNote = $state<Record<string, string>>({});

	$effect(() => {
		void (async () => {
			const storage = await appStorage();
			runs = await storage.listRuns();
			groups = await storage.listGroupRuns();
			reports = await storage.listCampaignReports();
			agents = await storage.listAgents();
			await contentStore.load();
		})();
	});
	$effect(() => {
		if (pushStore === '' && evidenceStoresStore.configurations[0]) {
			pushStore = evidenceStoresStore.configurations[0].storeId;
		}
	});

	function readTokens(): Record<string, boolean> {
		const vault = createBrowserKeyVault();
		return Object.fromEntries(
			evidenceStoresStore.available.map((store) => [
				store.id,
				store.credential ? vault.get(store.credential.id) !== undefined : true
			])
		);
	}

	const configured = (storeId: string) =>
		evidenceStoresStore.configurations.find((entry) => entry.storeId === storeId);

	function parsedConfig(storeId: string): unknown | undefined {
		try {
			return JSON.parse(drafts[storeId] ?? '{}');
		} catch {
			return undefined;
		}
	}

	function save(storeId: string): void {
		const store = evidenceStoresStore.storeById(storeId);
		const raw = parsedConfig(storeId);
		if (!store || raw === undefined) {
			problems = { ...problems, [storeId]: 'The config is not JSON.' };
			return;
		}
		const parsed = store.configSchema.safeParse(raw);
		if (!parsed.success) {
			problems = { ...problems, [storeId]: parsed.error.issues[0]?.message ?? 'invalid config' };
			return;
		}
		problems = { ...problems, [storeId]: '' };
		evidenceStoresStore.set({ storeId, config: parsed.data });
	}

	function forget(storeId: string): void {
		evidenceStoresStore.remove(storeId);
		if (pushStore === storeId) pushStore = '';
	}

	function fitToken(storeId: string): void {
		const store = evidenceStoresStore.storeById(storeId);
		const draft = (tokenDraft[storeId] ?? '').trim();
		if (!store?.credential || draft === '') return;
		createBrowserKeyVault().set(store.credential.id, draft);
		tokenDraft = { ...tokenDraft, [storeId]: '' };
		tokens = readTokens();
	}

	function ejectToken(storeId: string): void {
		const store = evidenceStoresStore.storeById(storeId);
		if (!store?.credential) return;
		createBrowserKeyVault().remove(store.credential.id);
		tokens = readTokens();
	}

	const egressOf = (storeId: string) => {
		const store = evidenceStoresStore.storeById(storeId);
		const raw = parsedConfig(storeId);
		return store && raw !== undefined ? store.egress(raw) : [];
	};

	const pushChoices = $derived.by(() => {
		switch (pushKind) {
			case 'run':
				return runs.map((run) => ({ id: run.id, label: `${run.agentName} — ${run.startedAt}` }));
			case 'group':
				return groups.map((group) => ({
					id: group.id,
					label: `${group.goalCardId} — ${group.startedAt}`
				}));
			case 'campaign-report':
				return reports.map((report) => ({
					id: report.id,
					label: `${report.title} — ${report.createdAt}`
				}));
			case 'assurance-pack':
				return agents.map((agent) => ({ id: agent.id, label: agent.spec.name }));
			case 'content':
				return contentStore.records.map((record) => ({ id: record.id, label: record.title }));
		}
	});

	async function itemToPush(): Promise<EvidenceItem> {
		const storage = await appStorage();
		const secrets = createBrowserKeyVault().secrets();
		const options = { principal: browserPrincipalId() };
		switch (pushKind) {
			case 'run': {
				const run = runs.find((candidate) => candidate.id === pushId);
				if (!run) throw new Error('pick a run');
				return itemForRun(storage, $state.snapshot(run), secrets, options);
			}
			case 'group': {
				const group = groups.find((candidate) => candidate.id === pushId);
				if (!group) throw new Error('pick an episode');
				return itemForGroup(storage, $state.snapshot(group), secrets, options);
			}
			case 'campaign-report': {
				const report = reports.find((candidate) => candidate.id === pushId);
				if (!report) throw new Error('pick a report');
				return itemForReport($state.snapshot(report), options);
			}
			case 'assurance-pack': {
				if (!pushId) throw new Error('pick a bot');
				const pack = await assurancePackFromStorage(pushId, storage, createRegistry(), {
					parseReport: (raw) =>
						reportFrom({ report: raw } as never) as unknown as
							AssuranceCampaignReportLike | undefined
				});
				return itemForAssurance(pack as unknown as Record<string, unknown>, options);
			}
			case 'content': {
				const record = contentStore.records.find((candidate) => candidate.id === pushId);
				if (!record) throw new Error('pick a record');
				return itemForContent($state.snapshot(record) as ContentRecord, options);
			}
		}
	}

	async function push(): Promise<void> {
		pushNote = undefined;
		const instance = evidenceStoresStore.instance(pushStore);
		if (!instance) {
			pushNote = { ok: false, text: 'That store is not configured.' };
			return;
		}
		try {
			const item = await itemToPush();
			const receipt: EvidenceReceipt = await instance.push(item);
			pushNote = {
				ok: true,
				text: `Pushed ${receipt.kind} ${receipt.id} — digest ${receipt.digest.slice(0, 12)}…, workspace ${receipt.workspace}.`
			};
		} catch (error) {
			pushNote = {
				ok: false,
				text: `Could not push: ${error instanceof Error ? error.message : String(error)}`
			};
		}
	}

	async function pull(): Promise<void> {
		pullNote = undefined;
		pulled = [];
		importNote = {};
		const instance = evidenceStoresStore.instance(pushStore);
		if (!instance) {
			pullNote = { ok: false, text: 'That store is not configured.' };
			return;
		}
		try {
			const found: Array<{ item: EvidenceItem; verified: boolean }> = [];
			for await (const item of instance.pull({
				...(pullKind !== '' ? { kind: pullKind } : {}),
				...(pullSince !== '' ? { since: new Date(pullSince).toISOString() } : {})
			})) {
				found.push({ item, verified: await verifyPulled(item) });
			}
			pulled = found;
			const refused = found.filter((entry) => !entry.verified).length;
			pullNote = {
				ok: refused === 0,
				text:
					found.length === 0
						? 'Nothing in the workspace matches.'
						: `${found.length} item${found.length === 1 ? '' : 's'}${refused ? `, ${refused} refused (digest does not match)` : ', every digest verified'}.`
			};
		} catch (error) {
			pullNote = {
				ok: false,
				text: `Could not pull: ${error instanceof Error ? error.message : String(error)}`
			};
		}
	}

	async function importItem(item: EvidenceItem): Promise<void> {
		const key = `${item.kind}:${item.id}`;
		try {
			const storage = await appStorage();
			// A snapshot: the pulled list is state, and IndexedDB cannot clone a proxy.
			const imported = await importPulled(storage, $state.snapshot(item) as EvidenceItem, {
				saveContent: (record) => contentStore.save(record)
			});
			if (imported.kind === 'bundle') {
				for (const runId of imported.runIds) {
					await persistRunSummary(
						storage,
						runId,
						(await storage.getEvents(runId)).map((row) => row.event)
					);
				}
				runs = await storage.listRuns();
				importNote = {
					...importNote,
					[key]: `Imported ${imported.runIds.length} run${imported.runIds.length === 1 ? '' : 's'} — digests verified. Open the Run Browser.`
				};
			} else if (imported.kind === 'assurance-pack') {
				importNote = {
					...importNote,
					[key]:
						'An assurance pack is read, not stored — open it from the Assurance page for this bot.'
				};
			} else {
				reports = await storage.listCampaignReports();
				importNote = { ...importNote, [key]: `Imported ${imported.kind} ${imported.id}.` };
			}
		} catch (error) {
			importNote = {
				...importNote,
				[key]: `Refused: ${error instanceof Error ? error.message : String(error)}`
			};
		}
	}
</script>

<svelte:head><title>Evidence — Workshop</title></svelte:head>

<main data-testid="evidence-page">
	<h1>Evidence</h1>
	<p class="hint">
		The shared evidence store: a sync target for bundles, campaign reports, assurance packs and
		authored content — never a key, never the source of truth, never required. Provisioning a
		project and minting a workspace token is the team's own job: see
		<code>docs/evidence-setup.md</code>.
	</p>

	{#each evidenceStoresStore.available as store (store.id)}
		{@const entry = configured(store.id)}
		<section
			aria-label={store.name}
			data-testid="evidence-{store.id}"
			data-configured={entry !== undefined}
		>
			<h2>{store.name} <span class="mono">{store.id}</span></h2>
			<p class="hint">{store.description}</p>
			<label class="field">
				<span>Config (JSON)</span>
				<textarea rows="4" bind:value={drafts[store.id]} data-testid="evidence-config-{store.id}"
				></textarea>
			</label>
			{#if problems[store.id]}<p class="error" data-testid="evidence-problem-{store.id}">
					{problems[store.id]}
				</p>{/if}
			<p class="hint">
				Will call:
				{#each egressOf(store.id) as declaration (declaration.host)}
					<span class="mono">{declaration.host}</span> ({declaration.purpose})
				{:else}
					nowhere
				{/each}
			</p>
			<div class="row">
				<button type="button" onclick={() => save(store.id)} data-testid="evidence-save-{store.id}"
					>Save</button
				>
				{#if entry}
					<button
						type="button"
						onclick={() => forget(store.id)}
						data-testid="evidence-forget-{store.id}">Forget</button
					>
					<span class="hint" data-testid="evidence-state-{store.id}">configured</span>
				{/if}
			</div>
			{#if store.credential}
				<div class="row battery" data-testid="evidence-battery-{store.id}">
					<Lamp
						status={tokens[store.id] ? 'pass' : 'inconclusive'}
						label={tokens[store.id]
							? `${store.credential.name} fitted`
							: `No ${store.credential.name.toLowerCase()}`}
						testId="evidence-token-{store.id}"
					/>
					{#if tokens[store.id]}
						<button
							type="button"
							onclick={() => ejectToken(store.id)}
							data-testid="evidence-eject-{store.id}">Eject</button
						>
					{:else}
						<input
							type="password"
							autocomplete="off"
							placeholder={store.credential.name}
							bind:value={tokenDraft[store.id]}
							data-testid="evidence-token-input-{store.id}"
						/>
						<button
							type="button"
							onclick={() => fitToken(store.id)}
							data-testid="evidence-fit-{store.id}">Fit</button
						>
					{/if}
				</div>
				<p class="hint">
					The token is kept in this browser's vault only (<code>cab.keys.v1</code>) and sent as a
					bearer header — never in a file, a trace or a URL. A compartment for it is on the
					<a href={resolve('/settings')}>Settings</a> page too.
				</p>
			{/if}
		</section>
	{/each}

	{#if evidenceStoresStore.configured}
		<section aria-label="Push" data-testid="evidence-push">
			<h2>Push</h2>
			<div class="row">
				<label class="field">
					<span>Store</span>
					<select bind:value={pushStore} data-testid="evidence-push-store">
						{#each evidenceStoresStore.configurations as entry (entry.storeId)}
							<option value={entry.storeId}>{entry.storeId}</option>
						{/each}
					</select>
				</label>
				<label class="field">
					<span>What</span>
					<select
						bind:value={pushKind}
						onchange={() => (pushId = '')}
						data-testid="evidence-push-kind"
					>
						<option value="run">A run, as its bundle</option>
						<option value="group">An episode, as its bundle</option>
						<option value="campaign-report">A campaign report</option>
						<option value="assurance-pack">A bot's assurance pack</option>
						<option value="content">An authored record</option>
					</select>
				</label>
				<label class="field grow">
					<span>Which</span>
					<select bind:value={pushId} data-testid="evidence-push-id">
						<option value="">—</option>
						{#each pushChoices as choice (choice.id)}
							<option value={choice.id}>{choice.label}</option>
						{/each}
					</select>
				</label>
				<button type="button" disabled={!pushId} onclick={push} data-testid="evidence-push-go"
					>Push</button
				>
			</div>
			{#if pushNote}<p
					class="note"
					class:error={!pushNote.ok}
					role="status"
					data-testid="evidence-push-note"
				>
					{pushNote.text}
				</p>{/if}
		</section>

		<section aria-label="Pull" data-testid="evidence-pull">
			<h2>Pull</h2>
			<div class="row">
				<label class="field">
					<span>Kind</span>
					<select bind:value={pullKind} data-testid="evidence-pull-kind">
						<option value="">every kind</option>
						<option value="bundle">bundles</option>
						<option value="campaign-report">campaign reports</option>
						<option value="assurance-pack">assurance packs</option>
						<option value="content">authored records</option>
					</select>
				</label>
				<label class="field">
					<span>Pushed after</span>
					<input type="datetime-local" bind:value={pullSince} data-testid="evidence-pull-since" />
				</label>
				<button type="button" onclick={pull} data-testid="evidence-pull-go">Pull</button>
			</div>
			{#if pullNote}<p
					class="note"
					class:error={!pullNote.ok}
					role="status"
					data-testid="evidence-pull-note"
				>
					{pullNote.text}
				</p>{/if}
			{#if pulled.length > 0}
				<table data-testid="evidence-pulled">
					<thead>
						<tr><th>Kind</th><th>Id</th><th>Pushed</th><th>Digest</th><th></th></tr>
					</thead>
					<tbody>
						{#each pulled as entry (`${entry.item.kind}:${entry.item.id}`)}
							<tr data-testid="evidence-pulled-{entry.item.kind}-{entry.item.id}">
								<td>{entry.item.kind}</td>
								<td class="mono">{entry.item.id}</td>
								<td
									>{entry.item.pushedAt}{entry.item.pushedBy
										? ` by ${entry.item.pushedBy}`
										: ''}</td
								>
								<td>
									<Lamp
										status={entry.verified ? 'pass' : 'fail'}
										label={entry.verified ? 'verified' : 'digest mismatch'}
										testId="evidence-verified-{entry.item.kind}-{entry.item.id}"
									/>
								</td>
								<td>
									<button
										type="button"
										disabled={!entry.verified}
										onclick={() => importItem(entry.item)}
										data-testid="evidence-import-{entry.item.kind}-{entry.item.id}">Import</button
									>
									{#if importNote[`${entry.item.kind}:${entry.item.id}`]}<span
											class="hint"
											data-testid="evidence-import-note-{entry.item.kind}-{entry.item.id}"
											>{importNote[`${entry.item.kind}:${entry.item.id}`]}</span
										>{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</section>
	{:else}
		<p class="hint" data-testid="evidence-unconfigured">
			No store is configured. Everything else works exactly as before; save a store above to push
			and pull.
		</p>
	{/if}
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
	}

	.field span {
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--cab-ink-muted);
	}

	.grow {
		flex: 1;
	}

	textarea,
	select,
	input {
		font: inherit;
	}

	textarea {
		font-family: var(--cab-font-mono);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-2);
		align-items: end;
		margin-top: var(--cab-space-2);
	}

	.battery {
		align-items: center;
	}

	.hint {
		margin: var(--cab-space-1) 0 0;
		color: var(--cab-ink-muted);
		font-size: var(--cab-text-sm);
	}

	.mono {
		font-family: var(--cab-font-mono);
		font-size: var(--cab-text-xs);
	}

	.note {
		margin: var(--cab-space-2) 0 0;
		font-size: var(--cab-text-sm);
	}

	.error {
		color: var(--cab-fail);
	}

	table {
		width: 100%;
		margin-top: var(--cab-space-2);
		border-collapse: collapse;
		font-size: var(--cab-text-sm);
	}

	th,
	td {
		text-align: left;
		padding: var(--cab-space-1);
		border-bottom: 1px solid var(--cab-ink-muted);
		vertical-align: top;
	}
</style>
