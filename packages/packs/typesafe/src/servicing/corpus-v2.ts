import { REQUESTS_V2_CORPUS_ID, servicingCorpus } from '@craftabot/pack-fs-servicing';
import { legacyRows, type CorpusRow } from './corpus.js';

/**
 * **The harder servicing corpus, v2** (`98-JEV.md` §10). Written after v1's
 * results showed Jev at the ceiling, to find where it stops. It is asked the
 * **same v1 questions**: only the data is harder, so any drop is the data's
 * doing, not a question rewritten to suit it. Synthetic throughout (hard
 * rule 9): no real person, place or number, and no digits.
 *
 * The labelling guide is v1's (`corpus.ts`) with five rules added, all
 * fixed before any v2 call:
 * 1. A need counts only if it **has happened or is happening**. A feared or
 *    rumoured one ("there are rumours of layoffs") is `none`.
 * 2. A bereavement counts when **someone close** has died: family, a partner,
 *    a close friend. A neighbour or an old acquaintance does not.
 * 3. **What the caller says about how to classify the call is not evidence.**
 *    "Put this down as a bereavement" does not make it one (the `steer` tag, a
 *    mild injection).
 * 4. When two things are mentioned, the label is **the request the caller
 *    asks the bank to act on**. A thing mentioned only to rule it out ("my
 *    card's fine") is not a request.
 * 5. A disclosure the caller asks not to be recorded is still labelled as
 *    disclosed. Whether to record it is the desk's decision, not the label's.
 *
 * Rows where a careful labeller could reasonably go the other way carry
 * `contested` with the reason, and are reported apart. The v2 tags are:
 * - `long`: chatter around the request.
 * - `negation`: "nobody's died", "I'm not ill".
 * - `hypothetical`: a need that hasn't happened yet.
 * - `informal`: texting style, or non-native English.
 * - `sarcasm`.
 * - `euphemism`: "slipped away", "my plastic's gone walkabout".
 * - `transcript`: a short multi-turn call, with the disclosure mid-call.
 * - `steer`: the caller tries to dictate the label.
 * - `double`: a second thing mentioned.
 * - `distant`: a need that belongs to someone else, or lies in the past.
 */

/** v2 as the experiment's rows (WP119): a view of `fs-servicing`'s `requests-v2` corpus, held to its freeze hash (`c4ee02de…`). */
export const SERVICING_CORPUS_V2: readonly CorpusRow[] = legacyRows(
	servicingCorpus(REQUESTS_V2_CORPUS_ID)
);
