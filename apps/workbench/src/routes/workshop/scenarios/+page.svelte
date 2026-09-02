<script lang="ts">
	import type { ScenarioPackFile } from '@craftabot/core';
	import { createRegistry, installedPacks } from '$lib/packs.js';
	import {
		describeRun,
		importCorpusText,
		importableCards,
		runLibraryScenario,
		scenarioLibrary,
		type LibraryEntry
	} from '$lib/workshop/scenarios.js';

	/**
	 * **The Scenario Library** (`32-SCENARIOS.md` §4.5, WP44): every scenario
	 * a pack ships — a goal card plus its tags, injections, expectations and
	 * plans — and a JSONL corpus imported over one of the cards, each row a
	 * scenario of its own for this session. Any of them runs offline, safe
	 * plan or unsafe, and the scenario's own expectations are checked.
	 */

	const registry = createRegistry();
	const cards = importableCards(registry);

	let imported = $state<ScenarioPackFile[]>([]);
	let corpusText = $state('');
	let corpusCard = $state(
		cards.find((card) => card.id === 'starter/warning-sign')?.id ?? cards[0]?.id ?? ''
	);
	let corpusKey = $state('sign');
	let importError = $state<string | undefined>(undefined);
	let results = $state<Record<string, string>>({});
	let busy = $state<string | undefined>(undefined);

	const library = $derived<LibraryEntry[]>(scenarioLibrary(registry, imported));

	function importCorpus(): void {
		importError = undefined;
		try {
			imported = [...imported, importCorpusText(corpusText, { card: corpusCard, key: corpusKey })];
			corpusText = '';
		} catch (error) {
			importError = (error as Error).message;
		}
	}

	async function run(entry: LibraryEntry, plan: 'safe' | 'unsafe'): Promise<void> {
		busy = `${entry.scenario.id}:${plan}`;
		try {
			const result = await runLibraryScenario(entry.scenario, plan, installedPacks, imported);
			results = { ...results, [entry.scenario.id]: describeRun(result) };
		} catch (error) {
			results = { ...results, [entry.scenario.id]: `could not run: ${(error as Error).message}` };
		} finally {
			busy = undefined;
		}
	}
</script>

<main data-testid="scenarios-page">
	<h1>Scenario Library</h1>
	<p class="hint">
		A scenario is a goal card plus what a test needs: the threat as tags, the content injected at
		start, what a safe and an unsafe run look like. Campaigns name them; reports group by their
		tags.
	</p>

	<section aria-label="Scenarios">
		<h2>Scenarios</h2>
		<table data-testid="scenario-list">
			<thead>
				<tr><th>Scenario</th><th>Card</th><th>Tags</th><th>Injections</th><th>Run</th></tr>
			</thead>
			<tbody>
				{#each library as entry (entry.scenario.id)}
					<tr data-testid="scenario-{entry.scenario.id}" data-imported={entry.imported}>
						<td>
							<strong>{entry.scenario.title}</strong>
							<span class="mono">{entry.scenario.id}</span>
							{#if entry.scenario.description}<p class="hint">{entry.scenario.description}</p>{/if}
						</td>
						<td class="mono">{entry.scenario.goalCardId}</td>
						<td>
							{#each entry.scenario.tags as tag (tag)}<span class="tag">{tag}</span>{/each}
						</td>
						<td class="hint">
							{entry.scenario.injections.length === 0
								? 'in the layout'
								: entry.scenario.injections.map((injection) => injection.kind).join(', ')}
						</td>
						<td class="actions">
							<button
								type="button"
								onclick={() => run(entry, 'safe')}
								disabled={busy !== undefined}
								data-testid="run-safe-{entry.scenario.id}">Safe plan</button
							>
							<button
								type="button"
								onclick={() => run(entry, 'unsafe')}
								disabled={busy !== undefined}
								data-testid="run-unsafe-{entry.scenario.id}">Unsafe plan</button
							>
							{#if results[entry.scenario.id]}
								<p class="result" data-testid="scenario-result-{entry.scenario.id}">
									{results[entry.scenario.id]}
								</p>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</section>

	<section aria-label="Import a corpus">
		<h2>Import a corpus</h2>
		<p class="hint">
			One JSON object per line — <span class="mono">{'{"text": "…", "tags": ["…"]}'}</span> — each becomes
			a scenario over the card you pick, its text filed in the manual under the key below, where the unsafe
			plan looks it up. Imports live for this session only.
		</p>
		<label class="field">
			<span>Over the card</span>
			<select bind:value={corpusCard} data-testid="corpus-card">
				{#each cards as card (card.id)}
					<option value={card.id}>{card.title} — {card.id}</option>
				{/each}
			</select>
		</label>
		<label class="field">
			<span>Manual key</span>
			<input type="text" bind:value={corpusKey} data-testid="corpus-key" />
		</label>
		<label class="field">
			<span>Rows (JSONL)</span>
			<textarea rows="6" bind:value={corpusText} data-testid="corpus-text"></textarea>
		</label>
		<button
			type="button"
			onclick={importCorpus}
			disabled={corpusText.trim() === '' || corpusCard === ''}
			data-testid="corpus-import">Import</button
		>
		{#if importError}<p class="error" data-testid="corpus-error">{importError}</p>{/if}
		<p class="hint" data-testid="corpus-count">
			{imported.reduce((n, file) => n + file.scenarios.length, 0)} imported this session
		</p>
	</section>
</main>

<style>
	main {
		display: grid;
		gap: var(--cab-space-3);
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

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--cab-text-sm);
	}

	th,
	td {
		text-align: left;
		vertical-align: top;
		padding: var(--cab-space-1) var(--cab-space-2);
		border-bottom: 1px solid var(--cab-ink-muted);
	}

	.mono {
		display: block;
		font-family: var(--cab-font-mono);
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted);
	}

	.hint {
		margin: 0;
		font-size: var(--cab-text-sm);
		color: var(--cab-ink-muted);
	}

	.hint .mono {
		display: inline;
	}

	.tag {
		display: inline-block;
		margin: 0 var(--cab-space-1) var(--cab-space-1) 0;
		padding: 0 var(--cab-space-1);
		border: 1px solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-panel);
		font-family: var(--cab-font-mono);
		font-size: var(--cab-text-xs);
	}

	.actions {
		display: grid;
		gap: var(--cab-space-1);
	}

	.result {
		margin: 0;
		font-size: var(--cab-text-xs);
	}

	.field {
		display: grid;
		gap: var(--cab-space-1);
		margin-bottom: var(--cab-space-2);
	}

	.field span {
		font-size: var(--cab-text-sm);
	}

	textarea,
	input {
		font-family: var(--cab-font-mono);
		font-size: var(--cab-text-sm);
	}

	.error {
		margin: var(--cab-space-2) 0 0;
		color: var(--cab-ink);
		font-size: var(--cab-text-sm);
	}
</style>
