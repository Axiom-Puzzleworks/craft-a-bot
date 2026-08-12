/**
 * Windowing maths for the Flight Recorder.
 *
 * `01-ARCHITECTURE.md` §8 sets the bar: 10,000 events per run with no UI
 * degradation. Rendering 10,000 rows would miss it by orders of magnitude, so
 * only the visible slice is in the DOM.
 *
 * Hand-rolled rather than a library (`05-TECH-STACK.md` §9: small and boring on
 * purpose) — with fixed row heights this is about twenty lines of arithmetic,
 * and keeping it pure means the 10,000-row behaviour can be proven in a unit
 * test rather than eyeballed in a browser.
 */

export interface Window {
	/** First index to render. */
	start: number;
	/** One past the last index to render. */
	end: number;
	/** Pixels of spacer above the rendered slice. */
	paddingTop: number;
	/** Pixels of spacer below it. */
	paddingBottom: number;
}

export interface WindowInput {
	itemCount: number;
	rowHeight: number;
	/** Height of the scrolling viewport. */
	viewportHeight: number;
	scrollTop: number;
	/**
	 * Rows rendered beyond each edge, so a fast scroll does not show blank space
	 * before the next frame lands.
	 */
	overscan?: number;
}

export const DEFAULT_OVERSCAN = 6;

export function computeWindow(input: WindowInput): Window {
	const { itemCount, rowHeight, viewportHeight } = input;
	const overscan = input.overscan ?? DEFAULT_OVERSCAN;

	if (itemCount <= 0 || rowHeight <= 0) {
		return { start: 0, end: 0, paddingTop: 0, paddingBottom: 0 };
	}

	const scrollTop = clamp(input.scrollTop, 0, Math.max(0, itemCount * rowHeight - viewportHeight));
	const firstVisible = Math.floor(scrollTop / rowHeight);
	const visibleCount = Math.ceil(viewportHeight / rowHeight) + 1;

	const start = Math.max(0, firstVisible - overscan);
	const end = Math.min(itemCount, firstVisible + visibleCount + overscan);

	return {
		start,
		end,
		paddingTop: start * rowHeight,
		paddingBottom: Math.max(0, (itemCount - end) * rowHeight)
	};
}

/** Total scrollable height, so the scrollbar reflects the whole list. */
export function totalHeight(itemCount: number, rowHeight: number): number {
	return Math.max(0, itemCount * rowHeight);
}

/** Scroll offset that brings an index to the bottom of the viewport — "jump to now". */
export function scrollToIndex(
	index: number,
	rowHeight: number,
	viewportHeight: number,
	itemCount: number
): number {
	const bottom = (index + 1) * rowHeight;
	return clamp(bottom - viewportHeight, 0, Math.max(0, itemCount * rowHeight - viewportHeight));
}

/** Whether the viewport is close enough to the end to keep auto-following (03 §5.2). */
export function isNearBottom(
	scrollTop: number,
	viewportHeight: number,
	itemCount: number,
	rowHeight: number,
	slackRows = 2
): boolean {
	const distanceFromBottom = itemCount * rowHeight - (scrollTop + viewportHeight);
	return distanceFromBottom <= slackRows * rowHeight;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}
