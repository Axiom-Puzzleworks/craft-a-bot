import { parseCorpus, type Corpus } from '@craftabot/core';
import corpus from './complaints-v1.corpus.json' with { type: 'json' };

/**
 * **The desk's corpus** (WP121, `105-CORPORA.md` §9): about a hundred rows of
 * a customer’s complaint, labelled `cause` by an authoring pass, blind-labelled twice (the
 * same model, and another), frozen, and held out from its question set.
 * Every row synthetic; the guide says so, and names the real-words test it
 * cannot stand in for.
 */
export const COMPLAINTS_CORPUS_ID = 'fs-advice/corpus/complaints-v1';
export const COMPLAINTS_CORPUS: Corpus = parseCorpus(corpus);
