import { describe, expect, it } from 'vitest';
import { caseFailed, failedFirst } from './case-order.js';

/** The promise on the cases table, tested as a promise (NEW-2). */
describe('failedFirst', () => {
	const success = { outcome: 'SUCCESS' };
	const outOfSteps = { outcome: 'OUT_OF_STEPS' };
	const errored = { error: 'boom' };
	const unknown = {};

	it('puts a failed case before a successful one, whichever way round they arrive', () => {
		expect([success, outOfSteps].sort(failedFirst)).toEqual([outOfSteps, success]);
		expect([outOfSteps, success].sort(failedFirst)).toEqual([outOfSteps, success]);
	});

	it('treats an error as a failure and a missing outcome as neither', () => {
		expect(caseFailed(errored)).toBe(true);
		expect(caseFailed(unknown)).toBe(false);
		expect([success, unknown, errored].sort(failedFirst)).toEqual([errored, success, unknown]);
	});

	it('keeps the order inside each half', () => {
		const a = { outcome: 'OUT_OF_STEPS', id: 'a' };
		const b = { outcome: 'ERROR', id: 'b' };
		const c = { outcome: 'SUCCESS', id: 'c' };
		const d = { outcome: 'SUCCESS', id: 'd' };
		expect([c, a, d, b].sort(failedFirst).map((row) => row.id)).toEqual(['a', 'b', 'c', 'd']);
	});
});
