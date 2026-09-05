<script lang="ts">
	import type { DeskRecord, DeskWorldState, RunOutcome } from '@craftabot/core';

	/**
	 * **The Desk** (WP53, `43-DESK-WORLDS.md` §4.2 and §4.7): three panes over
	 * `DeskWorldState` and nothing else — the transcript, the case file as
	 * the world has revealed it, the queue — plus an alerts strip and the
	 * "FOR SIMULATION ONLY" strip every Desk carries in every mode (`41-…`
	 * §13). The state comes entirely from `world.changed` events (hard rule
	 * 3), the same way `WorldView`'s does; nothing here reaches the engine.
	 *
	 * Tokens only, and the Kit's; the Workshop's `[data-mode='workshop']`
	 * layer densifies it as it does every screen. Every lane carries a label
	 * and a glyph, never colour alone: the agent's lane in the Actions red
	 * (what a bot *does*), the counterpart's in ink, the system's in muted
	 * ink. The transcript is a live region. Rows become focusable when WP57
	 * makes them interactive (a queue item that scrolls the case file); until
	 * then they are content. WP57 rebuilds this on the Control Room's
	 * `Transcript`, `CaseFile` and `Queue`; the test ids are the contract
	 * those keep.
	 *
	 * `data-testid="world-view"` on the outer element on purpose: every e2e
	 * that waits for "the world" keeps its selector whichever world it is.
	 */
	interface Props {
		world: DeskWorldState;
		outcome?: RunOutcome | undefined;
	}

	let { world, outcome }: Props = $props();

	/** Records grouped by `kind`, in the order each kind first appeared. */
	const byKind = $derived.by(() => {
		const groups: [string, DeskRecord[]][] = [];
		for (const record of world.records) {
			const group = groups.find(([kind]) => kind === record.kind);
			if (group) group[1].push(record);
			else groups.push([record.kind, [record]]);
		}
		return groups;
	});

	const label = $derived(
		`${world.desk.title}. ${world.transcript.length} lines said, ${world.records.length} records on the desk, ${world.queue.length} in the queue.`
	);

	const LANE: Record<
		DeskWorldState['transcript'][number]['speaker'],
		{ glyph: string; fallback: string }
	> = {
		agent: { glyph: '▶', fallback: 'Bot' },
		counterpart: { glyph: '◀', fallback: 'Visitor' },
		system: { glyph: '•', fallback: 'Desk' }
	};

	const CLASSIFICATION_TITLE: Record<string, string> = {
		personal: 'Personal data — shown because this desk needs it.',
		'special-category': 'Special-category data — shown only for this desk’s purpose.'
	};
</script>

