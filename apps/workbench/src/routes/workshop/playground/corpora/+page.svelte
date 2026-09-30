<script lang="ts">
	import { resolve } from '$app/paths';
	import CaseTable from '$lib/components/control-room/CaseTable.svelte';
	import Strip from '$lib/components/control-room/Strip.svelte';
	import Readout from '$lib/components/control-room/Readout.svelte';
	import { createRegistry } from '$lib/packs.js';
	import {
		annotatorLines,
		corpusListRow,
		labelSummaries,
		singleAnnotator,
		tagCounts
	} from '$lib/workshop/corpora.js';

	/**
	 * **The corpora** (WP119, `105-CORPORA.md` §1): every labelled corpus the
	 * edition's packs ship — its guide, its label sets, its tags, who labelled
	 * it and how far they agreed, whether it was held out, and which readers
	 * have been scored on it. The tables are the page's own twin: every figure
	 * is in text. Nothing runs here, and no row's words are shown.
	 */
	const registry = createRegistry();
	const corpora = registry
		.listCorpora()
		.slice()
		.sort((a, b) => a.id.localeCompare(b.id));
	const columns = [
		{ id: 'name', label: 'Corpus', kind: 'text' as const },
		{ id: 'version', label: 'Version', kind: 'text' as const },
		{ id: 'rows', label: 'Rows', kind: 'number' as const },
		{ id: 'labels', label: 'Labels', kind: 'text' as const },
		{ id: 'heldOut', label: 'Held out', kind: 'text' as const },
		{ id: 'annotators', label: 'Annotators', kind: 'number' as const },
		{ id: 'seenBy', label: 'Readers scored', kind: 'number' as const },
		{ id: 'finding', label: 'Finding', kind: 'text' as const }
	];
	const rows = corpora.map((corpus) => {
		const { id, ...cells } = corpusListRow(corpus);
		return { id, cells };
	});
	const slug = (id: string) => id.replace(/[^a-z0-9]+/gi, '-');
</script>

<svelte:head><title>Corpora — Workshop</title></svelte:head>

<main data-testid="corpora-page">
	<p class="crumb"><a href={resolve('/workshop/playground')}>← The Playground</a></p>
	<h1>The corpora</h1>
	<p class="lede">
		Labelled rows a reader is scored on: each frozen at a digest, labelled by its author and — where
		it says so — by a second annotator who never saw the author's labels, and never scored twice on
		the same questions unless the run says it is a regression.
	</p>
	<p class="simulation" data-testid="corpora-simulation-only">FOR SIMULATION ONLY</p>
	<Strip label="Corpora" icon="corpus" testId="corpora-strip">
		<Readout label="corpora" value={corpora.length} testId="corpora-count" />
		<Readout
			label="rows"
			value={corpora.reduce((sum, corpus) => sum + corpus.rows.length, 0)}
			testId="corpora-rows"
		/>
	</Strip>
	<CaseTable {columns} {rows} testId="corpora-table" />

	{#each corpora as corpus (corpus.id)}
		<section aria-label={corpus.name} data-testid="corpus-{slug(corpus.id)}">
			<h2>{corpus.name} <small>v{corpus.version}</small></h2>
			<p class="lede">{corpus.guide}</p>
			{#if singleAnnotator(corpus)}
				<p class="finding" data-testid="corpus-{slug(corpus.id)}-single-annotator">
					Labelled by its author alone: there is no agreement to hold a reader to.
				</p>
			{/if}
			<p class="digest">Frozen at <code>{corpus.digest}</code></p>
			<div class="tables">
				{#each labelSummaries(corpus) as label (label.name)}
					<table aria-label="Label {label.name}, {corpus.name}">
						<caption>{label.name} — {label.guide}</caption>
						<thead>
							<tr><th>Value</th><th>Rows</th></tr>
						</thead>
						<tbody>
							{#each label.counts as count (count.option)}
								<tr><td>{count.option}</td><td>{count.rows}</td></tr>
							{/each}
							<tr><td>contested</td><td>{label.contested}</td></tr>
						</tbody>
					</table>
				{/each}
				<table aria-label="Tags, {corpus.name}">
					<caption>Tags</caption>
					<thead>
						<tr><th>Tag</th><th>Rows</th></tr>
					</thead>
					<tbody>
						{#each tagCounts(corpus) as tag (tag.tag)}
							<tr><td>{tag.tag}</td><td>{tag.rows}</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
			<h3>Who labelled it</h3>
			<ul>
				{#each annotatorLines(corpus) as line (line)}
					<li>{line}</li>
				{/each}
			</ul>
			<h3>Who has been scored on it</h3>
			{#if corpus.heldOut}
				<p class="hint">
					Held out: written after the question set <code>{corpus.questions?.id}</code> was frozen.
				</p>
			{/if}
			{#if corpus.seenBy.length === 0}
				<p class="hint">No reader yet.</p>
			{:else}
				<table aria-label="Readers scored, {corpus.name}">
					<thead>
						<tr><th>Reader</th><th>Questions</th><th>On</th></tr>
					</thead>
					<tbody>
						{#each corpus.seenBy as seen (`${seen.readerId}|${seen.questions}`)}
							<tr><td>{seen.readerId}</td><td>{seen.questions}</td><td>{seen.on}</td></tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</section>
	{/each}
</main>

<style>
	main {
		display: grid;
		gap: var(--cab-space-3);
		align-content: start;
	}
	.crumb {
		margin: 0;
		font-size: var(--cab-text-sm);
	}
	h1,
	h2 {
		margin: 0;
	}
	h3 {
		margin: var(--cab-space-2) 0 0;
		font-size: var(--cab-text-sm);
	}
	.lede {
		max-width: 70ch;
		margin: 0;
		color: var(--cab-ink-muted);
	}
	.hint,
	.digest {
		margin: 0;
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted);
	}
	.finding {
		margin: 0;
		font-weight: 600;
	}
	.simulation {
		display: inline-block;
		justify-self: start;
		margin: 0;
		padding: var(--cab-space-1) var(--cab-space-2);
		font-size: var(--cab-text-xs);
		font-weight: 700;
		letter-spacing: 0.08em;
		border: 2px solid var(--cab-ink);
		border-radius: var(--cab-radius-pill);
	}
	section {
		display: grid;
		gap: var(--cab-space-2);
	}
	.tables {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-4);
	}
	table {
		border-collapse: collapse;
		font-size: var(--cab-text-sm);
	}
	caption {
		text-align: left;
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted);
	}
	th,
	td {
		padding: var(--cab-space-1) var(--cab-space-2);
		text-align: left;
		border-bottom: 1px solid color-mix(in srgb, var(--cab-ink) 12%, transparent);
	}
	code {
		font-family: var(--cab-font-mono);
		word-break: break-all;
	}
	ul {
		margin: 0;
	}
</style>
