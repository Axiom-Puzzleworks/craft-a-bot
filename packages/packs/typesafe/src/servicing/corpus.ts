import type { Corpus } from '@craftabot/core';
import {
	REQUESTS_V1_CORPUS_ID,
	servicingCorpus,
	type Category,
	type SupportNeed
} from '@craftabot/pack-fs-servicing';

/**
 * **The labelled servicing corpus** (`98-JEV.md` §8): what callers say when
 * they ring the servicing desk, each utterance labelled with the request it
 * makes and the support need it discloses — authored for this experiment,
 * synthetic throughout (hard rule 9: no person, number or place in it is
 * real; no digits at all), and **frozen before Jev saw any of it**, so the
 * questions in `questions.ts` were not tuned against these answers.
 *
 * The labelling guide, the same words the questions use:
 * - **address** — change the address held on the caller's own account, because
 *   they have moved or are moving home.
 * - **card** — replace or stop a bank card that is lost, stolen, damaged,
 *   expired or not working.
 * - **third-party** — let another living person access, manage or act on the
 *   caller's account.
 * - **bereavement** — deal with the account of someone who has died.
 * - **disclosure** — none of the above: the caller only tells the bank about
 *   their circumstances.
 * - A **need** is one the caller discloses about themselves or someone close:
 *   `job-loss` (lost their job or income from work), `bereavement` (someone
 *   close has died), `health` (a physical or mental condition, illness,
 *   injury, disability or treatment), else `none`.
 *
 * Each row carries a **difficulty tag**, so results can be sliced:
 * - `plain` — the canonical wording, which the bank's regex was written for.
 * - `paraphrase` — the meaning is plain to a person, and the regex's words are absent.
 * - `trap` — words the regex keys on, used in a sense it does not mean ("my card died").
 * - `mixed` — a request with a need disclosed in passing.
 *
 * The tag is the author's prediction of difficulty, set before any run; the
 * results say whether it held.
 */
export type Difficulty =
	| 'plain'
	| 'paraphrase'
	| 'trap'
	| 'mixed'
	// v2 (`corpus-v2.ts`):
	| 'long'
	| 'negation'
	| 'hypothetical'
	| 'informal'
	| 'sarcasm'
	| 'euphemism'
	| 'transcript'
	| 'steer'
	| 'double'
	| 'distant';

export interface CorpusRow {
	id: string;
	text: string;
	category: Category;
	need: SupportNeed;
	tag: Difficulty;
	/** v2: why the label is a judgment call a careful person could make the other way — reported apart. */
	contested?: string;
	/** v2: the blind second labeller's need, where it differs from this row's — scored as an alternative, never as the truth. */
	secondNeed?: SupportNeed;
	/** v3: the blind second labeller's category, where it differs. */
	secondCategory?: Category;
}

/**
 * **The corpus as the Jev experiment's rows** (WP119, `105-CORPORA.md` §7):
 * the rows now live as content — `fs-servicing`'s `requests-v1` corpus — and
 * this is a view of it in the shape the experiment's scripts read. A test
 * holds the view to the freeze hash the branch recorded
 * (`46379f9f…`), so the move from this file's array to the corpus lost nothing.
 */
export function legacyRows(corpus: Corpus): CorpusRow[] {
	return corpus.rows.map((row) => {
		const alternatives = row.contested?.alternatives ?? {};
		return {
			id: row.id,
			text: String(row.state),
			category: row.labels['category'] as Category,
			need: row.labels['need'] as SupportNeed,
			tag: row.tags[0] as Difficulty,
			...(row.contested ? { contested: row.contested.reason } : {}),
			...(alternatives['need'] ? { secondNeed: alternatives['need'] as SupportNeed } : {}),
			...(alternatives['category'] ? { secondCategory: alternatives['category'] as Category } : {})
		};
	});
}

export const SERVICING_CORPUS: readonly CorpusRow[] = legacyRows(
	servicingCorpus(REQUESTS_V1_CORPUS_ID)
);
