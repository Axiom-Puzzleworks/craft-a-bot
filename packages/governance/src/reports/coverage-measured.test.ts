import { makeBenchmarkReport } from '@craftabot/core/testing';
import type { BenchmarkReport } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { GUARDRAIL_CATALOGUE } from '../catalogue/index.js';
import { coverageMeasurements, coverageSummary } from './coverage.js';

/**
 * **The catalogue's `measured`** (WP123, `106-BENCHMARK.md` §6): an entry is
 * measured by the latest benchmark that answered one of its components from a
 * cassette or live — never from a stand-in, which answers clean whatever it
 * is shown — and the summary carries the list only when it was given reports.
 */
function reportWith(mode: 'stand-in' | 'cassette', ranAt: string, recall: number): BenchmarkReport {
	const base = makeBenchmarkReport({ ranAt });
	const subject = {
		...base.subjects[0]!,
		id: 'lakera-guard/guard',
		kind: 'service' as const,
		name: 'Lakera Guard',
		componentId: 'lakera-guard/guard',
		mode,
		recall: { value: recall, interval: [0, 1] as [number, number] }
	};
	return makeBenchmarkReport({ ranAt, subjects: [subject] });
}

describe('the catalogue measured (WP123)', () => {
	it('reads the latest cassette measurement of an entry’s component, and never a stand-in', () => {
		const older = reportWith('cassette', '2026-09-01T10:00:00.000Z', 0.4);
		const newer = reportWith('cassette', '2026-09-20T10:00:00.000Z', 0.6);
		const standIn = reportWith('stand-in', '2026-09-29T10:00:00.000Z', 0);
		const measured = coverageMeasurements(GUARDRAIL_CATALOGUE, [older, standIn, newer]);
		expect(measured).toEqual([
			{
				entryId: 'prompt-injection-classifier',
				entry: GUARDRAIL_CATALOGUE.entries.find((e) => e.id === 'prompt-injection-classifier')!
					.name,
				subjectId: 'lakera-guard/guard',
				benchmarkId: 'bank-adversarial',
				on: '2026-09-20T10:00:00.000Z',
				recall: 0.6,
				precision: 1
			}
		]);
		expect(coverageMeasurements(GUARDRAIL_CATALOGUE, [standIn])).toEqual([]);
	});

	it('adds measured to the summary only when given reports, so a pack without them is unchanged', () => {
		expect(coverageSummary(GUARDRAIL_CATALOGUE)).not.toHaveProperty('measured');
		expect(coverageSummary(GUARDRAIL_CATALOGUE, [])).not.toHaveProperty('measured');
		expect(
			coverageSummary(GUARDRAIL_CATALOGUE, [reportWith('stand-in', '2026-09-29T10:00:00.000Z', 0)])
				.measured
		).toEqual([]);
	});
});
