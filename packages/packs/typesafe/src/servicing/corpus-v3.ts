import { REQUESTS_V3_CORPUS_ID, servicingCorpus } from '@craftabot/pack-fs-servicing';
import { legacyRows, type CorpusRow } from './corpus.js';

/**
 * **The held-out servicing corpus, v3** (`98-JEV.md` §11). It was written
 * after the v2 questions were frozen (hashed 2026-09-28T08:38Z), as new calls
 * rather than rewordings of v1 or v2. No reader, and no question, was tuned
 * on it. It is the test of whether putting the guide's rules into the
 * questions helps on data they were not fitted to. Synthetic throughout
 * (hard rule 9), and no digits.
 *
 * The labelling guide is v2's (`corpus-v2.ts`), with two points made
 * explicit because the v2 questions state them. That keeps the label and the
 * question from disagreeing by construction:
 * - `health` is the **caller's own** condition. A relative's illness is `none`,
 *   unless the call is about that relative's account and the need is theirs.
 *   v3 avoids that case.
 * - `job-loss` includes the **partner whose income the household depends on**.
 *
 * The tags are v2's; `plain` and `paraphrase` are v1's, as controls. The
 * `steer` rows are more numerous here (fifteen), since the steer is what
 * the v2 questions add.
 */

/** v3 as the experiment's rows (WP119): a view of `fs-servicing`'s `requests-v3` corpus, held to its freeze hash (`3c90c8a3…`). */
export const SERVICING_CORPUS_V3: readonly CorpusRow[] = legacyRows(
	servicingCorpus(REQUESTS_V3_CORPUS_ID)
);
