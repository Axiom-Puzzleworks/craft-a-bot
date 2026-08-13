import { describe, expect, it } from 'vitest';
import {
	SNAP_RADIUS,
	centreOf,
	contains,
	distance,
	distanceToRect,
	findHoveredSocket,
	findSnapTarget,
	nextIndex,
	type SocketBounds
} from './geometry.js';

function socket(
	slot: SocketBounds['slot'],
	left: number,
	top: number,
	w = 100,
	h = 40
): SocketBounds {
	return { slot, rect: { left, top, right: left + w, bottom: top + h } };
}

describe('basic geometry', () => {
	it('finds a rectangle centre', () => {
		expect(centreOf({ left: 0, top: 0, right: 100, bottom: 40 })).toEqual({ x: 50, y: 20 });
	});

	it('measures point-to-point distance', () => {
		expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
	});

	it('knows what is inside a rectangle, edges included', () => {
		const rect = { left: 0, top: 0, right: 10, bottom: 10 };
		expect(contains(rect, { x: 5, y: 5 })).toBe(true);
		expect(contains(rect, { x: 0, y: 0 })).toBe(true);
		expect(contains(rect, { x: 11, y: 5 })).toBe(false);
		expect(contains(rect, { x: 5, y: -1 })).toBe(false);
	});

	it('measures distance to a rectangle as zero when inside', () => {
		const rect = { left: 0, top: 0, right: 10, bottom: 10 };
		expect(distanceToRect(rect, { x: 5, y: 5 })).toBe(0);
		expect(distanceToRect(rect, { x: 13, y: 5 })).toBe(3);
		expect(distanceToRect(rect, { x: 5, y: -4 })).toBe(4);
		expect(distanceToRect(rect, { x: 13, y: 14 })).toBe(5); // diagonal
	});
});

describe('findSnapTarget', () => {
	const sockets = [socket('brain', 0, 0), socket('memory', 0, 200), socket('mobility', 0, 400)];

	it('snaps to the matching socket when the pointer is inside it', () => {
		expect(findSnapTarget(sockets, 'brain', { x: 50, y: 20 })?.slot).toBe('brain');
	});

	it('snaps from just outside, within the radius', () => {
		expect(findSnapTarget(sockets, 'brain', { x: 50, y: 40 + SNAP_RADIUS - 1 })?.slot).toBe(
			'brain'
		);
	});

	it('does not snap from beyond the radius', () => {
		expect(findSnapTarget(sockets, 'brain', { x: 50, y: 40 + SNAP_RADIUS + 1 })).toBeUndefined();
	});

	it('never snaps a brick into a socket it does not belong in, however close', () => {
		// Dead centre of the memory socket, carrying a brain brick.
		expect(findSnapTarget(sockets, 'brain', { x: 50, y: 220 })).toBeUndefined();
	});

	it('picks the nearest when two sockets of the same family are in range', () => {
		const pair = [socket('brain', 0, 0), socket('brain', 0, 60)];
		expect(findSnapTarget(pair, 'brain', { x: 50, y: 55 })?.rect.top).toBe(60);
	});

	it('is deterministic when two are equally near — first registered wins', () => {
		const pair = [socket('brain', 0, 0), socket('brain', 0, 100)];
		// Exactly 30 from the bottom of the first and the top of the second.
		const found = findSnapTarget(pair, 'brain', { x: 50, y: 70 }, 40);
		expect(found?.rect.top).toBe(0);
	});

	it('finds nothing among an empty set', () => {
		expect(findSnapTarget([], 'brain', { x: 0, y: 0 })).toBeUndefined();
	});
});

describe('findHoveredSocket', () => {
	it('reports the socket under the pointer regardless of what fits, for the head-shake', () => {
		const sockets = [socket('brain', 0, 0), socket('memory', 0, 200)];
		expect(findHoveredSocket(sockets, { x: 50, y: 220 })?.slot).toBe('memory');
	});

	it('reports nothing over bare baseplate', () => {
		expect(findHoveredSocket([socket('brain', 0, 0)], { x: 500, y: 500 })).toBeUndefined();
	});
});

describe('nextIndex', () => {
	it('walks forwards and wraps', () => {
		expect(nextIndex(0, 3, 1)).toBe(1);
		expect(nextIndex(2, 3, 1)).toBe(0);
	});

	it('walks backwards and wraps', () => {
		expect(nextIndex(0, 3, -1)).toBe(2);
		expect(nextIndex(2, 3, -1)).toBe(1);
	});

	it('copes with nothing to walk through', () => {
		expect(nextIndex(0, 0, 1)).toBe(0);
	});
});
