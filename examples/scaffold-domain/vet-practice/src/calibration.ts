import type { CalibrationTable } from '@craftabot/core';

/**
 * **The calibration table** — every row a *stated assumption* the scaffold
 * wrote, `review: 'pending'`. The first thing a domain author does is
 * replace a row's source with a publication and say what was simplified.
 * `checkDomainPack` passes this table (it validates, and every row states
 * why); `checkCalibration({ requireReview: true })` fails it until a reader
 * has read each row against its source — which is the point.
 */
export const CALIBRATION: CalibrationTable = {
	id: 'vet-practice/calibration',
	title: 'Where this vet-practice takes its shape from',
	description:
		'The distributions the generators draw from. Scaffolded as stated assumptions; cite each row before you trust a number.',
	rows: [
		{
			id: 'band',
			kind: 'weights',
			title: 'The share of patients in each band',
			distribution: { a: 0.5, b: 0.3, c: 0.2 },
			source: { kind: 'assumption', retrieved: '2026-09-12' },
			note: 'A scaffolded assumption: three bands at 50/30/20. Replace with a published distribution and say what was simplified.',
			tolerance: 0.05,
			review: 'pending'
		},
		{
			id: 'journey-incidence',
			kind: 'rates',
			title: 'How often a patient starts a journey in a period',
			distribution: { starts: 0.1 },
			source: { kind: 'assumption', retrieved: '2026-09-12' },
			note: 'A scaffolded assumption: one in ten per period. Replace with a published rate.',
			tolerance: 0.05,
			review: 'pending'
		}
	]
};
