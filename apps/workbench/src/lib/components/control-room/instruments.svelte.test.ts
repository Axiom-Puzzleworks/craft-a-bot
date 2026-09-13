import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import CaseFile from './CaseFile.svelte';
import CaseTable from './CaseTable.svelte';
import Lamp from './Lamp.svelte';
import Matrix from './Matrix.svelte';
import Meter from './Meter.svelte';
import Queue from './Queue.svelte';
import Readout from './Readout.svelte';
import Tape from './Tape.svelte';
import Transcript from './Transcript.svelte';

/**
 * The instrument set (WP57 stage B, `44-…` §4.4), each drawn once with the
 * thing it exists to show: a number, a verdict with its glyph, a needle and
 * a gate, a ribbon with a flag, a grid with the value in every cell, a
 * sortable table, and the Desk's three panes with the ids WP53 promised.
 */
describe('Readout', () => {
	it('shows the label, the value, the unit and a delta with its direction spoken', () => {
		render(Readout, {
			label: 'Recall',
			value: 0.94,
			unit: 'of 1',
			delta: { value: '0.02', direction: 'up', good: true },
			testId: 'r'
		});
		expect(screen.getByTestId('r').textContent).toContain('Recall');
		expect(screen.getByTestId('r-value').textContent).toContain('0.94');
		expect(screen.getByTestId('r-delta').getAttribute('data-good')).toBe('true');
		expect(screen.getByTestId('r-delta').textContent).toContain('up');
	});
});

describe('Lamp', () => {
	it('is a glyph and a word, never the disc alone', () => {
		render(Lamp, { status: 'fail', testId: 'l' });
		const lamp = screen.getByTestId('l');
		expect(lamp.getAttribute('data-status')).toBe('fail');
		expect(lamp.textContent).toContain('✕');
		expect(lamp.textContent).toContain('fail');
	});
});

describe('Meter', () => {
	it('points the needle, marks the gate, says whether it passes and describes itself', () => {
		render(Meter, { value: 0.94, gate: 0.9, direction: 'up', label: 'recall', testId: 'm' });
		const meter = screen.getByTestId('m');
		expect(meter.getAttribute('data-passes')).toBe('true');
		expect(screen.getByTestId('m-value').textContent).toBe('0.94');
		expect(screen.getByRole('img').getAttribute('aria-label')).toContain('gate 0.90, passing');
		expect(meter.textContent).toContain('gate ≥ 0.90');
	});

	it('reads a down gate the other way round', () => {
		render(Meter, {
			value: 0.08,
			gate: 0.05,
			direction: 'down',
			label: 'false-freeze',
			testId: 'm'
		});
		expect(screen.getByTestId('m').getAttribute('data-passes')).toBe('false');
		expect(screen.getByTestId('m').textContent).toContain('gate ≤ 0.05');
	});
});

describe('Tape', () => {
	it('draws every series in its lane with a legend, and a flag on the point it names', () => {
		render(Tape, {
			series: [
				{
					id: 'success',
					label: 'success rate',
					lane: 'memory',
					points: [
						{ x: 1, y: 0.5 },
						{ x: 2, y: 0.6 },
						{ x: 3, y: 0.9 }
					]
				}
			],
			flags: [{ seriesId: 'success', x: 3, label: 'drift' }],
			xLabels: { first: '08-17', last: '08-19' },
			testId: 't'
		});
		const tape = screen.getByTestId('t');
		expect(tape.querySelector('polyline[data-series="success"]')).not.toBeNull();
		expect(tape.querySelector('text[data-flag="drift"]')?.textContent).toBe('✕');
		expect(tape.textContent).toContain('📗 success rate');
		expect(tape.textContent).toContain('08-17');
		expect(screen.getByRole('img').getAttribute('aria-label')).toContain('1 flagged');
	});

	it('is a sparkline when compact: no axis, no legend, the same series', () => {
		render(Tape, {
			series: [{ id: 's', label: 's', lane: 'think', points: [{ x: 0, y: 1 }] }],
			compact: true,
			testId: 't'
		});
		const tape = screen.getByTestId('t');
		expect(tape.querySelector('figcaption')).toBeNull();
		expect(tape.querySelector('polyline')).not.toBeNull();
	});
});

