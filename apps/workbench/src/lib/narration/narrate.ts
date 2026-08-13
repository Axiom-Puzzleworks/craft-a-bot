import type { EngineEvent } from '@craftabot/core';

/**
 * **The narrated tick model** (`15-…` §3, `16-…` §1.3).
 *
 * A run's events, retold as a handful of picture-beats per turn: *saw →
 * thought → did → what happened*. It exists because the causal chain of a run
 * currently lives in the trace as JSON, and reading load is the ceiling for a
 * five-to-eight-year-old (`16-…` §1.3). A child who cannot read a trace can
 * still read four pictures.
 *
 * Three things consume this and none of them may disagree with the others: the
 * story strip under the world view, the failure narration, and the replay
 * viewer. `15-…` §3 lists it as a *shared foundation* for exactly that reason —
 * and the Workshop's step timeline is meant to be the same spine wearing a
 * different skin, so nothing here is allowed to be cute at the expense of being
 * accurate.
 *
 * **Derived from events alone.** No session state, no world handle, no clock.
 * That is what lets the same function narrate a live run and a stored one, and
 * it is hard rule 3 doing its job: if it is not in an event it did not happen,
 * so if the strip can say it, the trace can prove it.
 *
 * Every beat carries the index of the event it came from, so "see more" can
 * open the Flight Recorder at precisely that moment rather than at the top.
 */

export type BeatKind =
	| 'heard'
	| 'saw'
	| 'thought'
	| 'used'
	| 'did'
	| 'result'
	| 'refused'
	| 'stopped'
	| 'asked'
	| 'ended';

export interface Beat {
	kind: BeatKind;
	/** The picture, for readers who are not reading yet (`16-…` §1.3). */
	icon: string;
	/** One line, in a child's voice. */
	caption: string;
	/** Where in the run's events this came from, so a tap can open the trace there. */
	eventIndex: number;
}

export interface NarratedTick {
	/** The engine's tick number. `0` holds anything before the first turn began. */
	tick: number;
	beats: Beat[];
}

const ICONS: Record<BeatKind, string> = {
	heard: '👂',
	saw: '👀',
	thought: '💭',
	used: '🔧',
	did: '🚗',
	result: '✨',
	refused: '😕',
	stopped: '🛡',
	asked: '🙋',
	ended: '🏁'
};

/**
 * Ends a sentence without doubling up on punctuation somebody else supplied.
 *
 * The ellipsis counts as an ending. Without that, a truncated caption came out
 * as "the she…." — which looked like a bug because it was one.
 */
function sentence(text: string): string {
	const trimmed = text.trim();
	if (trimmed === '') return '';
	return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** Long thoughts become a first line; the trace keeps the whole of it. */
function shorten(text: string, limit = 100): string {
	const clean = text.trim().replace(/\s+/g, ' ');
	if (clean.length <= limit) return clean;
	return `${clean.slice(0, limit - 1).trimEnd()}…`;
}

/**
 * The first thing the world mentions, and no more.
 *
 * The observation summary is written for the *memory window* — WP11 packed it
 * with position and bearings so a bot could navigate from it, and it reads
 * "at column 2, row 5 you could see nothing nearby; your hands were empty; big
 * things: the toy chest to the north…". That is exactly right in a prompt and
 * hopeless on a strip built for a five-year-old, so the strip takes the leading
 * clause. The whole of it is one tap away in the Flight Recorder.
 */
function firstClause(text: string, limit: number): string {
	const clean = text.trim().replace(/\s+/g, ' ');
	const semicolon = clean.indexOf(';');
	const head = semicolon === -1 ? clean : clean.slice(0, semicolon);
	return shorten(head, limit);
}

/** `starter/playroom/pick_up` → "pick up". Wire names are not child-facing. */
function readableName(id: string): string {
	const last = id.slice(id.lastIndexOf('/') + 1);
	return last.replace(/_/g, ' ');
}

const OUTCOME_CAPTIONS: Record<string, string> = {
	SUCCESS: 'It did it!',
	OUT_OF_STEPS: 'It ran out of steps.',
	STOPPED_BY_GUARDRAIL: 'A safety rule stopped the run.',
	STOPPED_BY_USER: 'You stopped the run.',
	ERROR: 'Something went wrong.',
	IN_PROGRESS: 'Still going…'
};

/**
 * The beat a single event becomes, or `undefined` for the events a child does
 * not need to see.
 *
 * Most of the catalogue is deliberately silent here. `prompt.composed`,
 * `think.token`, `memory.updated` and the rest are real and important and in
 * the trace; putting them in the strip would bury the four beats that carry the
 * story. The acceptance criterion is *3–5 beats a tick* (`16-…` §1.3), which is
 * a design constraint, not an accident of what was easy.
 */
function beatFor(event: EngineEvent, eventIndex: number): Beat | undefined {
	const at = (kind: BeatKind, caption: string): Beat | undefined =>
		caption.trim() === '' ? undefined : { kind, icon: ICONS[kind], caption, eventIndex };

	switch (event.type) {
		case 'input.delivered':
			return at('heard', sentence(`You said: “${shorten(event.payload.text, 60)}”`));

		case 'sense': {
			const { summary, text } = event.payload.observation;
			return at('saw', sentence(firstClause(summary ?? text, 80)));
		}

		case 'decision':
			return at('thought', sentence(shorten(event.payload.thought)));

		case 'tool.executed':
			return at(
				'used',
				sentence(
					`Used the ${readableName(event.payload.name)}: ${shorten(String(event.payload.result ?? ''), 60)}`
				)
			);

		case 'action.performed': {
			const name = readableName(event.payload.name);
			const { ok, narration } = event.payload.result;
			// A refusal and a success are the *same event* with a different `ok`,
			// which is why the strip can show the failure at all: the world always
			// says what happened, and 16 §1.2's whole complaint was that nobody was
			// listening.
			return ok
				? at('did', sentence(narration === '' ? `It tried to ${name}` : narration))
				: at('refused', sentence(narration === '' ? `It could not ${name}` : narration));
		}

		case 'guardrail.tripped':
			return at('stopped', sentence(event.payload.reason));

		case 'approval.requested':
			return at('asked', sentence(`It asked before it did anything: ${event.payload.reason}`));

		case 'approval.resolved':
			return at('result', event.payload.approved ? 'You said yes.' : 'You said no.');

		case 'run.finished':
			return at('ended', OUTCOME_CAPTIONS[event.payload.outcome] ?? 'The run ended.');

		default:
			return undefined;
	}
}

/**
 * A run's events as a list of narrated turns.
 *
 * Grouped by the event's own `tick`, not by counting `tick.started`: a stored
 * trace may begin mid-run, and events that happen outside any turn (a run
 * finishing, something said to the bot before it starts) still belong
 * somewhere. Turn 0 is that somewhere.
 */
export function narrate(events: readonly EngineEvent[]): NarratedTick[] {
	const byTick = new Map<number, Beat[]>();
	const order: number[] = [];

	events.forEach((event, eventIndex) => {
		const beat = beatFor(event, eventIndex);
		if (!beat) return;

		const tick = event.tick;
		if (!byTick.has(tick)) {
			byTick.set(tick, []);
			order.push(tick);
		}
		byTick.get(tick)?.push(beat);
	});

	return order.map((tick) => ({ tick, beats: byTick.get(tick) ?? [] }));
}

/** The most recent turn, which is what the strip shows largest. */
export function currentTick(ticks: readonly NarratedTick[]): NarratedTick | undefined {
	return ticks.at(-1);
}
