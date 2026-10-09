import type { CalibrationTable } from '@craftabot/core';
import { row, table } from './rows.js';
import measured from './measured-error-rates.json' with { type: 'json' };

interface MeasuredRate {
	id: string;
	of: string;
	what: string;
	suite: string;
	model: string;
	recording: string;
	recordedOn: string;
	n: number;
	wrong: number;
	interval: [number, number];
}

/**
 * **How often a live model got a decision wrong** (WP197, `114-DECISIONS-UNDER-PRESSURE-PLAN.md`): one row per desk per suite, read
 * from the committed live recordings by `scripts/measured-error-rates.mjs` — the baseline arm's miss rate on the design's primary
 * measure, with its interval. They sit **beside** `ERROR_RATES`, whose assumed rows are kept as the `stress` level (`role: 'stress'`):
 * a planted rate high enough for a campaign of a few hundred cases to see a control move it, which the measured rates (mostly at or
 * near zero, because a model that can see the rule follows it) are not. A measured row is one sample of one model on this synthetic
 * bank, at temperature 0; it says nothing about the model in general. `review: 'pending'`.
 */
export const ERROR_RATES_MEASURED: CalibrationTable = table(
	'fs-bank/error-rates-measured',
	'How often a live model got a decision wrong, measured',
	'The miss rate of the live tier’s brain on each desk’s primary decision measure with no control in place, from the committed recordings, with the 95% interval.',
	(measured as MeasuredRate[]).map((rate) =>
		row({
			id: rate.id,
			kind: 'rates',
			title: `${rate.what}: the miss rate, measured on ${rate.model}`,
			distribution: { wrong: rate.wrong },
			source: {
				kind: 'measurement',
				recording: rate.recording,
				model: rate.model,
				n: rate.n,
				interval: rate.interval,
				retrieved: rate.recordedOn
			},
			tolerance: 0.5,
			note: `Measured: ${Math.round(rate.wrong * 1000) / 10}% of ${rate.n} items (95% interval ${Math.round(rate.interval[0] * 1000) / 10}–${Math.round(rate.interval[1] * 1000) / 10}%) did not match, with the design's controls off, over the ${rate.suite === 'giant' ? 'first' : 'second'} live suite. The assumed row \`${rate.of}\` is kept beside it as the stress rate.`
		})
	)
);