describe('Matrix', () => {
	it('puts the value in every cell, fills from the ramp, and sums rows and columns', () => {
		const counts: Record<string, number> = {
			'genuine-released': 412,
			'genuine-held': 14,
			'fraud-released': 9,
			'fraud-held': 151
		};
		render(Matrix, {
			corner: 'truth ＼ decided',
			rows: [
				{ id: 'genuine', label: 'genuine' },
				{ id: 'fraud', label: 'fraud' }
			],
			cols: [
				{ id: 'released', label: 'released' },
				{ id: 'held', label: 'held' }
			],
			cell: (r: string, c: string) => ({
				value: (counts[`${r}-${c}`] ?? 0) / 412,
				label: String(counts[`${r}-${c}`])
			}),
			rowSummary: (r: string) =>
				String((counts[`${r}-released`] ?? 0) + (counts[`${r}-held`] ?? 0)),
			colSummary: (c: string) =>
				String((counts[`genuine-${c}`] ?? 0) + (counts[`fraud-${c}`] ?? 0)),
			testId: 'mx'
		});
		expect(screen.getByTestId('mx-genuine-released').textContent).toContain('412');
		expect(screen.getByTestId('mx-fraud-held').textContent).toContain('151');
		const table = screen.getByTestId('mx');
		expect(table.textContent).toContain('426');
		expect(table.textContent).toContain('165');
		const full = screen.getByTestId('mx-genuine-released').querySelector('.square') as HTMLElement;
		expect(full.style.getPropertyValue('--fill')).toBe('#20514e');
		expect(full.style.getPropertyValue('--label')).toBe('var(--cab-cream)');
	});
});

describe('CaseTable', () => {
	it('lists rows, draws a status column as lamps, and sorts by a column', async () => {
		render(CaseTable, {
			columns: [
				{ id: 'case', label: 'Case' },
				{ id: 'cost', label: 'Cost', kind: 'number' },
				{ id: 'verdict', label: 'Verdict', kind: 'status' }
			],
			rows: [
				{ id: 'a', cells: { case: 'a', cost: 3, verdict: 'pass' } },
				{ id: 'b', cells: { case: 'b', cost: 1, verdict: 'fail' } }
			],
			testId: 'ct'
		});
		expect(screen.getByTestId('ct-row-b').textContent).toContain('✕');
		const header = screen.getByRole('button', { name: /Cost/ });
		header.click();
		await Promise.resolve();
		const rows = screen.getByTestId('ct').querySelectorAll('tbody tr');
		expect(rows[0]?.getAttribute('data-testid')).toBe('ct-row-b');
	});
});

