import { createPackRegistry } from '@craftabot/core';
import fsBankPack from '@craftabot/pack-fs-bank';
import starterPack from '@craftabot/pack-starter';
import { checkCorpus, corpusFindings } from '@craftabot/pack-testkit';
import { describe, expect, it } from 'vitest';
import fsServicingPack from '../index.js';
import {
	REQUESTS_V1_CORPUS_ID,
	REQUESTS_V2_CORPUS_ID,
	REQUESTS_V3_CORPUS_ID,
	SERVICING_CORPORA,
	servicingCorpus
} from './index.js';

/**
 * **The servicing corpora** (WP119, `105-CORPORA.md` §7): three corpora on the
 * pack's manifest, each passing `checkCorpus` — frozen, synthetic, labelled
 * inside its sets — with v1 found to be its author's alone, v2 and v3
 * blind-labelled with the branch's agreement, v3 held out from q2, and every
 * reader the lab record names recorded as having seen them.
 */
describe('the servicing corpora (WP119)', () => {
	it('ship on the manifest and pass checkCorpus', () => {
		const registry = createPackRegistry();
		registry.registerPack(starterPack);
		registry.registerPack(fsBankPack);
		registry.registerPack(fsServicingPack);
		expect(registry.listCorpora().map((corpus) => [corpus.id, corpus.rows.length])).toEqual([
			[REQUESTS_V1_CORPUS_ID, 95],
			[REQUESTS_V2_CORPUS_ID, 115],
			[REQUESTS_V3_CORPUS_ID, 96],
			// WP122 (`106-BENCHMARK.md` §5): the desk's adversarial corpus beside them.
			['fs-servicing/corpus/adversarial-v1', 200]
		]);
		for (const corpus of SERVICING_CORPORA) expect(checkCorpus(corpus), corpus.id).toEqual([]);
		expect(() => servicingCorpus('fs-servicing/corpus/none')).toThrow(/ships no corpus/);
	});

	it('say who labelled them: every corpus blind-labelled twice, with the agreement recorded', () => {
		// v1's second and third labellers since WP121 (`105-CORPORA.md` §9.2): no corpus is its author's alone.
		for (const corpus of SERVICING_CORPORA) expect(corpusFindings(corpus), corpus.id).toEqual([]);
		expect(servicingCorpus(REQUESTS_V1_CORPUS_ID).annotators.map((a) => [a.id, a.kappa])).toEqual([
			['author', undefined],
			['second-labeller', { category: 1, need: 1 }],
			['third-labeller', { category: 1, need: 0.9681 }]
		]);
		expect(servicingCorpus(REQUESTS_V2_CORPUS_ID).annotators.at(-1)).toEqual({
			id: 'second-labeller',
			blind: true,
			kappa: { category: 1, need: 0.9194 }
		});
		expect(servicingCorpus(REQUESTS_V3_CORPUS_ID).annotators.at(-1)?.kappa).toEqual({
			category: 0.9869,
			need: 1,
			steer: 1
		});
	});

	it('held v3 out from q2, and record every reader the lab scored on each', () => {
		const v3 = servicingCorpus(REQUESTS_V3_CORPUS_ID);
		expect(v3).toMatchObject({
			heldOut: true,
			questions: { id: 'typesafe/questions/servicing-q2' }
		});
		expect(servicingCorpus(REQUESTS_V1_CORPUS_ID).heldOut).toBe(false);
		for (const corpus of SERVICING_CORPORA) {
			expect(corpus.seenBy).toHaveLength(6);
			expect(corpus.guide).toContain('A sample of real calls');
		}
	});
});
