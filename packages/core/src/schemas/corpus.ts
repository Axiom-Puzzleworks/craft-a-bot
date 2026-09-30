import { z } from 'zod';
import { canonicalJson } from './cassette.js';
import { sha256Hex } from './sha256.js';

/**
 * **A corpus** (WP119, `105-CORPORA.md` §3; `100-TARGET-DESIGN-V7.md` §6.4,
 * D17, tenet 36): labelled rows as content — the state each row shows a
 * reader, a closed set per label with its guide, the question set it was
 * written against, who labelled it and how far they agreed, whether it was
 * held out, which readers have been scored on it, and a digest frozen before
 * any of that. A pack ships its corpora (`PackManifest.corpora`); a campaign's
 * book source names one; `checkCorpus` refuses the rest.
 */
export const corpusLabelSchema = z.object({
	/** The closed set; a row's value is one of these. */
	options: z.array(z.string().min(1)).min(2),
	/** What each option means, in the words a labeller reads. */
	guide: z.string().min(1)
});

export const corpusRowSchema = z.object({
	id: z.string().min(1),
	/** What the row shows a reader: a caller's words, a claim's figures, a transcript. */
	state: z.unknown(),
	/** The author's slicing tags, set before any run — a difficulty, a trap, a steer. */
	tags: z.array(z.string()),
	labels: z.record(z.string(), z.string()),
	/** A label a careful person could give the other way: why, and the other answer. */
	contested: z
		.object({ reason: z.string().min(1), alternatives: z.record(z.string(), z.string()) })
		.optional()
});
export type CorpusRow = z.infer<typeof corpusRowSchema>;

export const annotatorSchema = z.object({
	id: z.string().min(1),
	/** Labelled with no sight of the primary's labels. */
	blind: z.boolean(),
	/** The author, whose labels are the rows' own. Exactly one. */
	primary: z.literal(true).optional(),
	/** Cohen's κ with the primary, per label. */
	kappa: z.record(z.string(), z.number()).optional(),
	note: z.string().optional()
});
export type Annotator = z.infer<typeof annotatorSchema>;

export const seenBySchema = z.object({
	readerId: z.string().min(1),
	/** The question set's id (`ReaderExecutor.questionSet`). */
	questions: z.string().min(1),
	/** When: an ISO date or datetime. */
	on: z.string().min(1)
});
export type SeenBy = z.infer<typeof seenBySchema>;

export const corpusSchema = z.object({
	/** Qualified like every pack contribution: `fs-servicing/corpus/requests-v1`. */
	id: z.string().min(1),
	name: z.string().min(1),
	version: z.string().min(1),
	stateKind: z.string().min(1),
	/** The corpus's own guide: who wrote it, that it is synthetic, and the test it cannot stand in for. */
	guide: z.string().min(1),
	labels: z.record(z.string(), corpusLabelSchema),
	rows: z.array(corpusRowSchema),
	/** The question set the corpus was written against: the id `seenBy` names, the digest that pins its text. */
	questions: z.object({ id: z.string().min(1), digest: z.string().min(1) }).optional(),
	annotators: z.array(annotatorSchema),
	/** Every row written after `questions` was frozen. */
	heldOut: z.boolean(),
	/** Appended, never rewritten: each reader and question set scored on this corpus. */
	seenBy: z.array(seenBySchema),
	/** SHA-256 over the canonical JSON of `{ labels, rows }` (`corpusDigest`). */
	digest: z.string().regex(/^[0-9a-f]{64}$/)
});
export type Corpus = z.infer<typeof corpusSchema>;

/**
 * **The freeze** (`105-…` §3): SHA-256 over the canonical JSON of the label
 * sets and the rows — not the annotators, `seenBy` or the digest, which are
 * the corpus's history and grow after it is frozen. Canonical, so the same
 * corpus hashes the same however it is formatted.
 */
export function corpusDigest(corpus: Pick<Corpus, 'labels' | 'rows'>): string {
	return sha256Hex(canonicalJson({ labels: corpus.labels, rows: corpus.rows }));
}

/** What `craftabot corpus label` writes (`105-…` §6): a second annotator's labels, against a frozen corpus. */
export const secondLabelsSchema = z.object({
	corpusId: z.string().min(1),
	corpusDigest: z.string().regex(/^[0-9a-f]{64}$/),
	annotator: z.string().min(1),
	blind: z.boolean(),
	labels: z.array(
		z.object({
			id: z.string().min(1),
			labels: z.record(z.string(), z.string()),
			note: z.string().optional()
		})
	)
});
export type SecondLabels = z.infer<typeof secondLabelsSchema>;

export function parseCorpus(value: unknown): Corpus {
	return corpusSchema.parse(value);
}

/** Whether a reader asked a question set has been scored on this corpus already. */
export function seenByFor(
	corpus: Pick<Corpus, 'seenBy'>,
	readerId: string,
	questions: string
): SeenBy | undefined {
	return corpus.seenBy.find(
		(entry) => entry.readerId === readerId && entry.questions === questions
	);
}

/**
 * **The held-out rule** (`105-…` §5): why a reader executor may not be scored
 * on this corpus, or `undefined`. It must name its question set; and a
 * `(reader, questions)` the corpus has seen is refused unless the campaign is
 * a regression.
 */
export function heldOutRefusal(
	corpus: Pick<Corpus, 'id' | 'seenBy'>,
	reader: { readerId: string; questionSet?: string | undefined },
	regression: boolean
): string | undefined {
	if (reader.questionSet === undefined)
		return `reader "${reader.readerId}" is scored on corpus "${corpus.id}" but names no question set`;
	const seen = seenByFor(corpus, reader.readerId, reader.questionSet);
	if (seen && !regression)
		return `corpus "${corpus.id}" has already scored reader "${reader.readerId}" with questions "${reader.questionSet}" (${seen.on}); mark the source a regression to run it again`;
	return undefined;
}
