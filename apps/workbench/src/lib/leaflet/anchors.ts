/**
 * The elements the leaflet is allowed to point at.
 *
 * `03-UI-UX-DESIGN.md` §6: the overlay "points at the real UI (arrow stickers +
 * dimmed background) rather than screenshots". That only works if the thing
 * being pointed at is still there, so the ids live in one list, the markup
 * carries them as `data-tutorial`, and a test asserts every anchor a chapter
 * names exists here. Renaming a component then breaks a test rather than
 * silently leaving an arrow pointing at nothing.
 *
 * These are deliberately separate from `data-testid`. A test id is a promise to
 * the test suite; an anchor is a promise to the user that the arrow means
 * something — and the two should be free to move independently.
 */

export const ANCHORS = {
	// Shelf
	newBot: 'new-bot',

	/*
	 * Bench. The tray anchors are **kind ids** since WP14 slice 4b, because the
	 * tray is filled from the registry and a well is identified by the brick in
	 * it. The names on the left are unchanged, so the chapters that point at them
	 * did not have to move.
	 */
	trayLlm: 'tray-starter/llm',
	trayActions: 'tray-starter/actions',
	traySense: 'tray-starter/sense',
	trayMemory: 'tray-starter/memory',
	trayTools: 'tray-starter/tools',
	traySafety: 'tray-starter/safety',
	baseplate: 'baseplate',
	goalCards: 'goal-cards',
	brickPanel: 'brick-panel',
	goLever: 'go-lever',

	// Playroom
	stepButton: 'step-button',
	thoughtBubble: 'thought-bubble',
	flightRecorder: 'flight-recorder',
	/*
	 * The composed-prompt row itself, not the drawer around it (`16-…` §2.2).
	 * Chapter 2 asks the reader to "read the first prompt" and pointed at the
	 * whole Flight Recorder — a hundred rows, one of which was meant. An arrow
	 * that vague is a worse instruction than no arrow.
	 */
	promptRow: 'prompt-row',
	backToBench: 'back-to-bench'
} as const;

export type AnchorId = (typeof ANCHORS)[keyof typeof ANCHORS];

export const ALL_ANCHORS: readonly AnchorId[] = Object.values(ANCHORS);

export function isAnchor(value: string): value is AnchorId {
	return (ALL_ANCHORS as readonly string[]).includes(value);
}
