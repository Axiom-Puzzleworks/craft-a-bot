import type { CalibrationRow, CalibrationSource, CalibrationTable } from '@craftabot/core';

/**
 * Row builders shared by the two tables (WP74, `66-CALIBRATION.md` §4.1):
 * the cited table the population draws from and the design-time weights
 * the decks were built on. Both are content; both are checked; only the
 * first claims to be shaped like anything.
 */
export const RETRIEVED = '2026-09-10';

export const assumption = (): CalibrationSource => ({ kind: 'assumption', retrieved: RETRIEVED });

export const publication = (
	publisher: string,
	title: string,
	edition: string,
	table: string,
	url?: string
): CalibrationSource => ({
	kind: 'publication',
	publisher,
	title,
	edition,
	table,
	...(url ? { url } : {}),
	retrieved: RETRIEVED
});

export interface RowSpec {
	id: string;
	kind: CalibrationRow['kind'];
	title: string;
	distribution: Record<string, number>;
	source: CalibrationSource;
	tolerance: number;
	note?: string;
}

export const row = (spec: RowSpec): CalibrationRow => ({
	id: spec.id,
	kind: spec.kind,
	title: spec.title,
	distribution: spec.distribution,
	source: spec.source,
	...(spec.note !== undefined ? { note: spec.note } : {}),
	tolerance: spec.tolerance,
	review: 'pending'
});

export const table = (
	id: string,
	title: string,
	description: string,
	rows: CalibrationRow[]
): CalibrationTable => ({ id, title, description, rows });

/**
 * The per-draw rate `driversFor` uses for a cited marginal: the generator
 * draws a first driver at `p` and a second at `p / 4` independently, so the
 * share with at least one is `1 − (1 − p)(1 − p / 4)`; this inverts it, and
 * the row's note shows the arithmetic (`66-…` §4.2).
 */
export function perDrawRate(marginal: number): number {
	// p² / 4 − 1.25 p + r = 0, the smaller root.
	return Math.round(((1.25 - Math.sqrt(1.5625 - marginal)) / 0.5) * 10_000) / 10_000;
}

export const impliedMarginal = (perDraw: number): number => 1 - (1 - perDraw) * (1 - perDraw / 4);
