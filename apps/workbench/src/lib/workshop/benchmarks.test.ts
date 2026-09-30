import { makeBenchmarkReport } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { howWord, rackMeasurement, recallMatrix, recallTwin } from './benchmarks.js';

/** The Benchmarks page's fold (WP123, `106-BENCHMARK.md` §6): the words, the Matrix and its twin, the Rack's word. */
const report = makeBenchmarkReport();
const reader = report.subjects[0]!;
const standIn = {
	...reader,
	id: 'geap/model-armor',
	kind: 'service' as const,
	name: 'Model Armor',
	componentId: 'geap/model-armor',
	mode: 'stand-in' as const,
	flagged: 0
};
const both = makeBenchmarkReport({ subjects: [standIn, reader] });

describe('the Benchmarks page’s fold (WP123)', () => {
	it('words a stand-in as unmeasured and a local reader as local', () => {
		expect(howWord(standIn)).toBe('stand-in — unmeasured');
		expect(howWord(reader)).toBe('local');
		expect(howWord({ ...reader, applicable: false })).toBe('not applicable');
	});

	it('draws recall by kind for the measured subjects only, with the Matrix’s twin in words', () => {
		const matrix = recallMatrix(both);
		expect(matrix.rows.map((row) => row.id)).toEqual(['fs-bank/reader/attack-words']);
		expect(matrix.cell('fs-bank/reader/attack-words', 'injection')).toEqual({
			value: 1,
			label: '100%',
			note: '1 of 1'
		});
		expect(matrix.cell('fs-bank/reader/attack-words', 'steer')).toBeUndefined();
		expect(recallTwin(both)).toEqual([
			'fs-bank/reader/attack-words flagged steer 0 of 0, injection 1 of 1, jailbreak 0 of 0, exfiltration 0 of 0, elicitation 0 of 0; and 0 of 1 benign rows.'
		]);
	});

	it('reads the Rack’s word: unmeasured for a stand-in, the numbers for a cassette', () => {
		expect(rackMeasurement([both], 'geap/model-armor')).toMatchObject({
			word: 'unmeasured',
			measured: false
		});
		const recorded = makeBenchmarkReport({
			subjects: [{ ...standIn, mode: 'cassette' }]
		});
		expect(rackMeasurement([both, recorded], 'geap/model-armor')).toEqual({
			word: 'recall 100% · precision 100%',
			detail: 'bank-adversarial, 2026-09-30, from its cassette — synthetic rows',
			measured: true
		});
	});
});
