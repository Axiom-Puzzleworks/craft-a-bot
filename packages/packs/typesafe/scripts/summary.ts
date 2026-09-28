/**
 * **The summary across every run** (`experiment/README.md`). It reads the
 * corpus analyses for both readers: Jev (`results*.json`/`.csv`) and the
 * DGX Spark classifier (`results-*-spark.*`, `99-DGX-SPARK.md` §6). It also
 * reads the harness experiments (`servicing-*.experiment-result.json`).
 * It writes `experiment/SUMMARY.md`: the master tables a report quotes,
 * with the paired tests (q1 against q2, Jev against the Spark) computed from
 * the per-row CSVs. It makes no call. A run whose files are missing shows "—".
 *
 *     node scripts/summary.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

interface Rate {
	k: number;
	n: number;
	rate: number;
	ci: [number, number];
}
interface QuestionResult {
	n: number;
	regex: Rate;
	reader: Rate;
	uncontested: { regex: Rate; reader: Rate };
	readerEitherLabeller: Rate;
	calibration: { ece: number; brier: number };
	gates: { threshold: number; toPerson: Rate; autoAccuracy: Rate; endToEnd: Rate }[];
}
interface Detection {
	tp: number;
	fn: number;
	fp: number;
	tn: number;
	recall: Rate;
	precision: Rate;
}
interface Results {
	corpus: string;
	questions: string;
	reader: string;
	model: string;
	rows: number;
	contested: number;
	calls: number;
	byQuestion: { category: QuestionResult; need: QuestionResult };
	detection: { regex: Detection; reader: Detection };
	steer?: Detection & { threshold: number };
	latencyMs: { p50: number; p95: number; max: number };
	tokens: {
		tokenizer: string;
		calls: number;
		input: { total: number; perCall: number; perCase: number };
		output: { total: number; perCall: number; perCase: number };
		all: { total: number; perCase: number };
	};
	costUsd: { total: number; perCase: number; perThousandCases: number } | null;
}

type Reader = 'jev' | 'spark' | 'spark35';
const READERS: Reader[] = ['jev', 'spark', 'spark35'];
const LABEL: Record<Reader, string> = { jev: 'Jev', spark: 'Spark 122B', spark35: 'Spark 35B' };
const MODEL: Record<Reader, string> = {
	jev: 'jev-1.13.0, TypeSafe, hosted',
	spark: 'Qwen3.5-122B-A10B on the DGX Sparks',
	spark35: 'Qwen3.6-35B-A3B on the DGX Sparks'
};

const RUNS: { corpus: string; questions: string; note: string }[] = [
	{ corpus: 'v1', questions: 'q1', note: 'first run' },
	{ corpus: 'v2', questions: 'q1', note: 'harder data' },
	{ corpus: 'v3', questions: 'q1', note: 'held out' },
	{ corpus: 'v3', questions: 'q2', note: 'held out — the test of q2' },
	{ corpus: 'v1', questions: 'q2', note: 'regression check' },
	{ corpus: 'v2', questions: 'q2', note: 'seen: q2 was written from v2' }
];

const LEGACY: Record<string, string> = { 'v1-q1': 'results', 'v2-q1': 'results-v2' };
const fileOf = (corpus: string, questions: string, reader: Reader) =>
	reader === 'jev'
		? (LEGACY[`${corpus}-${questions}`] ?? `results-${corpus}-${questions}`)
		: `results-${corpus}-${questions}-${reader}`;

const load = (file: string): Results | undefined =>
	existsSync(`experiment/${file}.json`)
		? (JSON.parse(readFileSync(`experiment/${file}.json`, 'utf8')) as Results)
		: undefined;
const pct = (r: Rate | undefined) => (r ? `${(100 * r.rate).toFixed(0)}%` : '—');
const ci = (r: Rate | undefined) =>
	!r || r.n === 0
		? '—'
		: `${(100 * r.rate).toFixed(0)}% (${r.k}/${r.n}; ${(100 * r.ci[0]).toFixed(0)}–${(100 * r.ci[1]).toFixed(0)})`;
const num = (v: number | undefined, digits = 3) => (v === undefined ? '—' : v.toFixed(digits));

// ── Per-row CSVs, for the paired tests ─────────────────────────────────

function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let quoted = false;
	for (let i = 0; i < text.length; i += 1) {
		const c = text[i]!;
		if (quoted) {
			if (c === '"' && text[i + 1] === '"') {
				cell += '"';
				i += 1;
			} else if (c === '"') quoted = false;
			else cell += c;
		} else if (c === '"') quoted = true;
		else if (c === ',') {
			row.push(cell);
			cell = '';
		} else if (c === '\n') {
			row.push(cell);
			rows.push(row);
			row = [];
			cell = '';
		} else cell += c;
	}
	return rows;
}

function rightByRow(file: string, question: string): Map<string, boolean> | undefined {
	if (!existsSync(`experiment/${file}.csv`)) return undefined;
	const [header, ...rows] = parseCsv(readFileSync(`experiment/${file}.csv`, 'utf8'));
	const at = (name: string) => header!.indexOf(name);
	return new Map(
		rows
			.filter((row) => row[at('question')] === question)
			.map((row) => [row[at('row')]!, row[at('pick_right')] === '1'])
	);
}

const choose = (n: number, k: number) => {
	let c = 1;
	for (let i = 0; i < k; i += 1) c = (c * (n - i)) / (i + 1);
	return c;
};

/** Exact two-sided sign test (McNemar) over the rows where the two disagree on being right. */
function paired(a: string, b: string, question: string) {
	const left = rightByRow(a, question);
	const right = rightByRow(b, question);
	if (!left || !right) return undefined;
	let onlyA = 0;
	let onlyB = 0;
	for (const [row, isRight] of left) {
		const other = right.get(row)!;
		if (isRight && !other) onlyA += 1;
		if (!isRight && other) onlyB += 1;
	}
	const n = onlyA + onlyB;
	let tail = 0;
	for (let i = 0; i <= Math.min(onlyA, onlyB); i += 1) tail += choose(n, i) / 2 ** n;
	return { onlyA, onlyB, p: n === 0 ? 1 : Math.min(1, 2 * tail) };
}

