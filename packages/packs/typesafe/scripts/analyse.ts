/**
 * **The corpus analysis** (`98-JEV.md` §9–§11): Jev's recorded answers
 * against the labels, beside the bank's regex. It reads the cassette and the
 * corpus and makes no call.
 *
 *     node scripts/analyse.ts [v1|v2|v3] [q1|q2]
 *
 * It writes `experiment/results-<corpus>-<questions>.{json,md,csv}`. The CSV
 * has one line per row and question, for charts. The two first runs keep
 * their original names: v1 q1 is `results.*` and v2 q1 is `results-v2.*`.
 * Under q2 it adds the steer: P(steer) against the `steer` tag, and the gate
 * sends a steered request to a person as the workflow's gate does.
 *
 * Every figure is a count over the corpus's rows, with a Wilson 95% interval on
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
	SERVICING_CORPUS_V2,
	SERVICING_CORPUS_V3,
	STEER_THRESHOLD,
	servicingJevRequest,
	type CorpusRow,
	type JevChoiceAnswer,
	type JevResponse
} from '../dist/index.js';

type Question = 'category' | 'need';
const QUESTIONS: Question[] = ['category', 'need'];
const PRICE_PER_MTOK = 0.042;
const VERSION = process.argv[2] ?? 'v1';
const QV = process.argv[3] ?? 'q1';
const CORPORA: Record<string, readonly CorpusRow[]> = {
	v1: SERVICING_CORPUS,
	v2: SERVICING_CORPUS_V2,
	v3: SERVICING_CORPUS_V3
};
const CORPUS = CORPORA[VERSION] ?? [];
if (CORPUS.length === 0) throw new Error(`no corpus '${VERSION}' — try v1, v2 or v3`);
if (QV !== 'q1' && QV !== 'q2') throw new Error(`no questions '${QV}' — try q1 or q2`);
const QUESTIONS_VERSION = QV === 'q2' ? 2 : 1;
const LEGACY: Record<string, string> = { 'v1-q1': 'results', 'v2-q1': 'results-v2' };
const OUT = `experiment/${LEGACY[`${VERSION}-${QV}`] ?? `results-${VERSION}-${QV}`}`;

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
	/** q2's P(the caller steers the label), on the request's call only. */
	steer?: number;
}

