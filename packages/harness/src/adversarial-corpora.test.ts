import type { AttackSurface, Corpus } from '@craftabot/core';
import { scoreReader } from '@craftabot/evals';
import { ADVICE_ADVERSARIAL_CORPUS, ADVICE_ATTACK_SURFACES } from '@craftabot/pack-fs-advice';
import {
	ATTACK_KIND_QUESTION,
	ATTACK_WORDS_READER,
	GUARD_QUESTION_SET_DIGEST,
	GUARD_QUESTION_SET_ID
} from '@craftabot/pack-fs-bank';
import {
	COLLECTIONS_ADVERSARIAL_CORPUS,
	COLLECTIONS_ATTACK_SURFACES
} from '@craftabot/pack-fs-collections';
import { DISPUTES_ADVERSARIAL_CORPUS, DISPUTES_ATTACK_SURFACES } from '@craftabot/pack-fs-disputes';
import { FRAUD_ADVERSARIAL_CORPUS, FRAUD_ATTACK_SURFACES } from '@craftabot/pack-fs-fraud';
import { LENDING_ADVERSARIAL_CORPUS, LENDING_ATTACK_SURFACES } from '@craftabot/pack-fs-lending';
import {
	ONBOARDING_ADVERSARIAL_CORPUS,
	ONBOARDING_ATTACK_SURFACES
} from '@craftabot/pack-fs-onboarding';
import {
	SERVICING_ADVERSARIAL_CORPUS,
	SERVICING_ATTACK_SURFACES,
	SERVICING_CORPORA
} from '@craftabot/pack-fs-servicing';
import {
	adversarialProfile,
	checkAdversarialCorpus,
	corpusFindings
} from '@craftabot/pack-testkit';
import { describe, expect, it } from 'vitest';
import { createRegistry, defaultConfig } from './config.js';

/**
 * **The adversarial corpora** (WP122, `106-BENCHMARK.md` §5): one per desk,
 * on its pack's manifest, held out from the guard question set frozen first,
 * blind-labelled twice, every surface the desk has carrying attacks and
 * benign rows alike; the benign share and the keyword baseline's reading of
 * the kind, pinned to the figures the note states.
 */
const DESKS: Array<[string, Corpus, readonly AttackSurface[]]> = [
	['servicing', SERVICING_ADVERSARIAL_CORPUS, SERVICING_ATTACK_SURFACES],
	['advice', ADVICE_ADVERSARIAL_CORPUS, ADVICE_ATTACK_SURFACES],
	['fraud', FRAUD_ADVERSARIAL_CORPUS, FRAUD_ATTACK_SURFACES],
	['lending', LENDING_ADVERSARIAL_CORPUS, LENDING_ATTACK_SURFACES],
	['onboarding', ONBOARDING_ADVERSARIAL_CORPUS, ONBOARDING_ATTACK_SURFACES],
	['disputes', DISPUTES_ADVERSARIAL_CORPUS, DISPUTES_ATTACK_SURFACES],
	['collections', COLLECTIONS_ADVERSARIAL_CORPUS, COLLECTIONS_ATTACK_SURFACES]
];

/** desk → [rows, benign, the keyword baseline's kind right, attacks it flags, benign it flags]. */
const PINNED: Record<string, [number, number, number, number, number]> = {
	servicing: [200, 70, 101, 46, 14],
	advice: [203, 68, 88, 32, 12],
	fraud: [202, 70, 100, 40, 9],
	lending: [202, 70, 87, 24, 3],
	onboarding: [200, 70, 95, 33, 7],
	disputes: [201, 70, 95, 28, 0],
	collections: [200, 70, 93, 35, 10]
};

describe('the adversarial corpora (WP122)', () => {
	it('registers seven, one per desk pack, through the default packs', () => {
		const ids = createRegistry(defaultConfig())
			.listCorpora()
			.map((corpus) => corpus.id)
			.filter((id) => id.endsWith('/adversarial-v1'));
		expect(ids.sort()).toEqual(DESKS.map(([, corpus]) => corpus.id).sort());
	});

	it.each(DESKS)(
		'%s: sound, over its surfaces, held out from guard-q1 and blind-labelled twice',
		(_desk, corpus, surfaces) => {
			expect(checkAdversarialCorpus(corpus, { surfaces })).toEqual([]);
			expect(corpusFindings(corpus)).toEqual([]);
			expect(corpus).toMatchObject({
				heldOut: true,
				seenBy: [],
				questions: { id: GUARD_QUESTION_SET_ID, digest: GUARD_QUESTION_SET_DIGEST }
			});
			const blind = corpus.annotators.filter((annotator) => annotator.blind);
			expect(blind.map((annotator) => annotator.id)).toEqual(['second-labeller', 'third-labeller']);
			for (const annotator of blind)
				expect(Object.keys(annotator.kappa ?? {}).sort()).toEqual(['attack', 'target']);
		}
	);

	it('seeds the servicing corpus with the branch’s twenty-seven steers, word for word', () => {
		const texts = new Set(
			SERVICING_ADVERSARIAL_CORPUS.rows.map((row) => (row.state as { text: string }).text)
		);
		const steers = SERVICING_CORPORA.flatMap((corpus) =>
			corpus.rows.filter((row) => row.tags.includes('steer') || row.labels.steer === 'yes')
		);
		expect(steers).toHaveLength(27);
		for (const row of steers) {
			const text =
				typeof row.state === 'string' ? row.state : (row.state as { utterance: string }).utterance;
			expect(texts.has(text), text).toBe(true);
		}
		expect(
			SERVICING_ADVERSARIAL_CORPUS.rows.filter((row) => row.tags.includes('seed-steer'))
		).toHaveLength(27);
	});

	it('states each corpus’s size and benign share, and the keyword baseline’s reading', async () => {
		const found: typeof PINNED = {};
		for (const [desk, corpus] of DESKS) {
			const profile = adversarialProfile(corpus);
			const score = await scoreReader(ATTACK_WORDS_READER, corpus, {
				label: 'attack',
				questionId: 'kind',
				question: ATTACK_KIND_QUESTION
			});
			const flagged = (label: string) =>
				Object.entries(score.confusion[label] ?? {})
					.filter(([answer]) => answer !== 'none')
					.reduce((sum, [, rows]) => sum + rows, 0);
			const attacksFlagged = Object.keys(score.confusion)
				.filter((label) => label !== 'none')
				.reduce((sum, label) => sum + flagged(label), 0);
			found[desk] = [profile.rows, profile.benign, score.right, attacksFlagged, flagged('none')];
		}
		expect(found).toEqual(PINNED);
	});
});
