import type { Corpus } from '@craftabot/core';

/**
 * **The corpora page's folds** (WP119, `105-CORPORA.md` §1): each corpus the
 * edition's packs ship, as a row of the list and as the page that opens —
 * its guide, its label sets with how often each value is used, its tags, its
 * annotators with their agreement, the readers that have seen it, and
 * whether it was held out. Pure; the page draws. The single-annotator finding
 * is `pack-testkit`'s rule, restated here in one line rather than importing a
 * test kit into the app.
 */
export interface CorpusListRow {
	id: string;
	name: string;
	version: string;
	rows: number;
	labels: string;
	heldOut: string;
	annotators: number;
	seenBy: number;
	finding: string;
}

export const singleAnnotator = (corpus: Corpus): boolean =>
	!corpus.annotators.some((annotator) => annotator.blind && !annotator.primary);

export function corpusListRow(corpus: Corpus): CorpusListRow {
	return {
		id: corpus.id,
		name: corpus.name,
		version: corpus.version,
		rows: corpus.rows.length,
		labels: Object.keys(corpus.labels).join(', '),
		heldOut: corpus.heldOut ? `held out from ${corpus.questions?.id ?? '—'}` : 'no',
		annotators: corpus.annotators.length,
		seenBy: corpus.seenBy.length,
		finding: singleAnnotator(corpus) ? 'labelled by its author alone' : '—'
	};
}

export interface LabelSummary {
	name: string;
	guide: string;
	/** Each option with the rows that carry it, in the set's order. */
	counts: Array<{ option: string; rows: number }>;
	contested: number;
}

export function labelSummaries(corpus: Corpus): LabelSummary[] {
	return Object.entries(corpus.labels).map(([name, label]) => ({
		name,
		guide: label.guide,
		counts: label.options.map((option) => ({
			option,
			rows: corpus.rows.filter((row) => row.labels[name] === option).length
		})),
		contested: corpus.rows.filter((row) => row.contested?.alternatives[name] !== undefined).length
	}));
}

/** The tags with the rows under each, most first, then by name. */
export function tagCounts(corpus: Corpus): Array<{ tag: string; rows: number }> {
	const counts = new Map<string, number>();
	for (const row of corpus.rows)
		for (const tag of row.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
	return [...counts]
		.map(([tag, rows]) => ({ tag, rows }))
		.sort((a, b) => b.rows - a.rows || a.tag.localeCompare(b.tag));
}

/** The annotators in words: who, whether blind, and κ per label to two places. */
export function annotatorLines(corpus: Corpus): string[] {
	return corpus.annotators.map((annotator) => {
		const role = annotator.primary ? 'the author' : annotator.blind ? 'blind' : 'sighted';
		const kappa = Object.entries(annotator.kappa ?? {})
			.map(([label, value]) => `${label} κ ${value.toFixed(2)}`)
			.join(', ');
		return `${annotator.id} (${role})${kappa ? `: ${kappa}` : ''}`;
	});
}
