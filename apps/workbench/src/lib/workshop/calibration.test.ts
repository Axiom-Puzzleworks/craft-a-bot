import type { CalibrationRow } from '@craftabot/evals';
import { describe, expect, it } from 'vitest';
import { calibrationKey, calibrationSentence, filledBins } from './calibration.js';

/** The pane's folds (WP118): the report's numbers, placed; nothing counted here. */
const rate = (k: number, n: number) => ({
	k,
	n,
	value: n === 0 ? 0 : k / n,
	interval: [0, 1] as [number, number]
});
const ROW: CalibrationRow = {
	build: 'read',
	brain: 'scripted-optimal',
	stageId: 'classify',
	questionId: 'category',
	readerId: 'fs-servicing/reader/category',
	model: 'rule',
	n: 40,
	unlabelled: 0,
	accuracy: rate(36, 40),
	ece: { value: 0.1, interval: [0.05, 0.15] },
	brier: { value: 0.2, interval: [0.1, 0.3] },
	reliability: [
		{ from: 0.8, to: 0.9, n: 0, meanProbability: 0, accuracy: rate(0, 0) },
		{ from: 0.9, to: 1, n: 40, meanProbability: 1, accuracy: rate(36, 40) }
	],
	gates: [{ threshold: 0, reviewed: rate(0, 40), residualAccuracy: rate(36, 40) }]
};

describe('the calibration pane', () => {
	it('keys a row, shows only the filled bins with their gap, and says it in a sentence', () => {
		expect(calibrationKey(ROW)).toBe(
			'read · scripted-optimal · classify · category · fs-servicing/reader/category'
		);
		expect(filledBins(ROW)).toEqual([
			{ label: '0.90–1.00', n: 40, stated: 1, right: 0.9, gap: 0.9 - 1 }
		]);
		expect(calibrationSentence(ROW)).toBe(
			'fs-servicing/reader/category (rule) at classify, asked category: 36 of 40 right; ECE 0.100, Brier 0.200.'
		);
		expect(calibrationSentence({ ...ROW, unlabelled: 3 })).toContain(
			'3 readings had no answer key'
		);
	});
});
