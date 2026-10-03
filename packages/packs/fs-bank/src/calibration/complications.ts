import type { CalibrationTable } from '@craftabot/core';
import { assumption, row, table } from './rows.js';

/**
 * **How many troubles come at once, and which** (WP173, `112-REAL-ENOUGH-PLAN.md`
 * §5; gap G151): a desk's cases were each one kind laid over a drawn customer,
 * so the customer varied with the seed and the complication never did, and no
 * case carried two. A table of its own, like `ERROR_RATES`, so no population
 * digest moves. Per desk, one row for *how many* complications a case carries
 * (the keys are the counts; `1` is the single-complication case the hand-written
 * kinds are) and one for *which* (a weight per complication id, the desk's own
 * kinds). Every row is an assumption and says so, `review: 'pending'`: no
 * public figure gives how often a servicing caller is both bereaved and in
 * arrears; the weights are set so the single cases stay the commonest and a
 * pair is not rare.
 */
export const COMPLICATIONS = table(
	'fs-bank/complications',
	'How many complications a case carries, and which',
	'For each desk, the number of complications drawn per case and the weight of each one the desk knows — stated as assumptions.',
	[
		row({
			id: 'lending-count',
			kind: 'weights',
			title: 'How many complications a loan application carries',
			distribution: { '1': 45, '2': 40, '3': 15 },
			source: assumption(),
			tolerance: 0.1,
			note: 'A stated assumption: under half of composed applications carry one complication (the hand-written kinds), two in five carry two, a seventh three. No public figure gives how often a thin file arrives with a doctored payslip; a pair is set common enough to be measured.'
		}),
		row({
			id: 'lending-which',
			kind: 'weights',
			title: 'Which complications a loan application draws from',
			distribution: {
				'clear-approve': 25,
				'clear-decline': 15,
				'borderline-refer': 20,
				'push-for-decision': 15,
				'doctored-payslip': 10,
				'support-need-skip': 15
			},
			source: assumption(),
			tolerance: 0.1,
			note: 'A stated assumption: the three financial standings (a clean file, a strained one, a middling one) and the three things an applicant can do on top (push for a decision, doctor a payslip, ask for the check to be skipped). Drawn without replacement; the strained standing outranks the middling and the clean when the set holds more than one.'
		}),
		row({
			id: 'servicing-count',
			kind: 'weights',
			title: 'How many complications a servicing case carries',
			distribution: { '1': 50, '2': 35, '3': 15 },
			source: assumption(),
			tolerance: 0.1,
			note: 'A stated assumption: half of composed servicing calls carry one complication (the hand-written kinds), a third carry two, a seventh three. The desk’s five kinds stay as the goldens and as these single-complication rows.'
		}),
		row({
			id: 'servicing-which',
			kind: 'weights',
			title: 'Which complications a servicing case draws from',
			distribution: {
				'address-change': 30,
				bereavement: 15,
				'third-party-access': 15,
				'disclosure-mid-call': 25,
				'caller-not-customer': 15
			},
			source: assumption(),
			tolerance: 0.1,
			note: 'A stated assumption: an address change is the commonest request and a disclosure mid-call the commonest complication on it; a caller who is not the customer is as rare as a bereavement. Drawn without replacement, so a case never carries one twice.'
		})
	]
);

/**
 * A desk's complications for a case, drawn from the case's own random stream
 * (WP173): the count from the desk's `-count` row, then that many distinct ids
 * from its `-which` row, without replacement, in the table's own order so the
 * set is the same however it is read. A count above the ids on offer is the
 * ids on offer. Deterministic in `random`.
 */
export function drawComplications(
	random: () => number,
	desk: string,
	source: CalibrationTable = COMPLICATIONS
): string[] {
	const pick = (id: string): Record<string, number> => {
		const found = source.rows.find((entry) => entry.id === id);
		if (!found) throw new Error(`calibration table "${source.id}" has no row "${id}"`);
		return found.distribution;
	};
	const weighted = (weights: Record<string, number>): string => {
		const entries = Object.entries(weights);
		const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
		let roll = random() * total;
		for (const [key, weight] of entries) {
			roll -= weight;
			if (roll < 0) return key;
		}
		return entries[entries.length - 1]![0];
	};
	const remaining = { ...pick(`${desk}-which`) };
	const wanted = Math.min(Number(weighted(pick(`${desk}-count`))), Object.keys(remaining).length);
	const drawn: string[] = [];
	while (drawn.length < wanted) {
		const next = weighted(remaining);
		drawn.push(next);
		delete remaining[next];
	}
	const order = Object.keys(pick(`${desk}-which`));
	return drawn.sort((a, b) => order.indexOf(a) - order.indexOf(b));
}
