import { describe, expect, it } from 'vitest';
import { effectiveOutcome, isRunFinished } from './trace-file.js';

/** One definition of finished (NEW-3): the trace's own end, or a person's mark. */
describe('isRunFinished / effectiveOutcome', () => {
	it('is finished when the trace finished', () => {
		expect(isRunFinished({ outcome: 'SUCCESS' })).toBe(true);
		expect(effectiveOutcome({ outcome: 'SUCCESS' })).toBe('SUCCESS');
	});

	it('is not finished while in progress and unmarked', () => {
		expect(isRunFinished({ outcome: 'IN_PROGRESS' })).toBe(false);
		expect(effectiveOutcome({ outcome: 'IN_PROGRESS' })).toBe('IN_PROGRESS');
	});

	it('is finished, and ABANDONED, once a person marked it', () => {
		const run = { outcome: 'IN_PROGRESS', abandonedAt: '2026-09-07T10:00:00.000Z' };
		expect(isRunFinished(run)).toBe(true);
		expect(effectiveOutcome(run)).toBe('ABANDONED');
	});

	it('never rewrites a finished outcome, marked or not', () => {
		expect(
			effectiveOutcome({ outcome: 'OUT_OF_STEPS', abandonedAt: '2026-09-07T10:00:00.000Z' })
		).toBe('OUT_OF_STEPS');
	});
});
