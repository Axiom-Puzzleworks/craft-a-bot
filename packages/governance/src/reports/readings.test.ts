import type {
	CalibrationTable,
	ControlMap,
	DomainSpec,
	Review,
	ReviewSubject
} from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { GUARDRAIL_CATALOGUE } from '../catalogue/entries.js';
import {
	blueprintItems,
	readingProgress,
	readingQueue,
	readingSubjects,
	knobChangesIn,
	readingsExport,
	renderReadingsMarkdown
} from './readings.js';

const TABLE: CalibrationTable = {
	id: 'demo/calibration',
	title: 'Demo',
	description: 'Two rows, one read.',
	rows: [
		{
			id: 'age',
			kind: 'weights',
			title: 'Age band',
			distribution: { young: 1, old: 2 },
			source: { kind: 'assumption', retrieved: '2026-09-30' },
			note: 'Stated.',
			tolerance: 0.05,
			review: 'pending'
		},
		{
			id: 'income',
			kind: 'rates',
			title: 'Income',
			distribution: { low: 0.2, high: 0.1 },
			source: {
				kind: 'publication',
				publisher: 'A synthetic office',
				title: 'A survey',
				edition: '2026',
				table: 'T1',
				retrieved: '2026-09-30'
			},
			tolerance: 0.05,
			review: { by: 'a reader', on: '2026-09-30' }
		}
	]
};
const MAP: ControlMap = {
	id: 'demo/control-map',
	title: 'Demo map',
	description: 'One reviewed row, one not.',
	rows: [
		{
			framework: 'fca',
			ref: 'a',
			title: 'A',
			obligation: 'Do A.',
			evidence: [],
			tags: [],
			status: 'pending',
			note: 'later'
		},
		{
			framework: 'fca',
			ref: 'b',
			title: 'B',
			obligation: 'Do B.',
			evidence: [{ kind: 'artefact', id: 'trace-bundle' }],
			tags: []
		}
	]
};
const DOMAIN = {
	id: 'demo/domain',
	name: 'Demo domain',
	decisionRights: [
		{ kind: 'approve', ceiling: 3, why: 'Because.', source: { title: 'A rulebook' } }
	]
} as unknown as DomainSpec;
const NOTE = `# A note

- [ ] 0 — the spec validates.
- [x] 1 — the packs.
- [ ] the golden run per journey.
`;

const reading = (
	subject: ReviewSubject,
	verdict: Review['verdict'],
	extra: Partial<Review> = {}
): Review => ({
	id: `local/reviews/${subject.kind}`,
	subject,
	verdict,
	by: { kind: 'person', id: 'andrew', name: 'Andrew' },
	on: '2026-09-30T10:00:00.000Z',
	schemaVersion: 1,
	...(verdict === 'rejected' ? { note: 'Not what the source says.' } : {}),
	...extra
});

