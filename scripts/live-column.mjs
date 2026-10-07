#!/usr/bin/env node
/**
 * **The live column** (WP168, `112-REAL-ENOUGH-PLAN.md` §5): what the recorded
 * live tier says, set beside what the bank assumed, folded from the committed
 * results and cassettes into `docs/evidence/live/README.md`.
 *
 *   node scripts/live-column.mjs            write the file
 *   node scripts/live-column.mjs --check    fail if the committed file differs from what this would write
 *
 * Three tables: the live tier's own error rate per desk against `ERROR_RATES`
 * (the first finding); what a recording cost; and, for the design recorded
 * twice, how far the two cassettes agree (the live tier's own variance).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as prettier from 'prettier';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIVE = join(ROOT, 'docs', 'evidence', 'live');

/**
 * For each design: the metric that says whether the live decision matched the
 * desk's rule, and the `ERROR_RATES` row whose assumption it tests.
 */
export const PRIMARY = {
	'lending-stack': {
		metric: 'agreement',
		row: 'lending-decision-error',
		what: 'lending decision matches the rule'
	},
	'servicing-stack': {
		metric: 'needs-met',
		row: 'servicing-classification-error',
		what: 'the caller’s need is met'
	},
	'disputes-stack': {
		metric: 'decision-matches-rules',
		row: 'disputes-decision-error',
		what: 'dispute decision matches the rule'
	},
	'collections-stack': {
		metric: 'plan-matches-rule',
		row: 'collections-plan-error',
		what: 'repayment plan matches the rule'
	},
	'onboarding-stack': {
		metric: 'decision-matches-rules',
		row: 'onboarding-decision-error',
		what: 'onboarding decision matches the rule'
	},
	'complaints-stack': {
		metric: 'root-cause-named',
		row: 'complaints-root-cause-error',
		what: 'the root cause is named'
	},
	'fraud-stack': {
		metric: 'alert-decision',
		row: 'fraud-alert-decision-error',
		what: 'alert decision is the right one'
	},
	'advice-context': {
		metric: 'suitable',
		row: 'advice-recommendation-error',
		what: 'the recommendation suits the customer'
	}
};

const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const pct = (x) => `${(x * 100).toFixed(0)}%`;
const band = (i) => `${pct(i[0])}–${pct(i[1])}`;

/** The side of the primary metric's effect that sits at the baseline combination: the figure for "no control, the reference configuration". */
export function baselineSide(result, metric) {
	const effect =
		result.effects.find((e) => e.metricId === metric && e.factor.axis === 'guard') ??
		result.effects.find((e) => e.metricId === metric);
	return effect?.baseline;
}

/**
 * How many answers two cassettes give to the same prompt (its digest and occurrence), and how many of those are the
 * same *call* (the tool and its arguments, which is what a journey acts on) and the same *words* (call and prose).
 * Prose rarely repeats verbatim, so the call is the figure that matters.
 */
export function cassetteAgreement(a, b) {
	const key = (e) => `${e.promptDigest}#${e.occurrence}`;
	const call = (e) => JSON.stringify(e.response.toolCall ?? null);
	const words = (e) => JSON.stringify([e.response.text, e.response.toolCall ?? null]);
	const byKey = new Map(b.entries.map((e) => [key(e), e]));
	let shared = 0;
	let sameCall = 0;
	let same = 0;
	for (const e of a.entries) {
		const other = byKey.get(key(e));
		if (other === undefined) continue;
		shared += 1;
		if (call(other) === call(e)) sameCall += 1;
		if (words(other) === words(e)) same += 1;
	}
	return {
		shared,
		same,
		sameCall,
		onlyA: a.entries.length - shared,
		onlyB: b.entries.length - shared
	};
}

/**
 * Whether two recordings decided the same case the same way: over the cases both decided, how many reached the same
 * verdict from the design's evaluators (cells.json rows, matched by campaign and case).
 */
export function caseConcordance(a, b) {
	const key = (r) => `${r.campaign}|${r.item}`;
	const verdict = (r) => JSON.stringify(r.verdicts);
	const byKey = new Map(b.map((r) => [key(r), r]));
	let compared = 0;
	let same = 0;
	for (const r of a) {
		const other = byKey.get(key(r));
		if (!other) continue;
		compared += 1;
		if (verdict(other) === verdict(r)) same += 1;
	}
	return { compared, same };
}

