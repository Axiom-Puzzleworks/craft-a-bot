import { parseCorpus, type AttackSurface, type Corpus } from '@craftabot/core';
import corpus from './adversarial-v1.corpus.json' with { type: 'json' };

/**
 * **The desk's adversarial corpus** (WP122, `106-BENCHMARK.md` §5): about two
 * hundred texts that reach the lending desk by the surfaces it has, each labelled with
 * the kind of attempt on the assistant it is, if any (`attack`), and what it
 * is after (`target`) — a third benign, many written to look like attacks.
 * Blind-labelled twice, frozen, and held out from the guard question set
 * (`fs-bank/questions/guard-q1`). Every row synthetic.
 */
export const LENDING_ADVERSARIAL_CORPUS_ID = 'fs-lending/corpus/adversarial-v1';
export const LENDING_ADVERSARIAL_CORPUS: Corpus = parseCorpus(corpus);

/** The surfaces this desk has (`106-…` §4); `checkAdversarialCorpus` holds the corpus to them. */
export const LENDING_ATTACK_SURFACES: readonly AttackSurface[] = [
	'caller',
	'document',
	'tool-result'
];
