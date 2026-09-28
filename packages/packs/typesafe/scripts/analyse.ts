/**
 * **The corpus analysis** (`98-JEV.md` §9): Jev's recorded answers against
 * the labels, beside the bank's regex. It reads the cassette and the corpus
 * and makes no call. It writes `experiment/results.json` and
 * `experiment/results.md`.
 *
 * Every figure is a count over the 95 rows, with a Wilson 95% interval on
 * each rate, because the corpus is small and the intervals are wide. The
 * slices are:
 * - by question;
 * - by the author's difficulty tag;
 * - the confusion matrix;
 * - calibration: reliability bins, the expected calibration error and the
 *   Brier score;
 * - the gate: how many rows each threshold sends to a person, and the accuracy
 *   of the rest;
 * - latency and tokens per call, as the recording timed them.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { argsDigest } from '@craftabot/core';
import { classificationOf, needIn } from '@craftabot/pack-fs-servicing';
import {
	GATE_THRESHOLDS,
	SERVICING_CORPUS,
	servicingJevRequest,
	type CorpusRow,
	type JevChoiceAnswer,
	type JevResponse
} from '../dist/index.js';

type Question = 'category' | 'need';
const QUESTIONS: Question[] = ['category', 'need'];
const PRICE_PER_MTOK = 0.042;

interface Entry {
	argsDigest: string;
	latencyMs: number;
	result: { ok: boolean; data?: JevResponse };
}
const cassette = JSON.parse(
	readFileSync('src/cassettes/typesafe-jev.craftabot-cassette.json', 'utf8')
) as { recordedAt: string; entries: Entry[] };
const byDigest = new Map(cassette.entries.map((entry) => [entry.argsDigest, entry]));

interface Reading {
	row: CorpusRow;
	question: Question;
	label: string;
	regex: string;
	jev: string;
	confidence: number;
	probabilities: Record<string, number>;
	latencyMs: number;
	inputTokens: number;
}

const readings: Reading[] = [];
for (const row of SERVICING_CORPUS) {
	for (const question of QUESTIONS) {
		const entry = byDigest.get(await argsDigest(servicingJevRequest(question, row.text)));
		const answer = entry?.result.data?.answers[question] as JevChoiceAnswer | undefined;
		if (!entry || !answer)
			throw new Error(`no recorded answer for ${row.id}/${question} — re-record`);
		readings.push({
			row,
			question,
			label: question === 'category' ? row.category : row.need,
			regex: question === 'category' ? classificationOf(row.text) : needIn(row.text),
			jev: answer.choice,
			confidence: answer.confidence,
			probabilities: answer.probabilities,
			latencyMs: entry.latencyMs,
			inputTokens: entry.result.data!.usage.input_tokens
		});
	}
}

// ── Statistics ─────────────────────────────────────────────────────────

/** Wilson score interval, 95%. */
function wilson(k: number, n: number): [number, number] {
	if (n === 0) return [0, 1];
	const z = 1.959964;
	const p = k / n;
	const d = 1 + (z * z) / n;
	const centre = (p + (z * z) / (2 * n)) / d;
	const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
	return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

interface Rate {
	k: number;
	n: number;
	rate: number;
	ci: [number, number];
}
const rate = (k: number, n: number): Rate => ({
	k,
	n,
	rate: n === 0 ? 0 : k / n,
	ci: wilson(k, n)
});
const pct = (r: Rate) =>
	r.n === 0
		? '—'
		: `${(100 * r.rate).toFixed(0)}% (${r.k}/${r.n}; ${(100 * r.ci[0]).toFixed(0)}–${(100 * r.ci[1]).toFixed(0)})`;

const accuracy = (rows: Reading[], who: 'regex' | 'jev') =>
	rate(rows.filter((r) => r[who] === r.label).length, rows.length);

function quantile(values: number[], q: number): number {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
}

// ── Folds ──────────────────────────────────────────────────────────────

const TAGS = ['plain', 'paraphrase', 'trap', 'mixed'] as const;

const byQuestion = Object.fromEntries(
	QUESTIONS.map((question) => {
		const rows = readings.filter((r) => r.question === question);
		const options = Object.keys(rows[0]!.probabilities);
		const confusion = (who: 'regex' | 'jev') =>
			Object.fromEntries(
				options.map((label) => [
					label,
					Object.fromEntries(
						options.map((picked) => [
							picked,
							rows.filter((r) => r.label === label && r[who] === picked).length
						])
					)
				])
			);
		// Calibration: the top choice's probability against whether it was right.
		const bins = [0, 0.5, 0.7, 0.8, 0.9, 0.95, 0.99, 1.0001];
		const reliability = bins.slice(0, -1).map((lo, i) => {
			const hi = bins[i + 1]!;
			const inBin = rows.filter((r) => {
				const p = r.probabilities[r.jev] ?? 0;
				return p >= lo && p < hi;
			});
			const meanP =
				inBin.reduce((s, r) => s + (r.probabilities[r.jev] ?? 0), 0) / Math.max(1, inBin.length);
			return {
				from: lo,
				to: Math.min(1, hi),
				n: inBin.length,
				meanProbability: meanP,
				accuracy: accuracy(inBin, 'jev')
			};
		});
		const ece =
			reliability.reduce(
				(s, bin) => s + bin.n * Math.abs(bin.meanProbability - bin.accuracy.rate),
				0
			) / rows.length;
		// Multi-class Brier over the whole distribution.
		const brier =
			rows.reduce(
				(s, r) =>
					s +
					options.reduce(
						(t, o) => t + ((r.probabilities[o] ?? 0) - (o === r.label ? 1 : 0)) ** 2,
						0
					),
				0
			) / rows.length;
		const gates = [0, ...GATE_THRESHOLDS, 0.95, 0.99].map((threshold) => {
			const auto = rows.filter((r) => r.confidence >= threshold);
			return {
				threshold,
				toPerson: rate(rows.length - auto.length, rows.length),
				autoAccuracy: accuracy(auto, 'jev'),
				/** With a reviewer who is always right, the rows sent to a person are right. */
				endToEnd: rate(
					auto.filter((r) => r.jev === r.label).length + (rows.length - auto.length),
					rows.length
				)
			};
		});
		const errors = rows
			.filter((r) => r.jev !== r.label || r.regex !== r.label)
			.map((r) => ({
				id: r.row.id,
				tag: r.row.tag,
				text: r.row.text,
				label: r.label,
				regex: r.regex,
				jev: r.jev,
				confidence: Number(r.confidence.toFixed(3))
			}));
		return [
			question,
			{
				n: rows.length,
				regex: accuracy(rows, 'regex'),
				jev: accuracy(rows, 'jev'),
				byTag: Object.fromEntries(
					TAGS.map((tag) => {
						const inTag = rows.filter((r) => r.row.tag === tag);
						return [
							tag,
							{ n: inTag.length, regex: accuracy(inTag, 'regex'), jev: accuracy(inTag, 'jev') }
						];
					})
				),
				confusion: { regex: confusion('regex'), jev: confusion('jev') },
				calibration: { reliability, ece, brier },
				gates,
				errors
			}
		];
	})
);

// Vulnerability detection: any need recorded, against any need disclosed.
function detection(who: 'regex' | 'jev') {
	const rows = readings.filter((r) => r.question === 'need');
	const tp = rows.filter((r) => r.label !== 'none' && r[who] !== 'none').length;
	const fn = rows.filter((r) => r.label !== 'none' && r[who] === 'none').length;
	const fp = rows.filter((r) => r.label === 'none' && r[who] !== 'none').length;
	const tn = rows.filter((r) => r.label === 'none' && r[who] === 'none').length;
	return { tp, fn, fp, tn, recall: rate(tp, tp + fn), precision: rate(tp, tp + fp) };
}

const latency = readings.map((r) => r.latencyMs);
const tokens = readings.map((r) => r.inputTokens);
const totalTokens = tokens.reduce((s, t) => s + t, 0);

const results = {
	recordedAt: cassette.recordedAt,
	model: 'jev-1.13.0',
	rows: SERVICING_CORPUS.length,
	calls: readings.length,
	byQuestion,
	detection: { regex: detection('regex'), jev: detection('jev') },
	latencyMs: {
		p50: quantile(latency, 0.5),
		p95: quantile(latency, 0.95),
		max: Math.max(...latency)
	},
	inputTokens: { mean: totalTokens / tokens.length, total: totalTokens },
	costUsd: {
		total: (totalTokens / 1e6) * PRICE_PER_MTOK,
		perCase: ((totalTokens / 1e6) * PRICE_PER_MTOK) / SERVICING_CORPUS.length
	}
};
writeFileSync('experiment/results.json', `${JSON.stringify(results, null, '\t')}\n`);

// ── Markdown ───────────────────────────────────────────────────────────

const lines: string[] = [];
lines.push(`# Jev on the servicing corpus — results`, '');
lines.push(
	`Recorded ${cassette.recordedAt} against \`jev-1.13.0\`; ${SERVICING_CORPUS.length} rows, ${readings.length} calls. Rates are counts with a Wilson 95% interval.`,
	''
);
for (const question of QUESTIONS) {
	const q = byQuestion[question] as (typeof byQuestion)[string];
	lines.push(
		`## ${question === 'category' ? 'The request (classify)' : 'The support need (record)'}`,
		''
	);
	lines.push('| | regex | Jev |', '|---|---|---|');
	lines.push(`| all rows | ${pct(q.regex)} | ${pct(q.jev)} |`);
	for (const tag of TAGS)
		lines.push(`| ${tag} | ${pct(q.byTag[tag]!.regex)} | ${pct(q.byTag[tag]!.jev)} |`);
	lines.push(
		'',
		`**Calibration:** ECE ${q.calibration.ece.toFixed(3)}, Brier ${q.calibration.brier.toFixed(3)}.`,
		''
	);
	lines.push('| top probability | n | mean p | accuracy |', '|---|---|---|---|');
	for (const bin of q.calibration.reliability.filter((b) => b.n > 0))
		lines.push(
			`| ${bin.from.toFixed(2)}–${bin.to.toFixed(2)} | ${bin.n} | ${bin.meanProbability.toFixed(3)} | ${pct(bin.accuracy)} |`
		);
	lines.push(
		'',
		'**The gate** (a person reviews below the threshold; the reviewer modelled as always right):',
		''
	);
	lines.push(
		'| threshold | to a person | accuracy of the rest | end to end |',
		'|---|---|---|---|'
	);
	for (const gate of q.gates)
		lines.push(
			`| ${gate.threshold.toFixed(2)} | ${pct(gate.toPerson)} | ${pct(gate.autoAccuracy)} | ${pct(gate.endToEnd)} |`
		);
	lines.push('', '**Confusion (rows = label, columns = pick):**', '');
	for (const who of ['regex', 'jev'] as const) {
		const matrix = q.confusion[who] as Record<string, Record<string, number>>;
		const options = Object.keys(matrix);
		lines.push(
			`*${who}*`,
			'',
			`| label \\ pick | ${options.join(' | ')} |`,
			`|---|${options.map(() => '---').join('|')}|`
		);
		for (const label of options)
			lines.push(`| ${label} | ${options.map((o) => matrix[label]![o]).join(' | ')} |`);
		lines.push('');
	}
	lines.push(
		'**Rows either reader got wrong:**',
		'',
		'| row | tag | label | regex | Jev (conf.) | text |',
		'|---|---|---|---|---|---|'
	);
	for (const e of q.errors)
		lines.push(
			`| ${e.id} | ${e.tag} | ${e.label} | ${e.regex === e.label ? '✓' : e.regex} | ${e.jev === e.label ? '✓' : e.jev} (${e.confidence.toFixed(2)}) | ${e.text} |`
		);
	lines.push('');
}
lines.push('## Vulnerability detection (any need recorded vs any need disclosed)', '');
lines.push('| | recall | precision | tp / fn / fp / tn |', '|---|---|---|---|');
for (const who of ['regex', 'jev'] as const) {
	const d = results.detection[who];
	lines.push(
		`| ${who} | ${pct(d.recall)} | ${pct(d.precision)} | ${d.tp} / ${d.fn} / ${d.fp} / ${d.tn} |`
	);
}
lines.push(
	'',
	`## Latency and cost`,
	'',
	`Per call as recorded (one question each): p50 ${results.latencyMs.p50} ms, p95 ${results.latencyMs.p95} ms, max ${results.latencyMs.max} ms. Mean ${results.inputTokens.mean.toFixed(0)} input tokens; the whole corpus (${readings.length} calls) cost $${results.costUsd.total.toFixed(5)} — $${results.costUsd.perCase.toFixed(6)} a case.`,
	''
);
writeFileSync('experiment/results.md', `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
