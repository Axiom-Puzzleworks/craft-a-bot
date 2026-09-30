import type { CalibrationRow } from '@craftabot/evals';
import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import CalibrationPane from './CalibrationPane.svelte';

/** The calibration pane (WP118, `104-READERS.md` §9): a block per reader stage, its figures, the filled bins, the gate curve — all in text. */
const rate = (k: number, n: number) => ({
	k,
	n,
	value: n === 0 ? 0 : k / n,
	interval: [0.8, 0.96] as [number, number]
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
	gates: [
		{ threshold: 0, reviewed: rate(0, 40), residualAccuracy: rate(36, 40) },
		{ threshold: 0.99, reviewed: rate(40, 40), residualAccuracy: rate(0, 0) }
	]
};

describe('CalibrationPane', () => {
	it('draws each row with its figures, the bins with answers, and the gate curve', () => {
		render(CalibrationPane, { props: { rows: [ROW] } });
		const block = screen.getByTestId('calibration-read-classify-category');
		expect(within(block).getByText(/36 of 40 right; ECE 0\.100, Brier 0\.200/)).toBeTruthy();
		const reliability = within(block).getByRole('table', { name: 'Reliability, classify' });
		expect(within(reliability).getAllByRole('row')).toHaveLength(2);
		expect(within(reliability).getByText('0.90–1.00')).toBeTruthy();
		const gates = within(block).getByRole('table', { name: 'Gate curve, classify' });
		expect(within(gates).getByText('40/40 (100%)')).toBeTruthy();
		expect(within(gates).getByText('—')).toBeTruthy();
	});
});
