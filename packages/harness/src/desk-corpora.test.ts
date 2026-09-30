import { scoreReader } from '@craftabot/evals';
import {
	COMPLAINTS_CORPUS,
	COMPLAINT_WORDS_QUESTION,
	COMPLAINT_WORDS_READER,
	GOALS_CORPUS,
	GOAL_QUESTION,
	GOAL_READER
} from '@craftabot/pack-fs-advice';
import {
	DISPUTES_CORPUS,
	DISPUTE_WORDS_QUESTION,
	DISPUTE_WORDS_READER
} from '@craftabot/pack-fs-disputes';
import { COACHING_CORPUS, COACHING_QUESTION, COACHING_READER } from '@craftabot/pack-fs-fraud';
import {
	LOAN_PURPOSE_CORPUS,
	LOAN_PURPOSE_QUESTION,
	LOAN_PURPOSE_READER
} from '@craftabot/pack-fs-lending';
import { PURPOSE_CORPUS, PURPOSE_QUESTION, PURPOSE_READER } from '@craftabot/pack-fs-onboarding';
import {
	CATEGORY_QUESTION,
	SERVICING_CORPORA,
	SERVICING_READERS,
	SUPPORT_NEED_QUESTION
} from '@craftabot/pack-fs-servicing';
import { mockLlmReader } from '@craftabot/pack-readers-llm';
import { checkCorpus, corpusFindings } from '@craftabot/pack-testkit';
import type { Corpus, Reader, TypedQuestion } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { createRegistry, defaultConfig } from './config.js';

/**
 * **A corpus per desk** (WP121, `105-CORPORA.md` §9): the seven desks'
 * corpora on their manifests, every one passing `checkCorpus`, none its
 * author's alone, the six new ones held out from their frozen question sets;
 * and every desk's keyword rule — and the LLM contract's keyword stand-in —
 * scored on its corpus to the figures each desk's note quotes.
 */
const DESKS: Array<[string, Corpus, Reader, string, TypedQuestion, number, number]> = [
	// desk, corpus, rule reader, label, question, rule right /100, stand-in right /100
	[
		'disputes',
		DISPUTES_CORPUS,
		DISPUTE_WORDS_READER,
		'classification',
		DISPUTE_WORDS_QUESTION,
		42,
		33
	],
	['fraud', COACHING_CORPUS, COACHING_READER, 'coached', COACHING_QUESTION, 43, 50],
	[
		'complaints',
		COMPLAINTS_CORPUS,
		COMPLAINT_WORDS_READER,
		'cause',
		COMPLAINT_WORDS_QUESTION,
		44,
		26
	],
	['onboarding', PURPOSE_CORPUS, PURPOSE_READER, 'purpose', PURPOSE_QUESTION, 40, 27],
	['lending', LOAN_PURPOSE_CORPUS, LOAN_PURPOSE_READER, 'purpose', LOAN_PURPOSE_QUESTION, 43, 30],
	['advice', GOALS_CORPUS, GOAL_READER, 'goal', GOAL_QUESTION, 45, 42]
];

describe('a corpus per desk (WP121)', () => {
	it('registers seven desks’ corpora through the default packs, every one sound and blind-labelled twice', () => {
		const registry = createRegistry(defaultConfig());
		// WP122's adversarial corpora are held by `adversarial-corpora.test.ts`.
		const corpora = registry
			.listCorpora()
			.filter((corpus) => !corpus.id.endsWith('/adversarial-v1'));
		expect(corpora.map((corpus) => corpus.id).sort()).toEqual(
			[...SERVICING_CORPORA, ...DESKS.map((desk) => desk[1])].map((corpus) => corpus.id).sort()
		);
		for (const corpus of corpora) {
			expect(checkCorpus(corpus), corpus.id).toEqual([]);
			expect(corpusFindings(corpus), corpus.id).toEqual([]);
			expect(corpus.guide, corpus.id).toMatch(/synthetic/i);
		}
	});

	it.each(DESKS)(
		'%s: held out from its frozen question set, agreed blind, and its rule scored',
		async (_desk, corpus, rule, label, question, ruleRight, standInRight) => {
			expect(corpus.rows.length).toBe(100);
			expect(corpus).toMatchObject({ heldOut: true, seenBy: [] });
			const blind = corpus.annotators.filter((annotator) => annotator.blind);
			expect(blind.map((annotator) => annotator.id)).toEqual(['second-labeller', 'third-labeller']);
			for (const annotator of blind) expect(annotator.kappa![label]).toBeGreaterThanOrEqual(0.95);
			expect((await scoreReader(rule, corpus, { label, question })).right).toBe(ruleRight);
			expect((await scoreReader(mockLlmReader, corpus, { label, question })).right).toBe(
				standInRight
			);
		}
	);

	it('scores the servicing desk’s rules on its three corpora as the branch published them', async () => {
		const scored = [];
		for (const corpus of SERVICING_CORPORA) {
			const category = await scoreReader(SERVICING_READERS[0]!, corpus, {
				label: 'category',
				question: CATEGORY_QUESTION
			});
			const need = await scoreReader(SERVICING_READERS[1]!, corpus, {
				label: 'need',
				question: SUPPORT_NEED_QUESTION
			});
			scored.push([corpus.id, category.right, need.right, corpus.rows.length]);
		}
		expect(scored).toEqual([
			['fs-servicing/corpus/requests-v1', 51, 59, 95],
			['fs-servicing/corpus/requests-v2', 64, 68, 115],
			['fs-servicing/corpus/requests-v3', 61, 58, 96]
		]);
	});
});
