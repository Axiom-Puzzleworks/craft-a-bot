import type { Corpus, Reader, ReaderContext, TypedQuestion } from '@craftabot/core';
import { wilson } from '@craftabot/metrics';

/**
 * **A reader scored on a corpus** (WP121, `105-CORPORA.md` §9.3): every row's
 * state put to the reader with one question, the answer set against the row's
 * label — the primary annotator's — and against either annotator's, where a
 * contested row carries the second's alternative. The accuracy with its
 * Wilson interval, the confusion by label, and every row a reader got wrong.
 * What each desk's note quotes for its rule reader and the stand-in.
 */
export interface ReaderScore {
	readerId: string;
	corpusId: string;
	corpusDigest: string;
	label: string;
	n: number;
	right: number;
	accuracy: { value: number; interval: [number, number] };
	/** Right by the primary label or by a contested row's alternative. */
	eitherLabeller: { value: number; interval: [number, number] };
	/** confusion[label][answer] = rows. */
	confusion: Record<string, Record<string, number>>;
	/** The rows it answered against the primary label: id, label, answer. */
	wrong: Array<{ id: string; label: string; answer: string }>;
}

export interface ScoreReaderOptions {
	/** The corpus label the reader is scored on. */
	label: string;
	question: TypedQuestion;
	/** The question's id when it is not the label's name. */
	questionId?: string;
	context?: ReaderContext;
}

export async function scoreReader(
	reader: Reader,
	corpus: Corpus,
	options: ScoreReaderOptions
): Promise<ReaderScore> {
	const questionId = options.questionId ?? options.label;
	const set = corpus.labels[options.label];
	if (!set) throw new Error(`corpus "${corpus.id}" has no label "${options.label}"`);
	const confusion: ReaderScore['confusion'] = Object.fromEntries(
		set.options.map((label) => [
			label,
			Object.fromEntries(set.options.map((answer) => [answer, 0]))
		])
	);
	const wrong: ReaderScore['wrong'] = [];
	let right = 0;
	let either = 0;
	for (const row of corpus.rows) {
		const response = await reader.ask(
			row.state,
			{ [questionId]: options.question },
			options.context ?? {}
		);
		const answer = response.answers[questionId];
		const picked =
			answer?.type === 'choice'
				? answer.choice
				: answer?.type === 'noul'
					? answer.noul >= 0.5
						? 'yes'
						: 'no'
					: '';
		const label = row.labels[options.label]!;
		const cells = confusion[label];
		if (cells && picked in cells) cells[picked] = cells[picked]! + 1;
		if (picked === label) right += 1;
		else wrong.push({ id: row.id, label, answer: picked });
		if (picked === label || picked === row.contested?.alternatives[options.label]) either += 1;
	}
	const n = corpus.rows.length;
	const rate = (k: number) => ({
		value: n === 0 ? 0 : k / n,
		interval: wilson(k, n) as [number, number]
	});
	return {
		readerId: reader.id,
		corpusId: corpus.id,
		corpusDigest: corpus.digest,
		label: options.label,
		n,
		right,
		accuracy: rate(right),
		eitherLabeller: rate(either),
		confusion,
		wrong
	};
}
