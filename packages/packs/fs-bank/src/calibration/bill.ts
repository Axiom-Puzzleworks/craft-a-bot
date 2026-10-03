import type { CalibrationTable } from '@craftabot/core';
import { assumption, row, table } from './rows.js';

/**
 * **What a case costs** (WP172, `112-REAL-ENOUGH-PLAN.md` §5): the price of a
 * model's tokens and of a person's time, as rows, so an experiment can put the
 * model's cost and the human load in one unit. A table of its own, like
 * `ERROR_RATES`, so no population digest moves. Every row is an assumption and
 * says so, `review: 'pending'`: a price list is the builder's to set, not a
 * finding.
 */
export const BILL_RATES: CalibrationTable = table(
	'fs-bank/bill',
	'What a case costs',
	'The price of a thousand tokens on a hosted cartridge and on a local one, the hourly cost of a bank case handler, and a local cartridge’s power draw — stated as assumptions.',
	[
		row({
			id: 'model-pounds-per-thousand-tokens',
			kind: 'weights',
			title: 'Pounds per thousand tokens, input and output blended, by where the model runs',
			distribution: { hosted: 0.004, local: 0 },
			source: assumption(),
			tolerance: 0.5,
			note: 'A stated assumption: a hosted frontier model at a blended four-tenths of a penny per thousand tokens, in the range hosted list prices have sat in; the local cartridges cost nothing per token, their power (the next row) being the cost. A price list moves; re-state this row when the one the bill is read at does. The bill uses the hosted figure unless a design says otherwise.'
		}),
		row({
			id: 'human-pounds-per-hour',
			kind: 'weights',
			title: 'The fully loaded hourly cost of a bank case handler, in pounds',
			distribution: { 'case-handler': 28, 'senior-handler': 40 },
			source: assumption(),
			tolerance: 0.5,
			note: 'A stated assumption: salary, on-costs and overhead for an operations-grade case handler, about twenty-eight pounds an hour (a senior handler forty, stated beside it; the bill reads the first). Folded with the reviewer model’s seconds into the bill.'
		}),
		row({
			id: 'local-power',
			kind: 'weights',
			title: 'A local cartridge’s power draw in watts, and a kilowatt-hour in pounds',
			distribution: { watts: 140, 'pounds-per-kwh': 0.28 },
			source: assumption(),
			tolerance: 0.5,
			note: 'A stated assumption: a DGX Spark under load at about 140 W and a kilowatt-hour at 28 pence. Recorded so a local run’s cost is statable; the bill does not yet fold it, because a cell does not record its model seconds on a local cartridge.'
		})
	]
);
