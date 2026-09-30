import { readFileSync } from 'node:fs';
import { secondLabelsSchema } from '@craftabot/core';
import {
	REQUESTS_V2_CORPUS_ID,
	REQUESTS_V3_CORPUS_ID,
	servicingCorpus
} from '@craftabot/pack-fs-servicing';
import { describe, expect, it } from 'vitest';
import { agreementOf } from './commands/corpus.js';

/**
 * **The servicing corpora's agreement, recomputed** (WP119, `105-CORPORA.md`
 * §7): `craftabot corpus agreement` over each shipped second-label file gives
 * the κ the corpus records — v2 1.00 / 0.92, v3 0.99 / 1.00 / 1.00, the
 * branch's figures — and every disagreement falls on a row the author had
 * already marked contested.
 */
const secondLabels = (name: string) =>
	secondLabelsSchema.parse(
		JSON.parse(
			readFileSync(
				new URL(`../../packs/fs-servicing/src/corpora/${name}.second-labels.json`, import.meta.url),
				'utf8'
			)
		)
	);

describe('the servicing corpora’s agreement (WP119)', () => {
	for (const [id, file] of [
		[REQUESTS_V2_CORPUS_ID, 'requests-v2'],
		[REQUESTS_V3_CORPUS_ID, 'requests-v3']
	] as const) {
		it(`${file}: the recorded κ is what the second labels give`, () => {
			const corpus = servicingCorpus(id);
			const { report, corpus: recorded } = agreementOf(corpus, secondLabels(file));
			expect(recorded.annotators).toEqual(corpus.annotators);
			const contested = new Set(corpus.rows.filter((row) => row.contested).map((row) => row.id));
			for (const rows of Object.values(report.disagreements))
				for (const row of rows) expect(contested.has(row.id), row.id).toBe(true);
		});
	}
});