// ── The summary ────────────────────────────────────────────────────────

const loaded = RUNS.map((run) => ({
	...run,
	by: Object.fromEntries(
		READERS.map((reader) => [reader, load(fileOf(run.corpus, run.questions, reader))])
	) as Record<Reader, Results | undefined>
}));
const regexOf = (by: Record<Reader, Results | undefined>) =>
	READERS.map((reader) => by[reader]).find((r) => r !== undefined);
const present = READERS.filter((reader) => loaded.some(({ by }) => by[reader] !== undefined));
const header = (cells: string[]) => [
	`| ${cells.join(' | ')} |`,
	`|${cells.map(() => '---').join('|')}|`
];

const lines: string[] = [
	'# The servicing classifier experiment — the summary across every run',
	'',
	`Generated by \`node scripts/summary.ts\` from the files beside it; every figure traces to a \`results*.json\` / \`results*.csv\` or a \`servicing-*.experiment-result.json\`. Readers against the bank’s regex: ${present.map((reader) => `**${LABEL[reader]}** (${MODEL[reader]})`).join(', ')}. The same questions and corpora; recorded 2026-09-28. Rates with Wilson 95% intervals; "—" is a run not recorded.`,
	'',
	'## 1. Accuracy by corpus and question set',
	'',
	...header([
		'corpus',
		'questions',
		'note',
		'rows (contested)',
		'request: regex',
		...present.map((reader) => `request: ${LABEL[reader]}`),
		'need: regex',
		...present.map((reader) => `need: ${LABEL[reader]}`)
	])
];
for (const { corpus, questions, note, by } of loaded) {
	const base = regexOf(by);
	lines.push(
		`| ${corpus} | ${questions} | ${note} | ${base ? `${base.rows} (${base.contested})` : '—'} | ${pct(base?.byQuestion.category.regex)} | ${present.map((reader) => ci(by[reader]?.byQuestion.category.reader)).join(' | ')} | ${pct(base?.byQuestion.need.regex)} | ${present.map((reader) => ci(by[reader]?.byQuestion.need.reader)).join(' | ')} |`
	);
}
lines.push(
	'',
	'Uncontested rows only (v2, v3), need:',
	'',
	...header(['corpus', 'questions', ...present.map((r) => LABEL[r])])
);
for (const { corpus, questions, by } of loaded) {
	if ((regexOf(by)?.contested ?? 0) === 0) continue;
	lines.push(
		`| ${corpus} | ${questions} | ${present.map((reader) => ci(by[reader]?.byQuestion.need.uncontested.reader)).join(' | ')} |`
	);
}