/** `finishReason` counts in a cassette: a model cut off by its token limit says `length`. */
export function finishReasons(cassette) {
	const counts = {};
	for (const e of cassette.entries)
		counts[e.response.finishReason] = (counts[e.response.finishReason] ?? 0) + 1;
	return counts;
}

/**
 * The reliability of a design performed more than once (`113-RECORDING-AND-RELIABILITY.md` §4.7): over the items, never the
 * trials, the primary metric's pass@1, pass^k (every performance passes — the figure for a control) and consistency, for the
 * reference configuration (no guard; `bot-everywhere` where a design has executors).
 */
export function reliabilityRows(result, metric) {
	const all = result.reliability ?? [];
	const none = all.filter((r) => r.campaignId.includes('guard=none'));
	const everywhere = none.filter((r) => r.campaignId.includes('bot-everywhere'));
	const picked = everywhere.length > 0 ? everywhere : none.length > 0 ? none : all;
	return picked
		.map((r) => ({
			campaignId: r.campaignId,
			k: r.k,
			items: r.items,
			m: r.metrics.find((x) => x.metricId === metric)
		}))
		.filter((r) => r.m !== undefined);
}

export async function render() {
	const timingsFile = join(LIVE, 'timings.json');
	if (!existsSync(timingsFile)) return undefined;
	const timings = read(timingsFile);
	const { ERROR_RATES } = await import(
		pathToFileURL(join(ROOT, 'packages/packs/fs-bank/dist/index.js')).href
	);
	const assumed = (row) => ERROR_RATES.rows.find((r) => r.id === row)?.distribution.wrong;
	const lines = [];
	const first = Object.values(timings)[0];
	lines.push(
		'# The live tier, recorded',
		'',
		`Written by \`node scripts/live-column.mjs\` from the committed results and cassettes; do not edit by hand. Each design here is its reference design with the brain a live model: \`${first.cartridge}\`, **${first.model}** on the builder's two DGX Sparks (D1), at temperature 0 with a 1,024-token reply limit, a single sample per design. Every figure is a measurement of **this synthetic bank at the size stated, under that one sample**; it is evidence about a model a bank could run inside its own boundary, never about a frontier model or about any real book (\`../README.md\`, "What these are not evidence of").`,
		'',
		'## How it was set up',
		'',
		'- **The model** is `Qwen3.5-122B-A10B-NVFP4` through `dgx-spark/giant-qwen`, on whichever of the two Sparks was less loaded (both in `puzzle` mode, 8 streams each, MTP speculative decoding on), 16 cells at a time (`record --concurrency auto`).',
		"- **Temperature 0, and a 2,048-token reply limit (1,024 in the first recordings; raised at plan 113's preflight).** The stage agents inherit the starter's 256-token limit. The first lending recording, made at 256 (2026-10-06, since replaced), found 35 of its 791 replies, 4.4%, cut off by the limit with no call made, and agreement of 10 of 23: a measurement of the cap, not of the model. The live designs set `maxTokens: 2048` on every build (a scripted brain never reads it), and the recordings below say how many replies were cut off.",
		"- **Temperature 0 is not repeatable here.** The same prompt is not always answered the same way: the serving stack batches requests and speculates tokens, so even at temperature 0 the numerics move with what else is in flight. That is the live tier's variance, and it is measured below, not assumed away.",
		"- **Each design is a book of its own size** (the table below), one live brain, the design's other factors as in its reference design; the committed scripted and fallible columns are the full-size results one folder up.",
		'',
		"## The first finding: the live tier's own error rate against the bank's assumption",
		'',
		'`ERROR_RATES` (`fs-bank`) assumed one decision in ten wrong on every desk, so an agreement of 90%. The live column is what the 122B did.',
		'',
		'| Design | What is measured | Live (95% interval, n) | Assumed | Assumption inside the interval? |',
		'|---|---|---|---|---|'
	);
	for (const [base, spec] of Object.entries(PRIMARY)) {
		const id = `${base}-live`;
		const file = join(LIVE, id, `${id}.experiment-result.json`);
		if (!timings[id] || !existsSync(file)) continue;
		const side = baselineSide(read(file), spec.metric);
		if (!side) continue;
		const wrong = assumed(spec.row);
		const expected = 1 - wrong;
		const inside = side.interval[0] <= expected && expected <= side.interval[1];
		lines.push(
			`| \`${base}\` | ${spec.what} | ${pct(side.value)} (${band(side.interval)}, n ${side.n}) | ${pct(expected)} | ${inside ? 'yes' : '**no**'} |`
		);
	}
	lines.push(
		'',
		"The live side is the reference configuration with no guard (`bot-everywhere` where a design has executors), the figure the fallible tier's assumed rate stands in for.",
		'',
		'## What each recording cost',
		'',
		'| Design | Recorded | Book size | Performed | Cells | Cassette entries | Wall time | Stories |',
		'|---|---|---|---|---|---|---|---|'
	);
	for (const [id, t] of Object.entries(timings))
		lines.push(
			`| \`${id}\` | ${t.recordedOn} | ${t.size ?? 'scenarios'} | ${t.trials ?? 1}× | ${t.cells} | ${t.entries} | ${Math.round(t.wallSeconds / 60)} min | ${t.stories} |`
		);
	// Plan 113: a design performed more than once reads its own reliability.
	const reliable = [];
	for (const [base, spec] of Object.entries(PRIMARY)) {
		const id = `${base}-live`;
		const file = join(LIVE, id, `${id}.experiment-result.json`);
		if (!(timings[id]?.trials > 1) || !existsSync(file)) continue;
		for (const r of reliabilityRows(read(file), spec.metric))
			reliable.push(
				`| \`${base}\` | ${spec.what} | ${r.items} items × ${r.k} | ${pct(r.m.pass1.value)} (${band(r.m.pass1.interval)}) | ${pct(r.m.passHatK.value)} (${band(r.m.passHatK.interval)}) | ${pct(r.m.consistency.value)} (${band(r.m.consistency.interval)}) |`
			);
	}
	if (reliable.length > 0)
		lines.push(
			'',
			'## Reliability over trials',
			'',
			'Each item is a case performed more than once with fresh model draws; every figure is over items, never trials, so repeating a case does not inflate *n*. **pass^k** (every performance passes) is the figure for a control; **pass@1** is one performance; **consistency** is the share of items the trials agreed on.',
			'',
			'| Design | What is measured | Performed | pass@1 | pass^k | Consistency |',
			'|---|---|---|---|---|---|',
			...reliable
		);
	// WP169: the same desk, the customer a live model as well.
	const seatId = 'servicing-stack-live-seat';
	const seatFile = join(LIVE, seatId, `${seatId}.experiment-result.json`);
	const soloFile = join(
		LIVE,
		'servicing-stack-live',
		'servicing-stack-live.experiment-result.json'
	);
	if (timings[seatId] && existsSync(seatFile) && existsSync(soloFile)) {
		const seatResult = read(seatFile);
		const soloResult = read(soloFile);
		const withSeat = baselineSide(seatResult, 'needs-met');
		const alone = baselineSide(soloResult, 'needs-met');
		const tokens = (result) => result.effects[0]?.cost?.tokensPerCase?.baseline;
		if (withSeat && alone)
			lines.push(
				'',
				'## The customer answers back',
				'',
				"`servicing-stack` again, with the person across the desk a live model as well (`112-REAL-ENOUGH-PLAN.md` WP169): the desk draws the customer's persona from the item and seats it at every agent stage, the seat takes the same cartridge as the bot and records into the same cassette, and each line it says is a `seat.said` on the bot's trace. Reference configuration, no guard:",
				'',
				'| | Needs met (95% interval, n) | Tokens per case | Cells |',
				'|---|---|---|---|',
				`| the desk's own scripted visitor | ${pct(alone.value)} (${band(alone.interval)}, n ${alone.n}) | ${Math.round(tokens(soloResult) ?? 0)} | ${timings['servicing-stack-live'].cells} |`,
				`| a live customer | ${pct(withSeat.value)} (${band(withSeat.interval)}, n ${withSeat.n}) | ${Math.round(tokens(seatResult) ?? 0)} | ${timings[seatId].cells} |`,
				'',
				'The two books are different sizes and the intervals overlap, so this reads as no difference at this n, not as a customer who makes the bot better. What it does show is that customers who answer back run end to end on the live tier. Since plan 113 §12 the drawn customer opens with the request itself, in their words; the stories in `servicing-stack-live-seat/stories/` show the conversation.'
			);
	}
	const a = join(LIVE, 'lending-stack-live', 'lending-stack-live.provider-cassette.json');
	const b = join(LIVE, 'lending-stack-live-b', 'lending-stack-live-b.provider-cassette.json');
	if (existsSync(a) && existsSync(b)) {
		const ca = read(a);
		const cb = read(b);
		const agree = cassetteAgreement(ca, cb);
		const cellsA = join(LIVE, 'lending-stack-live', 'cells.json');
		const cellsB = join(LIVE, 'lending-stack-live-b', 'cells.json');
		const cc =
			existsSync(cellsA) && existsSync(cellsB)
				? caseConcordance(read(cellsA), read(cellsB))
				: { compared: 0, same: 0 };
		const ra = baselineSide(
			read(join(LIVE, 'lending-stack-live', 'lending-stack-live.experiment-result.json')),
			'agreement'
		);
		const rb = baselineSide(
			read(join(LIVE, 'lending-stack-live-b', 'lending-stack-live-b.experiment-result.json')),
			'agreement'
		);
		lines.push(
			'',
			"## The live tier's own variance",
			'',
			"`lending-stack` was recorded twice, with nothing changed between the recordings. A recording is one sample, so the difference between the two is the live tier's own noise, the floor under any effect a control is credited with.",
			'',
			`- **Answers to the same prompt:** of ${agree.shared} prompts both recordings were asked, ${agree.sameCall} (${pct(agree.sameCall / agree.shared)}) were answered with the same call (the same tool, the same arguments) and ${agree.same} (${pct(agree.same / agree.shared)}) with the same words as well. ${agree.onlyA + agree.onlyB} prompts were asked by only one recording, because a different answer earlier in a case leads to a different next prompt.`,
			`- **The same case, decided twice:** ${cc.compared > 0 ? `of ${cc.compared} cases both recordings decided, ${cc.same} (${pct(cc.same / cc.compared)}) reached the same verdict from the design's evaluators in both` : 'the per-case outcomes are not committed yet'}.`,
			`- **The figure that matters:** agreement with the rule, reference configuration, was ${pct(ra.value)} (${band(ra.interval)}, n ${ra.n}) in the first recording and ${pct(rb.value)} (${band(rb.interval)}, n ${rb.n}) in the second: a difference of ${((rb.value - ra.value) * 100).toFixed(1)} points between two samples of the same model.`,
			`- **Finish reasons**, first recording: ${JSON.stringify(finishReasons(ca))}; second: ${JSON.stringify(finishReasons(cb))}. A \`length\` is a reply cut off by the 1,024-token limit.`
		);
	}
	lines.push('');
	return `${lines.join('\n')}`;
}

async function main(argv) {
	const out = join(LIVE, 'README.md');
	const raw = await render();
	// Laid out as the repository's own formatter would, so a committed copy and a fresh one compare equal.
	const text =
		raw === undefined
			? undefined
			: await prettier.format(raw, {
					...(await prettier.resolveConfig(out)),
					parser: 'markdown'
				});
	if (text === undefined) {
		console.log('live-column: no live results yet');
		return 0;
	}
	if (argv.includes('--check')) {
		if (
			!existsSync(out) ||
			readFileSync(out, 'utf8').replace(/\r\n/g, '\n') !== text.replace(/\r\n/g, '\n')
		) {
			console.error(
				'live-column: docs/evidence/live/README.md is out of date; run node scripts/live-column.mjs and format it'
			);
			return 1;
		}
		return 0;
	}
	writeFileSync(out, text, 'utf8');
	console.log(`wrote ${out}`);
	return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
	process.exit(await main(process.argv.slice(2)));
