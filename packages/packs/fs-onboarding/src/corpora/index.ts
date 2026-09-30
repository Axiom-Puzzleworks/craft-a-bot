import { parseCorpus, type Corpus } from '@craftabot/core';
import corpus from './purpose-v1.corpus.json' with { type: 'json' };

/**
 * **The desk's corpus** (WP121, `105-CORPORA.md` §9): about a hundred rows of
 * an applicant on what the account is for, labelled `purpose` by an authoring pass, blind-labelled twice (the
 * same model, and another), frozen, and held out from its question set.
 * Every row synthetic; the guide says so, and names the real-words test it
 * cannot stand in for.
 */
export const PURPOSE_CORPUS_ID = 'fs-onboarding/corpus/purpose-v1';
export const PURPOSE_CORPUS: Corpus = parseCorpus(corpus);