lines.push(
	'',
	'## 2. Readers against each other, paired by row (exact two-sided sign test over the rows only one got right)',
	'',
	...header([
		'corpus',
		'questions',
		'question',
		'A',
		'B',
		'A',
		'B',
		'only A right',
		'only B right',
		'p'
	])
);
const PAIRS: [Reader, Reader][] = [
	['jev', 'spark'],
	['jev', 'spark35'],
	['spark', 'spark35']
];
for (const [a, b] of PAIRS) {
	if (!present.includes(a) || !present.includes(b)) continue;
	for (const { corpus, questions, by } of loaded) {
		for (const question of ['category', 'need'] as const) {
			const test = paired(fileOf(corpus, questions, a), fileOf(corpus, questions, b), question);
			if (!test) continue;
			lines.push(
				`| ${corpus} | ${questions} | ${question === 'category' ? 'request' : 'need'} | ${LABEL[a]} | ${LABEL[b]} | ${pct(by[a]?.byQuestion[question].reader)} | ${pct(by[b]?.byQuestion[question].reader)} | ${test.onlyA} | ${test.onlyB} | ${test.p.toFixed(4)} |`
			);
		}
	}
}

lines.push(
	'',
	'## 3. Vulnerability detection (any need recorded vs any need disclosed): recall / precision',
	'',
	...header(['corpus', 'questions', 'regex', ...present.map((r) => LABEL[r])])
);
for (const { corpus, questions, by } of loaded) {
	const x = regexOf(by)?.detection.regex;
	lines.push(
		`| ${corpus} | ${questions} | ${pct(x?.recall)} / ${pct(x?.precision)} | ${present.map((reader) => (by[reader] ? `${pct(by[reader]!.detection.reader.recall)} / ${pct(by[reader]!.detection.reader.precision)}` : '—')).join(' | ')} |`
	);
}

lines.push(
	'',
	'## 4. Calibration (ECE / Brier)',
	'',
	...header([
		'corpus',
		'questions',
		...present.map((r) => `request: ${LABEL[r]}`),
		...present.map((r) => `need: ${LABEL[r]}`)
	])
);
const cal = (r: Results | undefined, q: 'category' | 'need') =>
	r ? `${num(r.byQuestion[q].calibration.ece)} / ${num(r.byQuestion[q].calibration.brier)}` : '—';
for (const { corpus, questions, by } of loaded) {
	lines.push(
		`| ${corpus} | ${questions} | ${present.map((reader) => cal(by[reader], 'category')).join(' | ')} | ${present.map((reader) => cal(by[reader], 'need')).join(' | ')} |`
	);
}

