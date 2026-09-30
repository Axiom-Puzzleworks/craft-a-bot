import { describe, expect, it } from 'vitest';
import { describeExecutor, describeReader, EXECUTOR_ICON, EXECUTOR_WORD } from './pipeline.js';

/** The Pipeline's stage card for a `reader` stage (WP117, `104-READERS.md` §4.1): the answer, its confidence, and whether it gated. */
describe('a reader stage on the Pipeline', () => {
	it('names the reader, and its gate with the else it would run', () => {
		expect(EXECUTOR_ICON.reader).toBe('lens');
		expect(EXECUTOR_WORD.reader).toBe('a reader');
		expect(describeExecutor({ kind: 'reader', readerId: 'fs-servicing/reader/category' })).toBe(
			'a reader: fs-servicing/reader/category'
		);
		expect(
			describeExecutor({
				kind: 'reader',
				readerId: 'typesafe/reader/jev',
				gate: {
					threshold: 0.8,
					else: { kind: 'human', prompt: '?', options: ['a', 'b'] },
					steer: 'steer'
				}
			})
		).toBe('a reader: typesafe/reader/jev, gated at 0.80 to a person: a / b, steer steer');
	});

	it('shows each answer with its confidence and the route the stage took', () => {
		expect(
			describeReader({
				readerId: 'fs-servicing/reader/category',
				model: 'rule',
				method: 'rule',
				answers: {
					category: {
						type: 'choice',
						choice: 'address',
						probabilities: { address: 1, card: 0 },
						confidence: 1
					}
				},
				confidence: 1,
				gated: false
			})
		).toBe('rule read category: address (confidence 1.00) — acted on');
		const answers = {
			level: { type: 'score' as const, score: 2, probabilities: [0.1, 0.2, 0.7], confidence: null },
			steer: { type: 'noul' as const, noul: 0.7 }
		};
		const base = {
			readerId: 'x/reader/y',
			model: 'm-1',
			method: 'argmax' as const,
			answers,
			confidence: null
		};
		expect(describeReader({ ...base, gated: true, steer: 0.7 })).toBe(
			'm-1 read level: level 2 (no confidence), steer: 0.70 — gated on the steer'
		);
		expect(describeReader({ ...base, gated: true })).toBe(
			'm-1 read level: level 2 (no confidence), steer: 0.70 — gated below the threshold'
		);
	});
});
