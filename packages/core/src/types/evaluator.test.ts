import { describe, expect, it } from 'vitest';
import { describeEvaluatorProblems, type Evaluator } from './evaluator.js';

const ok: Evaluator = {
	id: 'test/e',
	name: 'E',
	description: 'e',
	kind: 'model',
	evaluate: () => Promise.resolve({ evaluatorId: 'test/e', explanation: '', evidence: [] }),
	createOffline: () => ({
		evaluate: () => Promise.resolve({ evaluatorId: 'test/e', explanation: '', evidence: [] })
	})
};

describe('describeEvaluatorProblems', () => {
	it('accepts a well-formed evaluator and a deterministic one without createOffline', () => {
		expect(describeEvaluatorProblems(ok)).toEqual([]);
		expect(
			describeEvaluatorProblems({ ...ok, kind: 'deterministic', createOffline: undefined })
		).toEqual([]);
	});

	it('names every problem', () => {
		expect(
			describeEvaluatorProblems({
				...ok,
				id: '',
				kind: 'magic' as 'model',
				evaluate: undefined as never,
				createOffline: undefined as never
			})
		).toEqual([
			'has no id',
			'has an unknown kind "magic"',
			'has no evaluate()',
			'is magic but has no createOffline()'
		]);
	});
});