describe('the Desk’s three panes', () => {
	it('Transcript keeps desk-line ids and draws each speaker in its lane with a glyph', () => {
		render(Transcript, {
			lines: [
				{ seq: 1, tick: 1, speaker: 'agent', speakerName: 'You', text: 'Hello.' },
				{ seq: 2, tick: 1, speaker: 'counterpart', speakerName: '', text: 'Hi.', channel: 'phone' },
				{ seq: 3, tick: 2, speaker: 'system', speakerName: 'Desk', text: 'Signed in.' }
			]
		});
		expect(screen.getByTestId('desk-line-1').getAttribute('data-speaker')).toBe('agent');
		expect(screen.getByTestId('desk-line-1').textContent).toContain('▶');
		expect(screen.getByTestId('desk-line-2').textContent).toContain('Visitor');
		expect(screen.getByTestId('desk-line-2').textContent).toContain('on phone');
		expect(screen.getByTestId('desk-line-3').textContent).toContain('•');
		expect(screen.getByRole('log')).not.toBeNull();
	});

	it('Transcript marks an agent line a guard redacted, and no other (WP96)', () => {
		render(Transcript, {
			lines: [
				{ seq: 1, tick: 1, speaker: 'agent', speakerName: 'You', text: 'the card is [redacted]' },
				{ seq: 2, tick: 1, speaker: 'counterpart', speakerName: '', text: 'Thanks.' },
				{ seq: 3, tick: 2, speaker: 'agent', speakerName: 'You', text: 'Anything else?' }
			],
			marks: new Map([
				[
					1,
					{
						guardrailId: 'workshop/guard:decision',
						finding: { category: 'sensitive-data', label: 'pan' }
					}
				]
			])
		});
		expect(screen.getByTestId('desk-line-1-redacted').textContent).toContain(
			'redacted by workshop/guard:decision · pan'
		);
		expect(screen.queryByTestId('desk-line-2-redacted')).toBeNull();
		expect(screen.queryByTestId('desk-line-3-redacted')).toBeNull();
	});

	it('CaseFile keeps desk-record ids, badges classification, and shows truth only when given', () => {
		const { unmount } = render(CaseFile, {
			records: [
				{
					id: 'v',
					kind: 'visitor',
					title: 'Visitor',
					classification: 'personal',
					fields: { name: 'A' }
				}
			]
		});
		expect(screen.getByTestId('desk-record-v').textContent).toContain('personal');
		expect(screen.queryByTestId('desk-truth')).toBeNull();
		unmount();
		render(CaseFile, {
			records: [],
			truth: [{ id: 'label', kind: 'truth', title: 'Label', fields: { fraud: true } }]
		});
		expect(screen.getByTestId('desk-truth').textContent).toContain('what was actually so');
		expect(screen.getByTestId('desk-truth-label').textContent).toContain('true');
	});

	it('Queue keeps desk-queue ids and lamps each status', () => {
		render(Queue, {
			items: [
				{ id: 'j', title: 'Job', status: 'decided', decision: 'Done', recordIds: ['v'] },
				{ id: 'k', title: 'Other', status: 'escalated', recordIds: [] }
			]
		});
		expect(screen.getByTestId('desk-queue-j').getAttribute('data-status')).toBe('decided');
		expect(screen.getByTestId('desk-queue-j').textContent).toContain('✓');
		expect(screen.getByTestId('desk-queue-j').textContent).toContain('about v');
		expect(screen.getByTestId('desk-queue-k').textContent).toContain('?');
	});
});

describe('Strip with an icon (WP73)', () => {
	it('draws the roundel before the label, hidden from a reader, and none without one', async () => {
		const Strip = (await import('./Strip.svelte')).default;
		const { unmount } = render(Strip, {
			props: { label: 'A case', icon: 'desk', children: (() => {}) as never }
		});
		const roundel = screen.getByTestId('roundel-desk');
		expect(roundel.getAttribute('aria-hidden')).toBe('true');
		expect(roundel.querySelector('svg [data-part="glyph"]')).not.toBeNull();
		expect(screen.getByText('A case')).toBeTruthy();
		unmount();
		render(Strip, { props: { label: 'Plain', children: (() => {}) as never } });
		expect(screen.queryByTestId(/roundel-/)).toBeNull();
	});
});

describe('Tape (WP109): the reference band', () => {
	it('draws the interval as a region behind the hairline, inside the plot, and says so', () => {
		const { container } = render(Tape, {
			series: [
				{
					id: 'rate',
					label: 'approval rate',
					lane: 'guardrail',
					points: [
						{ x: 0, y: 0.4 },
						{ x: 1, y: 0.6 },
						{ x: 2, y: 0.5 }
					]
				}
			],
			reference: { y: 0.5, label: 'over the window', band: { low: 0.45, high: 0.55 } },
			testId: 'tape-band'
		});
		const band = container.querySelector('rect.band');
		const hairline = container.querySelector('line.reference');
		expect(band).not.toBeNull();
		expect(hairline).not.toBeNull();
		const y = Number(band?.getAttribute('y'));
		const height = Number(band?.getAttribute('height'));
		const line = Number(hairline?.getAttribute('y1'));
		expect(height).toBeGreaterThan(0);
		expect(line).toBeGreaterThanOrEqual(y);
		expect(line).toBeLessThanOrEqual(y + height);
		expect(container.querySelector('svg')?.getAttribute('aria-label')).toContain(
			'band 0.45 to 0.55'
		);
	});

	it('draws no band without one', () => {
		const { container } = render(Tape, {
			series: [{ id: 'a', label: 'a', lane: 'action', points: [{ x: 0, y: 1 }] }],
			reference: { y: 1, label: 'ref' },
			testId: 'tape-plain'
		});
		expect(container.querySelector('rect.band')).toBeNull();
		expect(container.querySelector('line.reference')).not.toBeNull();
	});
});
