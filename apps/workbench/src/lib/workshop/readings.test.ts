import { reviewsFromContent } from '@craftabot/core';
import { readingProgress, readingQueue, readingSubjects } from '@craftabot/governance/reports';
import { describe, expect, it } from 'vitest';
import { loadDesks } from '$lib/edition.js';
import { installedPacks } from '$lib/packs.js';
import { BLUEPRINT_NOTES } from './blueprint-notes.js';
import {
	amendmentValue,
	filterQueue,
	readingFilterFrom,
	readingFilterQuery,
	readingSources,
	readingWord,
	reviewFor,
	reviewRecord
} from './readings.js';

const ANDREW = { kind: 'person' as const, id: 'browser-1', name: 'Andrew' };
const NOW = '2026-09-30T12:00:00.000Z';

describe('the reading desk in the Workbench (WP129, 108-READINGS.md §6)', () => {
	it('reads the three blueprint notes as text', () => {
		expect(BLUEPRINT_NOTES.map((note) => note.id)).toEqual([
			'healthcare',
			'logistics',
			'manufacturing'
		]);
		for (const note of BLUEPRINT_NOTES) expect(note.markdown).toMatch(/^- \[ \] 0 — /m);
	});

	it('queues all eight kinds from the edition’s packs, and a reading moves its kind’s readout', async () => {
		await loadDesks();
		const subjects = readingSubjects(readingSources(installedPacks, BLUEPRINT_NOTES));
		const before = readingProgress(readingQueue(subjects, []));
		// Every kind but knob changes, which the Workbench reads from no experiment files (WP147).
		for (const row of before.filter((row) => row.kind !== 'knob-change'))
			expect(row.open, row.kind).toBeGreaterThan(0);
		const first = subjects.find((subject) => subject.subject.kind === 'calibration-row')!;
		const review = reviewFor(first.subject, 'accepted', ANDREW, NOW);
		const reviews = reviewsFromContent([reviewRecord(review)]);
		const after = readingProgress(readingQueue(subjects, reviews));
		const row = (progress: typeof before) => progress.find((r) => r.kind === 'calibration-row')!;
		expect(row(after).read).toBe(row(before).read + 1);
		expect(row(after).open).toBe(row(before).open - 1);
	});

	it('records an amendment with its value as JSON where it parses', () => {
		const subject = { kind: 'decision-right' as const, id: 'fs-bank/uk-retail-banking#x' };
		const amended = reviewFor(subject, 'amended', ANDREW, NOW, { field: 'ceiling', value: '2' });
		expect(amended.amendment).toEqual({ field: 'ceiling', value: 2 });
		expect(amendmentValue('the words')).toBe('the words');
		expect(amendmentValue('["a", 1]')).toEqual(['a', 1]);
		expect(amended.id).toBe('local/reviews/decision-right-fs-bank-uk-retail-banking-x');
		expect(() => reviewFor(subject, 'rejected', ANDREW, NOW)).toThrow(/says why/);
		expect(() => reviewFor(subject, 'amended', ANDREW, NOW, { field: '', value: '2' })).toThrow();
		const [item] = readingQueue([{ subject, title: 'x', group: 'g', source: [] }], [amended]);
		expect(readingWord(item!)).toBe(
			'amended by Andrew (2026-09-30): ceiling → 2 — awaiting the edit'
		);
	});

	it('keeps its filter in the URL, and anything unknown reads as the default', () => {
		const filter = readingFilterFrom(new URLSearchParams('kind=calibration-row&state=unread'));
		expect(filter).toEqual({ kind: 'calibration-row', state: 'unread' });
		expect(readingFilterQuery(filter)).toBe('?kind=calibration-row&state=unread');
		expect(readingFilterFrom(new URLSearchParams('kind=nope&state=maybe'))).toEqual({
			state: 'open'
		});
		expect(readingFilterQuery({ state: 'open' })).toBe('');
		const subject = { kind: 'error-model' as const, id: 'e' };
		const queue = readingQueue(
			[
				{ subject, title: 'e', group: 'g', source: [] },
				{ subject: { kind: 'error-model', id: 'f' }, title: 'f', group: 'g', source: [] }
			],
			[reviewFor(subject, 'rejected', ANDREW, NOW, { note: 'No.' })]
		);
		expect(filterQueue(queue, { state: 'open' })).toHaveLength(2);
		expect(filterQueue(queue, { state: 'rejected' }).map((item) => item.title)).toEqual(['e']);
		expect(filterQueue(queue, { state: 'unread', kind: 'error-model' })).toHaveLength(1);
		expect(filterQueue(queue, { state: 'all', kind: 'catalogue-entry' })).toHaveLength(0);
	});
});
