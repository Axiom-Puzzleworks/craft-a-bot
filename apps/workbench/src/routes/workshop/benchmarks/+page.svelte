<script lang="ts">
	import {
		safeParseBenchmarkReport,
		type BenchmarkReport,
		type BenchmarkSubjectResult
	} from '@craftabot/core';
	import { parseBenchmark, runBenchmark } from '@craftabot/evals';
	import {
		ATTACK_QUESTION,
		BANK_ADVERSARIAL_BENCHMARK,
		GUARD_QUESTION_SET_ID
	} from '@craftabot/pack-fs-bank';
	import Lamp from '$lib/components/control-room/Lamp.svelte';
	import Matrix from '$lib/components/control-room/Matrix.svelte';
	import Readout from '$lib/components/control-room/Readout.svelte';
	import Strip from '$lib/components/control-room/Strip.svelte';
	import { createRegistry } from '$lib/packs.js';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import {
		band,
		howWord,
		measures,
		pct,
		recallMatrix,
		recallTwin
	} from '$lib/workshop/benchmarks.js';

	/**
	 * **Benchmarks** (WP123, `106-BENCHMARK.md` §6; `100-…` §6.6, tenet 37):
	 * every guard on the same adversarial rows. *Synthetic rows* first; then
	 * the stored reports, the one chosen as a table — how each subject
	 * answered, precision, recall, false alarms, what it alone caught — and
	 * recall by attack kind as a Matrix with its twin in words. The page runs
	 * the reference benchmark over the stand-ins and the local readers in the
	 * browser (a stand-in measures nothing, and says so); a report recorded
	 * by the harness (`craftabot benchmark run --record`) is imported here.
	 */
	const registry = createRegistry();
	let reports = $state<BenchmarkReport[]>([]);
	let chosenId = $state('');
	let status = $state('');
	let busy = $state(false);

	const chosen = $derived(reports.find((report) => report.id === chosenId) ?? reports[0]);
	const matrix = $derived(chosen ? recallMatrix(chosen) : undefined);
	const rows = $derived(chosen ? chosen.corpora.reduce((sum, corpus) => sum + corpus.rows, 0) : 0);

	async function load(): Promise<void> {
		const storage = await appStorage();
		reports = await storage.listBenchmarkReports();
	}
	$effect(() => {
		void load();
	});

	async function runHere(): Promise<void> {
		busy = true;
		status = 'Running every subject over the adversarial rows…';
		try {
			const report = await runBenchmark(parseBenchmark(BANK_ADVERSARIAL_BENCHMARK), {
				registry,
				question: { setId: GUARD_QUESTION_SET_ID, questionId: 'attack', noul: ATTACK_QUESTION },
				ranAt: new Date().toISOString()
			});
			await (await appStorage()).putBenchmarkReport(report);
			await load();
			chosenId = report.id;
			status = `Ran ${report.subjects.length} subjects over ${report.corpora.length} corpora.`;
		} catch (error) {
			status = `Could not run: ${error instanceof Error ? error.message : String(error)}`;
		} finally {
			busy = false;
		}
	}

	async function importFile(event: Event): Promise<void> {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		const parsed = safeParseBenchmarkReport(JSON.parse(await file.text()) as unknown);
		if (!parsed.success) {
			status = `Not a benchmark report: ${parsed.error.issues[0]?.message ?? 'unreadable'}`;
			return;
		}
		await (await appStorage()).putBenchmarkReport(parsed.data);
		await load();
		chosenId = parsed.data.id;
		status = `Imported ${parsed.data.id}.`;
	}

	const lampOf = (subject: BenchmarkSubjectResult) =>
		measures(subject) ? 'pass' : subject.applicable ? 'inconclusive' : 'fail';
</script>

<svelte:head><title>Benchmarks — Workshop</title></svelte:head>