<div class="desk" data-testid="world-view" data-world="desk" role="region" aria-label={label}>
	<p class="simulation" data-testid="desk-simulation-only">FOR SIMULATION ONLY</p>

	<header class="head">
		<h2 class="title" data-testid="desk-title">{world.desk.title}</h2>
		<p class="role">{world.desk.role}</p>
		{#if outcome}
			<p class="outcome" data-outcome={outcome}>{outcome}</p>
		{/if}
	</header>

	{#if world.alerts.length > 0}
		<ul class="alerts" aria-label="Alerts" data-testid="desk-alerts">
			{#each world.alerts as alert (alert.id)}
				<li data-severity={alert.severity}>
					<span class="severity">{alert.severity}</span>
					{alert.text}
				</li>
			{/each}
		</ul>
	{/if}

	<div class="panes">
		<section class="pane transcript" aria-label="Transcript" data-testid="desk-transcript">
			<h3>Transcript</h3>
			{#if world.transcript.length === 0}
				<p class="empty">Nothing has been said yet.</p>
			{:else}
				<!-- The live region wraps the list rather than being it: a list with another role has no list items, as far as a reader is concerned. -->
				<div role="log" aria-live="polite" aria-relevant="additions">
					<ol>
						{#each world.transcript as line (line.seq)}
							<li data-testid="desk-line-{line.seq}" data-speaker={line.speaker}>
								<span class="speaker">
									<span class="glyph" aria-hidden="true">{LANE[line.speaker].glyph}</span>
									{line.speakerName || LANE[line.speaker].fallback}
									{#if line.channel}
										<span class="channel">on {line.channel}</span>
									{/if}
								</span>
								<span class="text">{line.text}</span>
							</li>
						{/each}
					</ol>
				</div>
			{/if}
		</section>

		<section class="pane records" aria-label="Case file" data-testid="desk-case-file">
			<h3>Case file</h3>
			{#if world.records.length === 0}
				<p class="empty">Nothing on the desk yet.</p>
			{:else}
				{#each byKind as [kind, records] (kind)}
					<h4>{kind}</h4>
					{#each records as record (record.id)}
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
		</section>

		<section class="pane queue" aria-label="Queue" data-testid="desk-queue">
			<h3>Queue</h3>
			{#if world.queue.length === 0}
				<p class="empty">The queue is empty.</p>
			{:else}
				<ul>
					{#each world.queue as item (item.id)}
						<li
							data-testid="desk-queue-{item.id}"
							data-status={item.status}
							aria-label="{item.title}, {item.status}{item.decision ? `: ${item.decision}` : ''}"
						>
							<span class="status">{item.status}</span>
							<span class="item-title">{item.title}</span>
							{#if item.decision}
								<span class="decision">{item.decision}</span>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</div>

<style>
	.desk {
		display: grid;
		gap: var(--cab-space-3);
		padding: var(--cab-space-4);
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink);
		border-radius: var(--cab-radius-panel);
		color: var(--cab-ink);
	}

	.simulation {
		margin: 0;
		justify-self: start;
		padding: var(--cab-space-1) var(--cab-space-2);
		font-size: var(--cab-text-xs);
		font-weight: 700;
		letter-spacing: 0.08em;
		border: 2px solid var(--cab-ink);
		border-radius: var(--cab-radius-pill);
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-2) var(--cab-space-3);
		align-items: baseline;
	}

	.title {
		margin: 0;
		font-size: var(--cab-text-lg);
	}

	.role,
	.outcome {
		margin: 0;
		color: var(--cab-ink-muted);
	}

	.alerts {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: var(--cab-space-1);
	}

	.alerts li {
		padding: var(--cab-space-1) var(--cab-space-2);
		border-left: 4px solid var(--cab-yellow);
		background: var(--cab-paper);
	}

	.alerts li[data-severity='critical'] {
		border-left-color: var(--cab-red);
	}

	.severity {
		font-size: var(--cab-text-xs);
		font-weight: 700;
		text-transform: uppercase;
		margin-right: var(--cab-space-2);
	}

	.panes {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr);
		gap: var(--cab-space-3);
	}

	@media (max-width: 900px) {
		.panes {
			grid-template-columns: 1fr;
		}
	}

	.pane {
		min-width: 0;
		padding: var(--cab-space-3);
		background: var(--cab-paper);
		border-radius: var(--cab-radius-part);
	}

	.pane h3 {
		margin: 0 0 var(--cab-space-2);
		font-size: var(--cab-text-sm);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--cab-ink-muted);
	}

	.pane h4 {
		margin: var(--cab-space-2) 0 var(--cab-space-1);
		font-size: var(--cab-text-sm);
		text-transform: capitalize;
	}

	.pane h5 {
		margin: 0;
		font-size: var(--cab-text-base);
	}

	.empty {
		margin: 0;
		color: var(--cab-ink-muted);
	}

	.transcript ol,
	.queue ul {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: var(--cab-space-2);
	}

	.transcript li {
		display: grid;
		gap: var(--cab-space-1);
		padding: var(--cab-space-2);
		border-radius: var(--cab-radius-part);
		border-left: 4px solid var(--cab-ink-muted);
		background: var(--cab-cream);
	}

	.transcript li[data-speaker='agent'] {
		border-left-color: var(--cab-red);
		margin-left: var(--cab-space-4);
	}

	.transcript li[data-speaker='counterpart'] {
		border-left-color: var(--cab-ink);
		margin-right: var(--cab-space-4);
	}

	.transcript li[data-speaker='system'] {
		text-align: center;
		color: var(--cab-ink-muted);
	}

	.speaker {
		font-size: var(--cab-text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.glyph {
		margin-right: var(--cab-space-1);
	}

	.channel {
		margin-left: var(--cab-space-2);
		font-weight: 400;
		text-transform: none;
		letter-spacing: 0;
		color: var(--cab-ink-muted);
	}

	.records article {
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

	.queue li {
		display: grid;
		gap: var(--cab-space-1);
		padding: var(--cab-space-2);
		background: var(--cab-cream);
		border-radius: var(--cab-radius-part);
	}

	.status {
		font-size: var(--cab-text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.queue li[data-status='decided'] .status {
		color: var(--cab-green-text);
	}

	.queue li[data-status='escalated'] .status {
		color: var(--cab-red-text);
	}

	.decision {
		font-size: var(--cab-text-sm);
		color: var(--cab-ink-muted);
	}
</style>
