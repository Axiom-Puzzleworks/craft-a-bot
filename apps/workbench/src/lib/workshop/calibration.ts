import type { CalibrationRow } from '@craftabot/evals';

/**
 * **The calibration pane's folds** (WP118, `104-READERS.md` §9): a report's
 * calibration rows onto what the pane shows — a key per row, the bins with
 * answers in them, the gap in each, and the figures in words. Every number is
 * the report's own, computed by `@craftabot/metrics`; nothing here counts.
 */
export const calibrationKey = (row: CalibrationRow): string =>
	[row.build, row.brain, row.stageId, row.questionId, row.readerId].join(' · ');

/** The reliability table's bins with answers in them, each with the gap between what the reader stated and what it got right. */
export function filledBins(row: CalibrationRow) {
	return row.reliability
		.filter((bin) => bin.n > 0)
		.map((bin) => ({
			label: `${bin.from.toFixed(2)}–${bin.to.toFixed(2)}`,
			n: bin.n,
			stated: bin.meanProbability,
			right: bin.accuracy.value,
			gap: bin.accuracy.value - bin.meanProbability
		}));
}

const three = (value: number) => value.toFixed(3);

/** The row in a sentence, for the pane's twin and its heading. */
export function calibrationSentence(row: CalibrationRow): string {
	const right = `${row.accuracy.k} of ${row.accuracy.n} right`;
	const unkeyed = row.unlabelled > 0 ? `; ${row.unlabelled} readings had no answer key` : '';
	return `${row.readerId} (${row.model}) at ${row.stageId}, asked ${row.questionId}: ${right}; ECE ${three(row.ece.value)}, Brier ${three(row.brier.value)}${unkeyed}.`;
}
