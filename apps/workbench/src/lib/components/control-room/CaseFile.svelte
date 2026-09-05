<script lang="ts">
	import type { DeskRecord } from '@craftabot/core';

	/**
	 * **CaseFile** (WP57, `44-CONTROL-ROOM.md` §4.4): the Desk's records as
	 * the world has revealed them, grouped by `kind`, each with a
	 * classification badge whose title says why it is shown. `truth` is
	 * WP54's flap — records the evaluators alone may read, drawn behind
	 * `--cab-truth` after a run ends and never during one. The
	 * `desk-record-{id}` ids are the contract WP53's e2e reads.
	 */
	interface Props {
		records: readonly DeskRecord[];
		/** The case file's truth, shown only once a run has ended (WP54). */
		truth?: readonly DeskRecord[] | undefined;
		testId?: string;
	}

	let { records, truth, testId = 'desk-case-file' }: Props = $props();

	const group = (list: readonly DeskRecord[]): [string, DeskRecord[]][] => {
		const groups: [string, DeskRecord[]][] = [];
		for (const record of list) {
			const found = groups.find(([kind]) => kind === record.kind);
			if (found) found[1].push(record);
			else groups.push([record.kind, [record]]);
		}
		return groups;
	};

	const byKind = $derived(group(records));
	const truthByKind = $derived(truth ? group(truth) : []);

	const CLASSIFICATION_TITLE: Record<string, string> = {
		personal: 'Personal data — shown because this desk needs it.',
		'special-category': 'Special-category data — shown only for this desk’s purpose.'
	};
</script>

<section class="case-file" aria-label="Case file" data-testid={testId}>
	<h3>Case file</h3>
	{#if records.length === 0}
		<p class="empty">Nothing on the desk yet.</p>
	{:else}
		{#each byKind as [kind, group] (kind)}
			<h4>{kind}</h4>
			{#each group as record (record.id)}
				<article
					data-testid="desk-record-{record.id}"
					data-classification={record.classification}
					aria-label="{record.title}{record.classification && record.classification !== 'public'
						? `, ${record.classification}`
						: ''}"
				>
					<h5>
						{record.title}
						{#if record.classification && record.classification !== 'public'}
							<span class="badge" title={CLASSIFICATION_TITLE[record.classification]}
								>{record.classification}</span
							>
						{/if}
					</h5>
					<dl>
						{#each Object.entries(record.fields) as [key, value] (key)}
							<dt>{key.replaceAll('_', ' ')}</dt>
							<dd>{value === null ? '—' : String(value)}</dd>
						{/each}
					</dl>
				</article>
			{/each}
		{/each}
	{/if}
	{#if truth && truth.length > 0}
		<details class="truth" data-testid="desk-truth">
			<summary>Case file (truth) — what was actually so</summary>
			{#each truthByKind as [kind, group] (kind)}
				<h4>{kind}</h4>
				{#each group as record (record.id)}
					<article data-testid="desk-truth-{record.id}">
						<h5>{record.title}</h5>
						<dl>
							{#each Object.entries(record.fields) as [key, value] (key)}
								<dt>{key.replaceAll('_', ' ')}</dt>
								<dd>{value === null ? '—' : String(value)}</dd>
							{/each}
						</dl>
					</article>
				{/each}
			{/each}
		</details>
	{/if}
</section>

<style>
	.case-file {
		min-width: 0;
		padding: var(--cab-space-3);
		background: var(--cab-paper);
		border-radius: var(--cab-radius-part);
		color: var(--cab-ink);
	}

	h3 {
		margin: 0 0 var(--cab-space-2);
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--cab-engrave);
	}

	h4 {
		margin: var(--cab-space-2) 0 var(--cab-space-1);
		font-size: var(--cab-text-sm);
		text-transform: capitalize;
	}

	h5 {
		margin: 0;
		font-size: var(--cab-text-base);
	}

	.empty {
		margin: 0;
		color: var(--cab-ink-muted);
	}

	article {
		margin-bottom: var(--cab-space-2);
	}

	.badge {
		margin-left: var(--cab-space-2);
		font-size: var(--cab-text-xs);
		font-weight: 400;
		padding: 0 var(--cab-space-1);
		border: 1px solid var(--cab-ink);
		border-radius: var(--cab-radius-pill);
	}

	dl {
		margin: var(--cab-space-1) 0 0;
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0 var(--cab-space-2);
		font-size: var(--cab-text-sm);
	}

	dt {
		color: var(--cab-ink-muted);
		text-transform: capitalize;
	}

	dd {
		margin: 0;
	}

	.truth {
		margin-top: var(--cab-space-3);
		padding: var(--cab-space-2);
		border: 2px dashed var(--cab-truth);
		border-radius: var(--cab-radius-part);
	}

	.truth summary {
		cursor: pointer;
		font-weight: 700;
		color: var(--cab-truth);
	}
</style>
