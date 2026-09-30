import { describe, expect, it } from 'vitest';
import {
	brierScore,
	calibrationTest,
	expectedCalibrationError,
	gateCurve,
	reliability,
	type CalibratedAnswer
} from './calibration.js';
import { calibratedAnswers } from './validation/generators.js';

/** The calibration figures' edges (WP118, `104-READERS.md` §9): empty input, `null`, the steer, given edges, the test on a miscalibrated reader. */
const answer = (
	p: number,
	right: boolean,
	extra: Partial<CalibratedAnswer> = {}
): CalibratedAnswer => ({
	choice: 'a',
	label: right ? 'a' : 'b',
	probabilities: { a: p, b: 1 - p },
	confidence: 2 * p - 1,
	...extra
});

describe('calibration', () => {
	it('reads nothing from no answers', () => {
		expect(expectedCalibrationError([])).toEqual({
			metric: 'ece',
			value: 0,
			interval: [0, 0],
			n: 0
		});
		expect(brierScore([])).toEqual({ metric: 'brier', value: 0, interval: [0, 0], n: 0 });
		expect(reliability([]).every((bin) => bin.n === 0 && bin.meanProbability === 0)).toBe(true);
		expect(gateCurve([], [0.5])[0]?.reviewed.value).toBe(0);
		expect(calibrationTest([]).miscalibrated).toBe(false);
	});

	it('bins by the given edges, the last closed at the top', () => {
		const edges = [0, 0.5, 0.7, 0.8, 0.9, 0.95, 0.99, 1.0001];
		const bins = reliability([answer(1, true), answer(0.99, false), answer(0.55, true)], { edges });
		expect(bins.map((bin) => bin.n)).toEqual([0, 1, 0, 0, 0, 0, 2]);
		expect(bins.at(-1)).toMatchObject({ to: 1, meanProbability: 0.995 });
		expect(reliability([answer(1, true)]).at(-1)?.n).toBe(1);
	});

	it('scores a label the distribution never named', () => {
		expect(
			brierScore([{ choice: 'a', label: 'c', probabilities: { a: 1, b: 0 }, confidence: 1 }]).value
		).toBe(2);
	});

	it('gates a null confidence and a steer above zero, and lets everything through at zero', () => {
		const answers = [
			answer(0.9, true, { confidence: null }),
			answer(0.95, true, { steer: 0.7 }),
			answer(0.95, false, { steer: 0.2 })
		];
		const [open, gated] = gateCurve(answers, [0, 0.5]);
		expect(open).toMatchObject({ reviewed: { k: 0 }, residualAccuracy: { k: 2, n: 3 } });
		expect(gated).toMatchObject({
			reviewed: { k: 2, n: 3 },
			residualAccuracy: { k: 0, n: 1 },
			endToEnd: { k: 2, n: 3 }
		});
	});

	it('flags a miscalibrated reader, and bootstraps the same interval every run', () => {
		const off = calibratedAnswers(3, 2000, { gap: 0.15 });
		expect(calibrationTest(off).miscalibrated).toBe(true);
		expect(expectedCalibrationError(off)).toEqual(expectedCalibrationError(off));
		expect(expectedCalibrationError(off, { seed: 2 }).interval).not.toEqual(
			expectedCalibrationError(off).interval
		);
		// Four bootstraps over 2,000 answers: well under a second here, past five on a busy CI runner.
	}, 60_000);
});
