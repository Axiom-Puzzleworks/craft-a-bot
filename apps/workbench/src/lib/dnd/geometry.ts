import type { BrickKind } from '$lib/bricks.js';

/**
 * The decision-making half of drag and drop, as pure functions.
 *
 * Everything that could be wrong about a drop — which socket accepts this
 * brick, which one is nearest, whether it is close enough to snap — is decided
 * here, with no DOM and no state. That makes the fiddly part unit-testable, and
 * leaves the attachments as thin wiring (05-TECH-STACK.md §5).
 */

/** Proximity snap radius (05 §5). Generous enough to feel magnetic, tight enough to be predictable. */
export const SNAP_RADIUS = 24;

/**
 * How far the pointer must travel before a press becomes a drag.
 *
 * Without this, clicking a fitted brick to open its panel is indistinguishable
 * from dragging it nowhere — which reads as "pull it off the baseplate". Small
 * enough to feel instant, large enough to survive the wobble of a real click.
 */
export const DRAG_THRESHOLD = 5;

export interface Point {
	x: number;
	y: number;
}

export interface SocketBounds {
	kind: BrickKind;
	/** Viewport rectangle, as `getBoundingClientRect()` gives it. */
	rect: { left: number; top: number; right: number; bottom: number };
}

export function centreOf(rect: SocketBounds['rect']): Point {
	return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
}

export function distance(a: Point, b: Point): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

/** True when the point is inside the rectangle. */
export function contains(rect: SocketBounds['rect'], point: Point): boolean {
	return (
		point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
	);
}

/**
 * How far a point is from a rectangle — zero when inside. Used rather than
 * centre-to-centre distance so that a large socket is easy to hit anywhere
 * along its length, which matters for the wide Actions brick.
 */
export function distanceToRect(rect: SocketBounds['rect'], point: Point): number {
	if (contains(rect, point)) return 0;
	const dx = Math.max(rect.left - point.x, 0, point.x - rect.right);
	const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom);
	return Math.hypot(dx, dy);
}

/**
 * The socket a brick would snap into from this pointer position, or undefined.
 *
 * A socket only accepts its own kind — the "piece only fits where it belongs"
 * affordance (03-UI-UX-DESIGN.md §4.2) — so an incompatible socket is never a
 * candidate, however close the pointer is. Ties go to the nearest; equal
 * distances go to the first registered, which keeps the result deterministic.
 */
export function findSnapTarget(
	sockets: readonly SocketBounds[],
	kind: BrickKind,
	point: Point,
	radius = SNAP_RADIUS
): SocketBounds | undefined {
	let best: SocketBounds | undefined;
	let bestDistance = Number.POSITIVE_INFINITY;

	for (const socket of sockets) {
		if (socket.kind !== kind) continue;
		const gap = distanceToRect(socket.rect, point);
		if (gap > radius) continue;
		if (gap < bestDistance) {
			best = socket;
			bestDistance = gap;
		}
	}
	return best;
}

/**
 * The socket the pointer is over regardless of compatibility — so the UI can
 * shake its head at a wrong socket rather than silently ignoring it (03 §4.4).
 */
export function findHoveredSocket(
	sockets: readonly SocketBounds[],
	point: Point
): SocketBounds | undefined {
	return sockets.find((socket) => contains(socket.rect, point));
}

/** Keyboard navigation order through the sockets: the tray order (03 §4.4). */
export function nextIndex(current: number, length: number, step: 1 | -1): number {
	if (length === 0) return 0;
	return (current + step + length) % length;
}
