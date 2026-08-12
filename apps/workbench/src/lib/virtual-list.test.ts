import { describe, expect, it } from 'vitest';
import { computeWindow, isNearBottom, scrollToIndex, totalHeight } from './virtual-list.js';

/**
 * `01-ARCHITECTURE.md` §8 asks for 10,000 events without UI degradation, so
 * that number appears here literally rather than as a vague "lots".
 */
const TEN_THOUSAND = 10_000;
const ROW = 28;
const VIEWPORT = 280;

describe('computeWindow', () => {
	it('renders only a small slice of a huge list', () => {
		const window = computeWindow({
			itemCount: TEN_THOUSAND,
			rowHeight: ROW,
			viewportHeight: VIEWPORT,
			scrollTop: 0
		});

		// Ten visible rows plus overscan — nowhere near ten thousand.
		expect(window.end - window.start).toBeLessThan(30);
		expect(window.start).toBe(0);
	});

	it('moves the slice as the viewport scrolls', () => {
		const top = computeWindow({
			itemCount: TEN_THOUSAND,
			rowHeight: ROW,
			viewportHeight: VIEWPORT,
			scrollTop: 0
		});
		const middle = computeWindow({
			itemCount: TEN_THOUSAND,
			rowHeight: ROW,
			viewportHeight: VIEWPORT,
			scrollTop: 5000 * ROW
		});

		expect(middle.start).toBeGreaterThan(top.end);
		expect(middle.end - middle.start).toBeLessThan(30);
	});

	it('keeps the scrollbar honest with padding either side', () => {
		const window = computeWindow({
			itemCount: TEN_THOUSAND,
			rowHeight: ROW,
			viewportHeight: VIEWPORT,
			scrollTop: 5000 * ROW
		});

		expect(window.paddingTop).toBe(window.start * ROW);
		expect(window.paddingTop + (window.end - window.start) * ROW + window.paddingBottom).toBe(
			TEN_THOUSAND * ROW
		);
	});

	it('overscans above and below so a fast scroll shows no blank space', () => {
		const window = computeWindow({
			itemCount: TEN_THOUSAND,
			rowHeight: ROW,
			viewportHeight: VIEWPORT,
			scrollTop: 100 * ROW,
			overscan: 5
		});
		expect(window.start).toBe(95);
	});

	it('never scrolls past the end', () => {
		const window = computeWindow({
			itemCount: 20,
			rowHeight: ROW,
			viewportHeight: VIEWPORT,
			scrollTop: 999_999
		});
		expect(window.end).toBe(20);
		expect(window.paddingBottom).toBe(0);
	});

	it('handles an empty list and a zero row height without dividing by zero', () => {
		expect(
			computeWindow({ itemCount: 0, rowHeight: ROW, viewportHeight: VIEWPORT, scrollTop: 0 })
		).toEqual({ start: 0, end: 0, paddingTop: 0, paddingBottom: 0 });
		expect(
			computeWindow({ itemCount: 10, rowHeight: 0, viewportHeight: VIEWPORT, scrollTop: 0 })
		).toEqual({ start: 0, end: 0, paddingTop: 0, paddingBottom: 0 });
	});

	it('renders the whole list when it fits', () => {
		const window = computeWindow({
			itemCount: 5,
			rowHeight: ROW,
			viewportHeight: VIEWPORT,
			scrollTop: 0
		});
		expect(window).toMatchObject({ start: 0, end: 5, paddingTop: 0, paddingBottom: 0 });
	});
});

describe('totalHeight', () => {
	it('is the full list height, so the scrollbar reflects everything', () => {
		expect(totalHeight(TEN_THOUSAND, ROW)).toBe(280_000);
		expect(totalHeight(0, ROW)).toBe(0);
	});
});

describe('scrollToIndex', () => {
	it('brings a row to the bottom of the viewport', () => {
		expect(scrollToIndex(99, ROW, VIEWPORT, 1000)).toBe(100 * ROW - VIEWPORT);
	});

	it('clamps at both ends', () => {
		expect(scrollToIndex(0, ROW, VIEWPORT, 1000)).toBe(0);
		expect(scrollToIndex(999, ROW, VIEWPORT, 1000)).toBe(1000 * ROW - VIEWPORT);
	});
});

describe('isNearBottom', () => {
	it('is true at the very bottom, so the trace keeps following the run', () => {
		const atBottom = TEN_THOUSAND * ROW - VIEWPORT;
		expect(isNearBottom(atBottom, VIEWPORT, TEN_THOUSAND, ROW)).toBe(true);
	});

	it('is true within the slack, so a nudge does not stop it following', () => {
		const nearBottom = TEN_THOUSAND * ROW - VIEWPORT - ROW;
		expect(isNearBottom(nearBottom, VIEWPORT, TEN_THOUSAND, ROW)).toBe(true);
	});

	it('is false once the user has scrolled away to read something', () => {
		expect(isNearBottom(0, VIEWPORT, TEN_THOUSAND, ROW)).toBe(false);
	});
});