const readings: Reading[] = [];
for (const row of CORPUS) {
	for (const question of QUESTIONS) {
		const entry = byDigest.get(
			await argsDigest(servicingJevRequest(question, row.text, QUESTIONS_VERSION))
		);
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
			inputTokens: entry.result.data!.usage.input_tokens,
			...(entry.result.data!.answers['steer']?.type === 'noul'
				? { steer: entry.result.data!.answers['steer'].noul }
				: {})
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

const TAGS = [...new Set(CORPUS.map((row) => row.tag))];
const CONTESTED = CORPUS.filter((row) => row.contested).length;

/** Right by the primary label, or by the blind second labeller's where they differ. */
const eitherLabeller = (rows: Reading[]) =>
	rate(
		rows.filter(
			(r) =>
				r.jev === r.label ||
				(r.question === 'need' && r.jev === r.row.secondNeed) ||
				(r.question === 'category' && r.jev === r.row.secondCategory)
		).length,
		rows.length
	);

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
		// A gate (not the open desk) also sends a steered call to a person, as the workflow's gate does.
		const steered = (r: Reading) => r.steer !== undefined && r.steer >= STEER_THRESHOLD;
		const gates = [0, ...GATE_THRESHOLDS, 0.95, 0.99].map((threshold) => {
			const auto = rows.filter((r) => r.confidence >= threshold && !(threshold > 0 && steered(r)));
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
				contested: r.row.contested !== undefined,
				secondNeed: r.question === 'need' ? r.row.secondNeed : undefined,
				secondCategory: r.question === 'category' ? r.row.secondCategory : undefined,
				steer: r.steer,
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
				uncontested: {
					regex: accuracy(
						rows.filter((r) => !r.row.contested),
						'regex'
					),
					jev: accuracy(
						rows.filter((r) => !r.row.contested),
						'jev'
					)
				},
				jevEitherLabeller: eitherLabeller(rows),
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

// The steer (q2): P(steer) at or above the threshold, against the `steer` tag.
function steerDetection() {
	const rows = readings.filter((r) => r.question === 'category' && r.steer !== undefined);
	if (rows.length === 0) return undefined;
	const flagged = (r: Reading) => r.steer! >= STEER_THRESHOLD;
	const isSteer = (r: Reading) => r.row.tag === 'steer';
	const tp = rows.filter((r) => isSteer(r) && flagged(r)).length;
	const fn = rows.filter((r) => isSteer(r) && !flagged(r)).length;
	const fp = rows.filter((r) => !isSteer(r) && flagged(r)).length;
	const tn = rows.filter((r) => !isSteer(r) && !flagged(r)).length;
	return {
		threshold: STEER_THRESHOLD,
		tp,
		fn,
		fp,
		tn,
		recall: rate(tp, tp + fn),
		precision: rate(tp, tp + fp),
		missedOrFalse: rows
			.filter((r) => isSteer(r) !== flagged(r))
			.map((r) => ({
				id: r.row.id,
				tag: r.row.tag,
				steer: Number(r.steer!.toFixed(3)),
				text: r.row.text
			}))
	};
}
const steer = steerDetection();

const results = {
	recordedAt: cassette.recordedAt.slice(0, 10),
	model: 'jev-1.13.0',
	corpus: VERSION,
	questions: QV,
	rows: CORPUS.length,
	contested: CONTESTED,
	calls: readings.length,
	byQuestion,
	detection: { regex: detection('regex'), jev: detection('jev') },
	...(steer ? { steer } : {}),
	latencyMs: {
		p50: quantile(latency, 0.5),
		p95: quantile(latency, 0.95),
		max: Math.max(...latency)
	},
	inputTokens: { mean: totalTokens / tokens.length, total: totalTokens },
	costUsd: {
		total: (totalTokens / 1e6) * PRICE_PER_MTOK,
		perCase: ((totalTokens / 1e6) * PRICE_PER_MTOK) / CORPUS.length
	}
};
writeFileSync(`${OUT}.json`, `${JSON.stringify(results, null, '\t')}\n`);

// ── CSV: one line per row and question, for charts in a report ─────────

const csvCell = (value: unknown) => {
	const text = value === undefined ? '' : String(value);
	return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const CSV_HEADER = [
	'corpus',
	'questions',
	'row',
	'question',
	'tag',
	'contested',
	'label',
	'second_label',
	'regex',
	'regex_right',
	'jev',
	'jev_right',
	'confidence',
	'top_probability',
	'steer',
	'steer_tag',
	'latency_ms',
	'input_tokens',
	'text'
];
const csv = [
	CSV_HEADER.join(','),
	...readings.map((r) =>
		[
			VERSION,
			QV,
			r.row.id,
			r.question,
			r.row.tag,
			r.row.contested ? 'yes' : 'no',
			r.label,
			r.question === 'need' ? r.row.secondNeed : r.row.secondCategory,
			r.regex,
			r.regex === r.label ? 1 : 0,
			r.jev,
			r.jev === r.label ? 1 : 0,
			r.confidence.toFixed(4),
			(r.probabilities[r.jev] ?? 0).toFixed(4),
			r.steer?.toFixed(4),
			r.row.tag === 'steer' ? 1 : 0,
			r.latencyMs,
			r.inputTokens,
			r.row.text
		]
			.map(csvCell)
			.join(',')
	)
];
writeFileSync(`${OUT}.csv`, `${csv.join('\n')}\n`);

// ── Markdown ───────────────────────────────────────────────────────────

/** A transcript's turns on one line, so a table row stays one row. */
const oneLine = (text: string) => text.replaceAll('\n', ' / ');

const lines: string[] = [];
lines.push(`# Jev on the servicing corpus ${VERSION}, questions ${QV} — results`, '');
lines.push(
	`Recorded ${cassette.recordedAt.slice(0, 10)} against \`jev-1.13.0\`; ${CORPUS.length} rows (${CONTESTED} contested), ${readings.length} calls. Rates are counts with a Wilson 95% interval.`,
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
	if (CONTESTED > 0) {
		lines.push(`| uncontested rows | ${pct(q.uncontested.regex)} | ${pct(q.uncontested.jev)} |`);
		lines.push(`| Jev, right by either labeller | | ${pct(q.jevEitherLabeller)} |`);
	}
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
			`| ${e.id}${e.contested ? ' ⚑' : ''} | ${e.tag} | ${e.label}${e.secondNeed ? ` (2nd: ${e.secondNeed})` : ''}${e.secondCategory ? ` (2nd: ${e.secondCategory})` : ''} | ${e.regex === e.label ? '✓' : e.regex} | ${e.jev === e.label ? '✓' : e.jev} (${e.confidence.toFixed(2)}${e.steer !== undefined ? `; steer ${e.steer.toFixed(2)}` : ''}) | ${oneLine(e.text)} |`
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
if (steer) {
	lines.push(
		'',
		`## The steer (P ≥ ${steer.threshold} against the \`steer\` tag)`,
		'',
		'| recall | precision | tp / fn / fp / tn |',
		'|---|---|---|',
		`| ${pct(steer.recall)} | ${pct(steer.precision)} | ${steer.tp} / ${steer.fn} / ${steer.fp} / ${steer.tn} |`,
		''
	);
	if (steer.missedOrFalse.length > 0) {
		lines.push('| row | tag | P(steer) | text |', '|---|---|---|---|');
		for (const m of steer.missedOrFalse)
			lines.push(`| ${m.id} | ${m.tag} | ${m.steer.toFixed(2)} | ${oneLine(m.text)} |`);
	}
}
lines.push(
	'',
	`## Latency and cost`,
	'',
	`Per call as recorded (one question each): p50 ${results.latencyMs.p50} ms, p95 ${results.latencyMs.p95} ms, max ${results.latencyMs.max} ms. Mean ${results.inputTokens.mean.toFixed(0)} input tokens; the whole corpus (${readings.length} calls) cost $${results.costUsd.total.toFixed(5)} — $${results.costUsd.perCase.toFixed(6)} a case.`,
	''
);
if (CONTESTED > 0)
	lines.push(
		'⚑ contested: the label is a judgment call (see the corpus file); 2nd: the blind second labeller’s label where it differs.',
		''
	);
writeFileSync(`${OUT}.md`, `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