lines.push(
	'',
	'## 5. The gate at 0.80 (a person reviews below the threshold, or a steer under q2; the reviewer modelled as always right)',
	'',
	...header([
		'corpus',
		'questions',
		'reader',
		'request to a person',
		'request end to end',
		'need to a person',
		'need end to end'
	])
);
for (const { corpus, questions, by } of loaded) {
	for (const reader of present) {
		const r = by[reader];
		if (!r) continue;
		const c = r.byQuestion.category.gates.find((g) => g.threshold === 0.8)!;
		const n = r.byQuestion.need.gates.find((g) => g.threshold === 0.8)!;
		lines.push(
			`| ${corpus} | ${questions} | ${LABEL[reader]} | ${ci(c.toPerson)} | ${pct(c.endToEnd)} | ${ci(n.toPerson)} | ${pct(n.endToEnd)} |`
		);
	}
}

lines.push(
	'',
	'## 6. q1 against q2, paired by row, per reader',
	'',
	...header(['corpus', 'reader', 'question', 'q1', 'q2', 'fixed by q2', 'broken by q2', 'p'])
);
for (const corpus of ['v3', 'v1', 'v2']) {
	for (const reader of present) {
		const before = fileOf(corpus, 'q1', reader);
		const after = fileOf(corpus, 'q2', reader);
		for (const question of ['category', 'need'] as const) {
			const test = paired(before, after, question);
			if (!test) continue;
			lines.push(
				`| ${corpus}${corpus === 'v3' ? ' (held out)' : corpus === 'v2' ? ' (seen)' : ''} | ${LABEL[reader]} | ${question === 'category' ? 'request' : 'need'} | ${pct(load(before)?.byQuestion[question].reader)} | ${pct(load(after)?.byQuestion[question].reader)} | ${test.onlyB} | ${test.onlyA} | ${test.p.toFixed(4)} |`
			);
		}
	}
}

lines.push(
	'',
	'## 7. The steer (q2 only; P(steer) ≥ 0.5 against the `steer` tag)',
	'',
	...header(['corpus', 'reader', 'steer rows', 'recall', 'precision', 'tp / fn / fp / tn'])
);
for (const { corpus, questions, by } of loaded) {
	if (questions !== 'q2') continue;
	for (const reader of present) {
		const s = by[reader]?.steer;
		if (!s || s.tp + s.fn === 0) continue;
		lines.push(
			`| ${corpus} | ${LABEL[reader]} | ${s.tp + s.fn} | ${ci(s.recall)} | ${ci(s.precision)} | ${s.tp} / ${s.fn} / ${s.fp} / ${s.tn} |`
		);
	}
}

lines.push(
	'',
	'## 8. Through the journey (the harness experiments, run offline from the cassettes)',
	''
);
for (const file of [
	'servicing-jev.experiment-result',
	'servicing-jev-v2.experiment-result',
	'servicing-jev-v3.experiment-result',
	'servicing-spark.experiment-result',
	'servicing-spark-v2.experiment-result',
	'servicing-spark-v3.experiment-result',
	'servicing-spark35.experiment-result',
	'servicing-spark35-v2.experiment-result',
	'servicing-spark35-v3.experiment-result'
]) {
	if (!existsSync(`experiment/${file}.json`)) continue;
	const result = JSON.parse(readFileSync(`experiment/${file}.json`, 'utf8')) as {
		experimentId: string;
		verdict: string;
		digest: string;
		effects: {
			metricId: string;
			factor: { baseline: string; treatment: string };
			baseline: { value: number; n: number };
			treatment: { value: number; n: number };
			delta: number;
			interval: [number, number];
			underpowered?: boolean;
		}[];
	};
	lines.push(
		`**${result.experimentId}** — verdict \`${result.verdict}\`; digest \`${result.digest.slice(0, 16)}…\``,
		'',
		'| metric | treatment | baseline (regex) | treatment | Δ (95% interval) |',
		'|---|---|---|---|---|'
	);
	for (const e of result.effects) {
		const rateLike = e.metricId !== 'touches';
		const show = (v: number) => (rateLike ? `${(100 * v).toFixed(1)}%` : v.toFixed(3));
		const delta = (v: number) => (rateLike ? `${(100 * v).toFixed(1)}` : v.toFixed(3));
		lines.push(
			`| ${e.metricId} | ${e.factor.treatment} | ${show(e.baseline.value)} | ${show(e.treatment.value)} | ${delta(e.delta)} (${delta(e.interval[0])} – ${delta(e.interval[1])})${e.underpowered ? ' †' : ''} |`
		);
	}
	lines.push('');
}
lines.push(
	'† flagged underpowered by the harness’s rule (fewer than five events on a side): a ceiling artefact where the treatment barely fails.',
	'',
	'`touches` counts a classification review twice (`human:` and `escalated:`) when its answer is not the stage’s first option (`98-JEV.md` §9, finding 3); §5’s “to a person” counts reviews once.',
	'',
	'## 9. Latency per run',
	'',
	'| corpus | questions | reader | calls | p50 ms | p95 ms | max ms |',
	'|---|---|---|---|---|---|---|'
);
for (const { corpus, questions, by } of loaded) {
	for (const reader of READERS) {
		const r = by[reader];
		if (!r) continue;
		lines.push(
			`| ${corpus} | ${questions} | ${LABEL[reader]} | ${r.calls} | ${r.latencyMs.p50} | ${r.latencyMs.p95} | ${r.latencyMs.max} |`
		);
	}
}

