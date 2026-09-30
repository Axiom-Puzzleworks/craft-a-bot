import {
	ATTACK_KINDS,
	latestMeasurement,
	type BenchmarkRate,
	type BenchmarkReport,
	type BenchmarkSubjectResult
} from '@craftabot/core';
import type { MatrixCell } from '$lib/components/control-room/Matrix.svelte';

/**
 * **The Benchmarks page's fold** (WP123, `106-BENCHMARK.md` §6): a report's
 * subjects as the table reads them, recall by attack kind as a Matrix and
 * as its twin in words, and the Guard Rack's word for a service — the latest
 * measurement, or *unmeasured*. Every number is the report's own; this file
 * words and arranges them.
 */
export const pct = (rate: BenchmarkRate): string =>
	rate.value === null ? '—' : `${Math.round(rate.value * 100)}%`;

export const band = (rate: BenchmarkRate): string =>
	rate.interval === null
		? ''
		: `${Math.round(rate.interval[0] * 100)}–${Math.round(rate.interval[1] * 100)}%`;

/** How a subject answered, in the page's words. */
export function howWord(subject: BenchmarkSubjectResult): string {
	if (!subject.applicable) return 'not applicable';
	switch (subject.mode) {
		case 'stand-in':
			return 'stand-in — unmeasured';
		case 'cassette':
			return 'from its cassette';
		case 'live':
			return 'live';
		default:
			return 'local';
	}
}

/** Whether the subject's numbers are a measurement: applicable, and not a stand-in's canned clean. */
export function measures(subject: BenchmarkSubjectResult): boolean {
	return subject.applicable && subject.mode !== 'stand-in';
}

const KINDS = ATTACK_KINDS.filter((kind) => kind !== 'none');

/** Recall by attack kind, a row per measured subject; the benign column is its false alarms. */
export function recallMatrix(report: BenchmarkReport): {
	rows: { id: string; label: string }[];
	cols: { id: string; label: string }[];
	cell: (rowId: string, colId: string) => MatrixCell | undefined;
} {
	const measured = report.subjects.filter(measures);
	return {
		rows: measured.map((subject) => ({ id: subject.id, label: subject.id })),
		cols: [
			...KINDS.map((kind) => ({ id: kind, label: kind })),
			{ id: 'none', label: 'benign (false alarms)' }
		],
		cell: (rowId, colId) => {
			const slice = measured.find((subject) => subject.id === rowId)?.byAttack[colId];
			if (!slice || slice.rows === 0) return undefined;
			return {
				value: slice.flagged / slice.rows,
				label: `${Math.round((slice.flagged / slice.rows) * 100)}%`,
				note: `${slice.flagged} of ${slice.rows}`
			};
		}
	};
}

/** The Matrix in sentences, one per measured subject — its twin for a reader. */
export function recallTwin(report: BenchmarkReport): string[] {
	return report.subjects.filter(measures).map((subject) => {
		const kinds = KINDS.map((kind) => {
			const slice = subject.byAttack[kind];
			return `${kind} ${slice?.flagged ?? 0} of ${slice?.rows ?? 0}`;
		}).join(', ');
		const benign = subject.byAttack.none;
		return `${subject.id} flagged ${kinds}; and ${benign?.flagged ?? 0} of ${benign?.rows ?? 0} benign rows.`;
	});
}

/** The Guard Rack's word for a service: the latest measurement, or *unmeasured*. */
export function rackMeasurement(
	reports: readonly BenchmarkReport[],
	serviceId: string
): { word: string; detail: string; measured: boolean } {
	const found = latestMeasurement(reports, serviceId);
	if (!found)
		return {
			word: 'unmeasured',
			detail: 'No benchmark has measured it: a stand-in answers clean whatever it is shown.',
			measured: false
		};
	const { subject, report } = found;
	return {
		word: `recall ${pct(subject.recall)} · precision ${pct(subject.precision)}`,
		detail: `${report.benchmarkId}, ${report.ranAt.slice(0, 10)}, ${howWord(subject)} — synthetic rows`,
		measured: true
	};
}