<main data-testid="benchmarks-page">
	<div class="top">
		<h1>Benchmarks</h1>
		<div class="actions">
			<button type="button" onclick={runHere} disabled={busy} data-testid="benchmark-run">
				Run over the stand-ins
			</button>
			<label class="import">
				Import a report
				<input type="file" accept="application/json" onchange={importFile} />
			</label>
		</div>
	</div>
	<p class="synthetic" data-testid="benchmark-synthetic">
		<strong>Synthetic rows.</strong> Every row was written for this product and labelled by models,
		over the surfaces each desk has — a third benign, many written to look like attacks. A stand-in
		answers clean whatever it is shown, so a service answered by its stand-in is
		<em>unmeasured</em>, not a zero; a measurement comes from a cassette the harness recorded with a
		key. Real traffic labelled by people is the test these rows cannot stand in for.
	</p>
	{#if status}<p class="muted" role="status">{status}</p>{/if}

	{#if reports.length === 0}
		<p class="muted" data-testid="benchmark-empty">
			No benchmark yet. Run the reference benchmark here, or import a report the harness wrote (<code
				>craftabot benchmark run benchmarks/bank-adversarial.json --out …</code
			>).
		</p>
	{:else if chosen}
		<label class="picker">
			Report
			<select bind:value={chosenId} data-testid="benchmark-picker">
				{#each reports as report (report.id)}
					<option value={report.id}>{report.benchmarkId} — {report.ranAt.slice(0, 16)}</option>
				{/each}
			</select>
		</label>
		<Strip label={chosen.name}>
			<Readout label="rows" value={String(rows)} />
			<Readout
				label="attacks"
				value={String(chosen.corpora.reduce((sum, corpus) => sum + corpus.attacks, 0))}
			/>
			<Readout label="corpora" value={String(chosen.corpora.length)} />
			<Readout label="threshold" value={String(chosen.threshold)} />
			<Readout label="measured" value={String(chosen.subjects.filter(measures).length)} />
		</Strip>

		<table data-testid="benchmark-table">
			<caption>Every subject over the same {rows} rows</caption>
			<thead>
				<tr>
					<th scope="col">Subject</th>
					<th scope="col">How</th>
					<th scope="col">Precision</th>
					<th scope="col">Recall</th>
					<th scope="col">False alarms</th>
					<th scope="col">Caught alone</th>
					<th scope="col">Latency p50 / p95</th>
					<th scope="col">Price</th>
				</tr>
			</thead>
			<tbody>
				{#each chosen.subjects as subject (subject.id)}
					<tr data-testid="benchmark-row-{subject.id.replace(/[^a-z0-9]+/gi, '-')}">
						<th scope="row">
							<Lamp status={lampOf(subject)} label={howWord(subject)} />
							<span class="subject">{subject.name}</span>
							<code>{subject.id}</code>
						</th>
						{#if subject.applicable}
							<td>{howWord(subject)}</td>
							<td>{pct(subject.precision)} <span class="band">{band(subject.precision)}</span></td>
							<td>{pct(subject.recall)} <span class="band">{band(subject.recall)}</span></td>
							<td
								>{pct(subject.falseAlarms)}
								<span class="band">{band(subject.falseAlarms)}</span></td
							>
							<td>{subject.caughtAlone.length}</td>
							<td>{subject.latency ? `${subject.latency.p50} / ${subject.latency.p95} ms` : '—'}</td
							>
							<td>{subject.listPriceUsd === null ? 'not priced' : `$${subject.listPriceUsd}`}</td>
						{:else}
							<td colspan="7">not applicable — {subject.reason}</td>
						{/if}
					</tr>
				{/each}
			</tbody>
		</table>

		{#if matrix && matrix.rows.length > 0}
			<section data-testid="benchmark-recall">
				<h2>Recall by attack kind</h2>
				<Matrix
					corner="subject × kind"
					rows={matrix.rows}
					cols={matrix.cols}
					cell={matrix.cell}
					testId="benchmark-matrix"
				/>
				<ul class="twin" data-testid="benchmark-twin">
					{#each recallTwin(chosen) as line (line)}<li>{line}</li>{/each}
				</ul>
			</section>
		{/if}
		<p class="muted">
			Digest <code>{chosen.digest.slice(0, 16)}…</code> over {chosen.corpora.length} corpora, each held
			out from the guard question set.
		</p>
	{/if}
</main>

<style>
	main {
		display: grid;
		gap: var(--cab-space-4);
		align-content: start;
	}
	.top {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		justify-content: space-between;
		gap: var(--cab-space-3);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-3);
		align-items: center;
	}
	h1 {
		margin: 0;
		font-size: var(--cab-text-xl);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	h2 {
		margin: 0 0 var(--cab-space-2);
		font-size: var(--cab-text-md);
	}
	.synthetic {
		margin: 0;
		padding: var(--cab-space-2) var(--cab-space-3);
		background: var(--cab-cream);
		border: var(--cab-border-part) solid var(--cab-engrave);
		border-radius: var(--cab-radius-panel);
		font-size: var(--cab-text-sm);
	}
	.muted {
		margin: 0;
		font-size: var(--cab-text-sm);
		color: var(--cab-ink-muted);
	}
	.picker,
	.import {
		display: grid;
		gap: var(--cab-space-1);
		font-size: var(--cab-text-sm);
	}
	table {
		border-collapse: collapse;
		font-size: var(--cab-text-sm);
	}
	caption {
		text-align: left;
		font-weight: 600;
		padding-bottom: var(--cab-space-1);
	}
	th,
	td {
		text-align: left;
		padding: var(--cab-space-1) var(--cab-space-2);
		border-bottom: var(--cab-border-part) solid var(--cab-engrave);
		vertical-align: top;
	}
	th[scope='row'] {
		display: grid;
		gap: var(--cab-space-1);
		font-weight: 400;
	}
	.subject {
		font-weight: 600;
	}
	.band {
		color: var(--cab-ink-muted);
		font-size: var(--cab-text-xs);
	}
	.twin {
		margin: var(--cab-space-2) 0 0;
		padding-left: var(--cab-space-4);
		font-size: var(--cab-text-sm);
	}
</style>
