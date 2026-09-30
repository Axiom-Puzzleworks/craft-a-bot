import { parseCorpus, type Corpus } from '@craftabot/core';
import v1 from './requests-v1.corpus.json' with { type: 'json' };
import v2 from './requests-v2.corpus.json' with { type: 'json' };
import v3 from './requests-v3.corpus.json' with { type: 'json' };

/**
 * **The servicing corpora** (WP119, `105-CORPORA.md` §7): what callers say at
 * the servicing desk, labelled with the request and the support need — the
 * three corpora the Jev experiment wrote (`98-JEV.md` §8–§11), migrated from
 * the typesafe pack's TypeScript arrays as content: v1 (95 rows, its
 * author's labels alone), v2 (115, harder, blind second labels, κ 1.00 /
 * 0.92), v3 (96, held out from the second question set, κ 0.99 / 1.00 /
 * 1.00 with a steer label). Every row synthetic; each guide says so, and
 * names the real-call test it cannot stand in for.
 */
export const REQUESTS_V1_CORPUS_ID = 'fs-servicing/corpus/requests-v1';
export const REQUESTS_V2_CORPUS_ID = 'fs-servicing/corpus/requests-v2';
export const REQUESTS_V3_CORPUS_ID = 'fs-servicing/corpus/requests-v3';

export const SERVICING_CORPORA: Corpus[] = [v1, v2, v3].map((corpus) => parseCorpus(corpus));

/** A servicing corpus by id; throws on one the pack does not ship. */
export function servicingCorpus(id: string): Corpus {
	const corpus = SERVICING_CORPORA.find((entry) => entry.id === id);
	if (!corpus) throw new Error(`fs-servicing ships no corpus "${id}"`);
	return corpus;
}
