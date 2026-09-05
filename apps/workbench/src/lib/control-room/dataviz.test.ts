import { describe, expect, it } from 'vitest';
import {
	DIVERGING,
	LANES,
	SEQUENTIAL_TEAL,
	STATUS,
	arcPath,
	diverging,
	formatCount,
	formatPercent,
	lane,
	needleAngle,
	plot,
	sequential,
	statusOf,
	ticks
} from './dataviz.js';

describe('the ramps', () => {
	it('step through a sequential ramp and reserve the top step for exactly 1', () => {
		expect(sequential(0)).toBe(SEQUENTIAL_TEAL[0]);
		expect(sequential(0.5)).toBe(SEQUENTIAL_TEAL[2]);
		expect(sequential(0.99)).toBe(SEQUENTIAL_TEAL[4]);
		expect(sequential(1)).toBe(SEQUENTIAL_TEAL[5]);
		expect(sequential(Number.NaN)).toBe(SEQUENTIAL_TEAL[0]);
	});

	it('keep the Eval Matrix’s teal ramp byte-identical to what WP23 shipped', () => {
		expect(SEQUENTIAL_TEAL.map((step) => step.fill)).toEqual([
			'#ecf8f7',
			'#c3e7e4',
			'#93cbc7',
			'#63a6a1',
			'#356b67',
			'#20514e'
		]);
	});

	it('centre the diverging ramp on cream', () => {
		expect(diverging(0)).toBe(DIVERGING[3]);
		expect(diverging(-1)).toBe(DIVERGING[0]);
		expect(diverging(1)).toBe(DIVERGING[6]);
		expect(diverging(-5)).toBe(DIVERGING[0]);
	});

	it('never use a brick colour: teal and orange only, the two accent-only tints', () => {
		const brick = [
			'#2456a6',
			'#4e8a3c',
			'#6c4f9e',
			'#5484bb',
			'#c93a2e',
			'#e9b62f',
			'#a8467a',
			'#3f51b5'
		];
		for (const ramp of [SEQUENTIAL_TEAL, DIVERGING]) {
			for (const step of ramp) expect(brick).not.toContain(step.fill);
		}
	});

	it('say whether a label on each step is ink or cream', () => {
		for (const ramp of [SEQUENTIAL_TEAL, DIVERGING]) {
			for (const step of ramp) expect(typeof step.ink).toBe('boolean');
		}
	});
});

describe('lanes and status', () => {
	it('follow the colour law and never travel without a glyph', () => {
		expect(LANES.map((l) => l.id)).toEqual([
			'sense',
			'think',
			'tool',
			'action',
			'memory',
			'guardrail',
			'planner',
			'reflexes',
			'counterpart',
			'system'
		]);
		expect(lane('action').token).toBe('var(--cab-red)');
		expect(lane('counterpart').token).toBe('var(--cab-counterpart)');
		for (const entry of LANES) expect(entry.glyph.length).toBeGreaterThan(0);
		for (const mark of Object.values(STATUS)) expect(mark.glyph.length).toBeGreaterThan(0);
		expect(statusOf('pass').token).toBe('var(--cab-pass)');
		expect(statusOf(undefined).id).toBe('inconclusive');
	});
});

describe('axes and formats', () => {
	it('mark a ruler in 1/2/5 steps', () => {
		expect(ticks(0, 1)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
		expect(ticks(0, 100, 5)).toEqual([0, 20, 40, 60, 80, 100]);
		expect(ticks(3, 3)).toEqual([3]);
		expect(ticks(0, Number.NaN)).toEqual([]);
	});

	it('format honestly', () => {
		expect(formatPercent(0.876)).toBe('88%');
		expect(formatPercent(Number.NaN)).toBe('—');
		expect(formatCount(12345.6)).toBe('12,346');
	});
});

describe('geometry', () => {
	it('plots a series into a box and centres a flat one', () => {
		const box = { width: 100, height: 50, pad: 10 };
		expect(plot([], box)).toBe('');
		expect(
			plot(
				[
					{ x: 0, y: 0 },
					{ x: 1, y: 1 }
				],
				box
			)
		).toBe('10.0,40.0 90.0,10.0');
		expect(
			plot(
				[
					{ x: 0, y: 5 },
					{ x: 1, y: 5 }
				],
				box
			)
		).toBe('10.0,25.0 90.0,25.0');
		expect(plot([{ x: 0, y: 0.5 }], box, { min: 0, max: 1 })).toBe('50.0,25.0');
	});

	it('points the needle and draws the arc', () => {
		expect(needleAngle(0)).toBe(180);
		expect(needleAngle(1)).toBe(0);
		expect(needleAngle(0.5)).toBe(90);
		expect(needleAngle(2)).toBe(0);
		expect(arcPath(60, 60, 50, 180, 0)).toBe('M 10.0 60.0 A 50 50 0 0 1 110.0 60.0');
	});
});
