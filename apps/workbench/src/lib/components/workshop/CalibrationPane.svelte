<script lang="ts">
	import type { CalibrationRow } from '@craftabot/evals';
	import { calibrationKey, calibrationSentence, filledBins } from '$lib/workshop/calibration.js';

	/**
	 * **The calibration pane** (WP118, `104-READERS.md` §9): one block per
	 * reader stage in the report — the figures in a sentence, the reliability
	 * table over the bins with answers in them, and the gate curve. The tables
	 * are the pane's own twin: every number is in text.
	 */
	let { rows }: { rows: readonly CalibrationRow[] } = $props();

	const pct = (value: number) => `${Math.round(value * 100)}%`;
	const range = (interval: readonly [number, number], digits = 3) =>
		`[${interval[0].toFixed(digits)}, ${interval[1].toFixed(digits)}]`;
</script>

<section aria-label="Calibration" data-testid="campaign-calibration">
	<h2>Calibration</h2>
	<p class="hint">
		Each reader's answers against the stage's answer key from truth. A rule reader states 1 on every
		answer, so its calibration error is its error rate — the line the other readers are read
		against.
	</p>
	{#each rows as row (calibrationKey(row))}
		<article data-testid="calibration-{row.build}-{row.stageId}-{row.questionId}">
			<h3>{row.build} · {row.stageId} · {row.questionId}</h3>
			<p class="sentence">{calibrationSentence(row)}</p>
			<dl>
				<div>
					<dt>Accuracy</dt>
					<dd>{pct(row.accuracy.value)} <small>{range(row.accuracy.interval, 2)}</small></dd>
				</div>
				<div>
					<dt>ECE</dt>
					<dd>{row.ece.value.toFixed(3)} <small>{range(row.ece.interval)}</small></dd>
				</div>
				<div>
					<dt>Brier</dt>
					<dd>{row.brier.value.toFixed(3)} <small>{range(row.brier.interval)}</small></dd>
				</div>
			</dl>
			<div class="tables">
				<table aria-label="Reliability, {row.stageId}">
					<caption>Reliability</caption>
					<thead>
						<tr>
							<th>Stated</th>
							<th>Answers</th>
							<th>Mean stated</th>
							<th>Right</th>
						</tr>
					</thead>
					<tbody>
						{#each filledBins(row) as bin (bin.label)}
							<tr>
								<td>{bin.label}</td>
								<td>{bin.n}</td>
								<td>{bin.stated.toFixed(3)}</td>
								<td>{pct(bin.right)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
				<table aria-label="Gate curve, {row.stageId}">
					<caption>Gate curve</caption>
					<thead>
						<tr>
							<th>Threshold</th>
							<th>To a person</th>
							<th>Accuracy of the rest</th>
						</tr>
					</thead>
					<tbody>
						{#each row.gates as gate (gate.threshold)}
							<tr>
								<td>{gate.threshold.toFixed(2)}</td>
								<td>{gate.reviewed.k}/{gate.reviewed.n} ({pct(gate.reviewed.value)})</td>
								<td>
									{gate.residualAccuracy.n === 0
										? '—'
										: `${gate.residualAccuracy.k}/${gate.residualAccuracy.n} (${pct(gate.residualAccuracy.value)})`}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</article>
	{/each}
</section>

<style>
	h2 {
		margin: 0 0 var(--cab-space-2);
		font-size: var(--cab-text-sm);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	h3 {
		margin: var(--cab-space-3) 0 var(--cab-space-1);
		font-size: var(--cab-text-sm);
	}
	.hint,
	.sentence {
		margin: var(--cab-space-1) 0 0;
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted);
	}
	dl {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-4);
		margin: var(--cab-space-2) 0;
	}
	dt {
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--cab-ink-muted);
	}
	dd {
		margin: 0;
		font-family: var(--cab-font-mono);
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
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--cab-ink-muted);
	}
	th,
	td {
		padding: var(--cab-space-1) var(--cab-space-2);
		text-align: left;
		border-bottom: 1px solid color-mix(in srgb, var(--cab-ink) 12%, transparent);
	}
	thead th {
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted);
	}
</style>