lines.push(
	'',
	'## 10. Tokens and cost per run',
	'',
	'Each reader’s tokens are counted by its own tokenizer (TypeSafe’s for Jev, Qwen’s for the Spark models), so the counts are **not the same unit**: compare them within a reader, and across readers only as an order of magnitude. A case is one corpus row (the request and the need). A Spark q2 request is two completions (the request and the steer), counted together.',
	'',
	'| corpus | questions | reader | input tokens | output tokens | input / case | output / case | tokens / case | cost (USD) | cost / 1,000 cases |',
	'|---|---|---|---|---|---|---|---|---|---|'
);
const totals: Record<Reader, { cases: number; input: number; output: number; cost: number }> = {
	jev: { cases: 0, input: 0, output: 0, cost: 0 },
	spark: { cases: 0, input: 0, output: 0, cost: 0 },
	spark35: { cases: 0, input: 0, output: 0, cost: 0 }
};
for (const { corpus, questions, by } of loaded) {
	for (const reader of READERS) {
		const r = by[reader];
		if (!r) continue;
		const t = r.tokens;
		totals[reader].cases += r.rows;
		totals[reader].input += t.input.total;
		totals[reader].output += t.output.total;
		totals[reader].cost += r.costUsd?.total ?? 0;
		lines.push(
			`| ${corpus} | ${questions} | ${LABEL[reader]} | ${t.input.total} | ${t.output.total} | ${t.input.perCase.toFixed(0)} | ${t.output.perCase.toFixed(1)} | ${t.all.perCase.toFixed(0)} | ${r.costUsd ? r.costUsd.total.toFixed(5) : 'own hardware'} | ${r.costUsd ? `$${r.costUsd.perThousandCases.toFixed(4)}` : '—'} |`
		);
	}
}
lines.push(
	'',
	'| reader | cases | input tokens | output tokens | tokens / case | cost |',
	'|---|---|---|---|---|---|'
);
for (const reader of READERS) {
	const t = totals[reader];
	if (t.cases === 0) continue;
	lines.push(
		`| ${LABEL[reader]} | ${t.cases} | ${t.input} | ${t.output} | ${((t.input + t.output) / t.cases).toFixed(0)} | ${reader === 'jev' ? `$${t.cost.toFixed(4)} (list price: $0.042 per million input tokens, output free)` : 'own hardware — no per-token charge'} |`
	);
}
lines.push('');

writeFileSync('experiment/SUMMARY.md', `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