describe('the reading desk’s fold (WP129, 108-READINGS.md §3)', () => {
	it('parses a blueprint note’s boxes: numbered, ticked, and the unnumbered as tests', () => {
		expect(blueprintItems(NOTE)).toEqual([
			{ id: '0', text: '0 — the spec validates.', checked: false },
			{ id: '1', text: '1 — the packs.', checked: true },
			{ id: 'tests', text: 'the golden run per journey.', checked: false }
		]);
		expect(blueprintItems('- [ ] a\n- [ ] b').map((item) => item.id)).toEqual(['tests', 'tests-2']);
	});

	it('lists only what ships pending, in the kinds’ order, with its source beside it', () => {
		const subjects = readingSubjects({
			reviewerModels: [
				{
					id: 'demo/reviewer',
					name: 'A reviewer',
					description: 'Reads cases.',
					accuracy: { table: 'demo/calibration', row: 'income', key: 'low' },
					automationBias: { table: 'demo/calibration', row: 'income', key: 'high' },
					secondsPerCase: { table: 'demo/calibration', row: 'age', key: 'young' }
				}
			],
			calibrations: [TABLE],
			controlMaps: [MAP],
			domains: [DOMAIN],
			blueprints: [{ id: 'demo', title: 'The demo note', markdown: NOTE }],
			screeningLists: [
				{ id: 'demo/screening#sanctions', title: 'Sanctions', entries: ['Orrin Vasquenholt, 1971'] }
			],
			errorModels: [
				{
					id: 'demo/error',
					name: 'An error model',
					description: 'Wrong sometimes.',
					faults: [
						{
							action: 'decide',
							field: 'outcome',
							options: ['approve', 'decline'],
							rate: { table: 'demo/calibration', row: 'income', key: 'low' },
							direction: { toward: 'approve' }
						}
					]
				}
			]
		});
		expect(subjects.map((subject) => `${subject.subject.kind} ${subject.subject.id}`)).toEqual([
			'calibration-row demo/calibration#age',
			'control-row demo/control-map#a',
			'decision-right demo/domain#approve',
			'blueprint-item demo#0',
			'blueprint-item demo#tests',
			'screening-list demo/screening#sanctions',
			'error-model demo/error',
			'reviewer-model demo/reviewer'
		]);
		expect(subjects[0]!.source).toContainEqual({ label: 'Weights', value: 'young 1 · old 2' });
		expect(subjects[2]!.source).toContainEqual({ label: 'Ceiling', value: 'Level 3' });
		expect(subjects[6]!.source).toContainEqual({
			label: 'Corrupts',
			value: 'decide.outcome among approve, decline, toward approve'
		});
		expect(subjects[5]!.group).toBe('demo/screening');
	});

	it('counts the catalogue’s pending entries as the catalogue says them', () => {
		const pending = GUARDRAIL_CATALOGUE.entries.filter((entry) => entry.review === 'pending');
		expect(readingSubjects({ catalogue: GUARDRAIL_CATALOGUE })).toHaveLength(pending.length);
		expect(pending.length).toBeGreaterThan(0);
	});

	it('gives each subject its latest reading, and the readouts count read, amended, rejected and open', () => {
		const subjects = readingSubjects({
			calibrations: [TABLE],
			controlMaps: [MAP],
			domains: [DOMAIN]
		});
		const queue = readingQueue(subjects, [
			reading({ kind: 'calibration-row', id: 'demo/calibration#age' }, 'amended', {
				amendment: { field: 'distribution.young', value: 1.5 }
			}),
			reading({ kind: 'control-row', id: 'demo/control-map#a' }, 'rejected'),
			reading({ kind: 'decision-right', id: 'demo/domain#elsewhere' }, 'accepted')
		]);
		expect(queue.map((item) => item.state)).toEqual(['amended', 'rejected', 'unread']);
		const progress = readingProgress(queue);
		// Nine kinds since WP147 added knob changes.
		expect(progress).toHaveLength(9);
		expect(progress.slice(1, 4)).toEqual([
			{ kind: 'calibration-row', total: 1, read: 1, amended: 1, rejected: 0, open: 0 },
			{ kind: 'control-row', total: 1, read: 0, amended: 0, rejected: 1, open: 1 },
			{ kind: 'decision-right', total: 1, read: 0, amended: 0, rejected: 0, open: 1 }
		]);
		const markdown = renderReadingsMarkdown(readingsExport(queue, '2026-09-30T12:00:00.000Z'));
		expect(markdown).toContain(
			'- `calibration-row` `demo/calibration#age`: set `distribution.young` to `1.5` — Andrew, 2026-09-30'
		);
		expect(markdown).toContain(
			'- `control-row` `demo/control-map#a`: Not what the source says. — Andrew, 2026-09-30'
		);
		expect(markdown).toContain('## Unread (1)');
		expect(markdown).toContain('| Decision rights | 0 | 1 | 0 | 0 | 1 |');
	});
});

describe('knob changes (WP147)', () => {
	it('reads a campaign build’s knob overrides and an experiment’s non-baseline knob levels', () => {
		const changes = knobChangesIn([
			{
				kind: 'campaign',
				id: 'lending-sweep',
				file: { builds: [{ id: 'strict', overrides: { knobs: { referRatioPercent: 45 } } }] }
			},
			{
				kind: 'experiment',
				id: 'lending-knobs',
				file: {
					design: {
						factors: [{ axis: 'knob', knob: 'referRatioPercent', levels: ['60', '45'] }],
						baseline: { knob: '60' }
					}
				}
			},
			{ kind: 'campaign', id: 'plain', file: { builds: [{ id: 'b' }] } }
		]);
		expect(changes).toEqual([
			{
				in: { kind: 'campaign', id: 'lending-sweep' },
				at: 'strict',
				knob: 'referRatioPercent',
				value: '45'
			},
			{
				in: { kind: 'experiment', id: 'lending-knobs' },
				at: 'level 45',
				knob: 'referRatioPercent',
				value: '45'
			}
		]);
		const subjects = readingSubjects({ knobChanges: changes });
		expect(subjects.map((subject) => subject.subject)).toEqual([
			{ kind: 'knob-change', id: 'campaign:lending-sweep#strict#referRatioPercent' },
			{ kind: 'knob-change', id: 'experiment:lending-knobs#level 45#referRatioPercent' }
		]);
	});
});
