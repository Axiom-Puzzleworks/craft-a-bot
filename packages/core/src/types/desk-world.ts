import type { GridWorldState } from './grid-world.js';

/**
 * **The shared desk-world shape** (WP53, `43-DESK-WORLDS.md` §4.1) — the
 * minimal vocabulary a *business* world needs to be drawn, beside
 * `GridWorldState`'s vocabulary for a room. A Desk is a transcript, a case
 * file and a queue where the Playroom is a grid with a rug; `DeskView` reads
 * exactly these fields and nothing else.
 *
 * As with the grid, a world's real state is its own: a desk's state is
 * structurally a `DeskWorldState` plus whatever the desk keeps (its clock,
 * the records it has not yet revealed, a counterpart script's cursor), and
 * only the fields below reach a renderer. Nothing here is truth (`41-…`
 * §6.2, WP54): `records` is what the world has *revealed*.
 */

/** UK GDPR's vocabulary, carried on a record so a purpose gate (WP54) and a data-minimisation evaluator (WP60) can read it. */
export type DeskRecordClassification = 'public' | 'personal' | 'special-category';

export type DeskRecord = {
	id: string;
	/** What kind of thing this is — `'customer'`, `'account'`, `'notice'` — used to group the case file. */
	kind: string;
	title: string;
	fields: Record<string, string | number | boolean | null>;
	classification?: DeskRecordClassification;
};

export type DeskTranscriptSpeaker = 'agent' | 'counterpart' | 'system';

export type DeskTranscriptLine = {
	/** Monotonic from 1 within a run — the line's identity for a renderer. */
	seq: number;
	tick: number;
	speaker: DeskTranscriptSpeaker;
	speakerName: string;
	text: string;
	/** A named channel when the line arrived on one (a radio message, a system note). */
	channel?: string;
};

export type DeskQueueStatus = 'open' | 'in-progress' | 'decided' | 'escalated';

export type DeskQueueItem = {
	id: string;
	title: string;
	status: DeskQueueStatus;
	decision?: string;
	/** The records this item is about, by id. */
	recordIds: string[];
};

export type DeskAlertSeverity = 'info' | 'warning' | 'critical';

export type DeskAlert = { id: string; severity: DeskAlertSeverity; text: string; tick: number };

/** What `DeskView` needs to draw a desk (`43-…` §4.1) — nothing more. */
export type DeskWorldState = {
	desk: { title: string; role: string };
	/** What the bot may see, as the world has revealed it. */
	records: DeskRecord[];
	transcript: DeskTranscriptLine[];
	queue: DeskQueueItem[];
	alerts: DeskAlert[];
	activeCaseId?: string;
};

/**
 * The two drawable vocabularies a host knows. A `world.changed` payload is
 * one of these or it is something this build cannot draw; `WorldStage`
 * decides which by shape, through the two guards below, because a stored
 * trace may come from a build that does not install the world (`43-…` §3.3).
 */
export type WorldViewState = GridWorldState | DeskWorldState;

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

/** Structural: a desk has a `desk` block and a `transcript`; a grid has neither. */
export function isDeskWorldState(state: unknown): state is DeskWorldState {
	if (!isObject(state)) return false;
	return (
		isObject(state['desk']) &&
		typeof state['desk']['title'] === 'string' &&
		Array.isArray(state['transcript']) &&
		Array.isArray(state['records']) &&
		Array.isArray(state['queue'])
	);
}

/** Structural: a grid has a `width`, a `height` and a `bot` with a position; a desk has none. */
export function isGridWorldState(state: unknown): state is GridWorldState {
	if (!isObject(state)) return false;
	const bot = state['bot'];
	return (
		typeof state['width'] === 'number' &&
		typeof state['height'] === 'number' &&
		isObject(bot) &&
		isObject(bot['position']) &&
		Array.isArray(state['items'])
	);
}
