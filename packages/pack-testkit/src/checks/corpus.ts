import { corpusDigest, corpusSchema, type Corpus } from '@craftabot/core';
import type { ConformanceIssue } from '../types.js';
import { checkSynthetic } from './synthetic.js';

/**
 * **A corpus's conformance** (WP119, `105-CORPORA.md` §4): six refusals.
 *
 * - `corpus.well-formed` — the schema; row ids unique; a contested row's alternatives inside their label's set.
 * - `corpus.digest` — the digest is the labels' and rows'.
 * - `corpus.synthetic` — no row's state has the shape of a real identifier (`checkSynthetic`).
 * - `corpus.labels` — every row gives every label, each inside its set, and nothing else.
 * - `corpus.held-out` — a held-out corpus names its question set.
 * - `corpus.annotators` — one primary; κ only on a blind annotator, only on the corpus's labels, inside [−1, 1].
 *
 * The single-annotator finding is not a refusal: `corpusFindings` returns it.
 * `options.digest: false` skips the digest, for `corpus freeze`, which is
 * about to write it.
 */
export function checkCorpus(
	corpus: Corpus,
	options: { digest?: boolean } = {}
): ConformanceIssue[] {
	const issues: ConformanceIssue[] = [];
	const issue = (check: string, message: string) =>
		issues.push({ check, message: `${corpus.id}: ${message}` });
	const parsed = corpusSchema.safeParse(corpus);
	if (!parsed.success) {
		issue('corpus.well-formed', parsed.error.issues[0]?.message ?? 'not a corpus');
		return issues;
	}
	const seen = new Set<string>();
	for (const row of corpus.rows) {
		if (seen.has(row.id)) issue('corpus.well-formed', `row "${row.id}" appears twice`);
		seen.add(row.id);
		for (const [label, value] of Object.entries(row.contested?.alternatives ?? {})) {
			if (!corpus.labels[label]?.options.includes(value))
				issue(
					'corpus.well-formed',
					`row "${row.id}" offers "${value}" for "${label}", outside its set`
				);
		}
	}
	if (options.digest !== false && corpusDigest(corpus) !== corpus.digest)
		issue('corpus.digest', 'the rows and labels do not hash to the frozen digest');

	for (const hit of checkSynthetic(
		corpus.rows.map((row) => ({
			path: `${corpus.id}#${row.id}`,
			text: typeof row.state === 'string' ? row.state : JSON.stringify(row.state)
		}))
	))
		issue('corpus.synthetic', `${hit.message}`);

	const names = Object.keys(corpus.labels);
	for (const row of corpus.rows) {
		for (const name of names) {
			const value = row.labels[name];
			if (value === undefined) issue('corpus.labels', `row "${row.id}" gives no "${name}"`);
			else if (!corpus.labels[name]!.options.includes(value))
				issue('corpus.labels', `row "${row.id}" labels "${name}" "${value}", outside its set`);
		}
		for (const name of Object.keys(row.labels))
			if (!names.includes(name))
				issue(
					'corpus.labels',
					`row "${row.id}" labels "${name}", which the corpus does not define`
				);
	}

	if (corpus.heldOut && corpus.questions === undefined)
		issue('corpus.held-out', 'is held out but names no question set it was held out from');

	const primaries = corpus.annotators.filter((annotator) => annotator.primary);
	if (primaries.length !== 1)
		issue('corpus.annotators', `names ${primaries.length} primary annotators; it needs one`);
	for (const annotator of corpus.annotators) {
		for (const [label, kappa] of Object.entries(annotator.kappa ?? {})) {
			if (!annotator.blind)
				issue('corpus.annotators', `"${annotator.id}" carries a κ but did not label blind`);
			if (!names.includes(label))
				issue(
					'corpus.annotators',
					`"${annotator.id}" carries a κ on "${label}", which the corpus does not define`
				);
			if (!(kappa >= -1 && kappa <= 1))
				issue(
					'corpus.annotators',
					`"${annotator.id}"'s κ on "${label}" is ${kappa}, outside [−1, 1]`
				);
		}
	}
	return issues;
}

/**
 * **What a corpus's page says about it** (`105-…` §4): the single-annotator
 * finding — no blind second annotator, so no agreement to hold a reader to.
 * A warning, never a refusal.
 */
export function corpusFindings(corpus: Corpus): ConformanceIssue[] {
	return corpus.annotators.some((annotator) => annotator.blind && !annotator.primary)
		? []
		: [
				{
					check: 'corpus.single-annotator',
					message: `${corpus.id}: labelled by its author alone — no blind second annotator, so no agreement to read a reader against`
				}
			];
}
