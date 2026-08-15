import type { EngineEvent } from '@craftabot/core';

/**
 * **What the Playroom should be showing right now** (`20-…` §5.4).
 *
 * Five effects were designed against and never drawn: WP16 §1.2 asked for a
 * puff on every refused action, §2.1 for the "SAFETY FIRST" stamp on a denial,
 * §2.3 for confetti on success. The logic shipped without them and both
 * sections say so in as many words. The art landed in WP18; this is the half
 * that decides when to draw it.
 *
 * **Derived from the events and from nothing else.** Same discipline as
 * `botExpression`: hard rule 3 says anything the UI shows about engine
 * behaviour arrives as a typed event, and an effect is very much something the
 * UI shows about engine behaviour. It also means the replay screen gets the
 * effects for free and cannot disagree with the live run about them — both fold
 * the same list.
 */
export type FxCue = 'denied' | 'puzzled' | 'celebrating' | 'sleeping' | 'sparkle';

export interface FxBeat {
	cue: FxCue;
	/**
	 * Which event raised it. Not shown anywhere — it is the identity of *this*
	 * occurrence, so that two refusals in a row are two puffs rather than one
	 * that never re-plays. A component keyed on the cue alone would animate the
	 * first and sit still for the second.
	 */
	at: number;
}

/**
 * The latest beat worth a picture, or nothing.
 *
 * **Read backwards, stopping at the first thing that matters.** An effect is
 * about the most recent event, not about a flag that stays true — a guardrail
 * that blocks one action and lets the run continue should stamp that action and
 * then get out of the way, and a scan from the end gives that for free. A
 * forward pass would need to know when to clear each one, which is four
 * clearing rules and a bug for every rule missed.
 *
 * `think.started` is the floor: once the bot is thinking about its next move,
 * whatever happened last turn has had its moment.
 */
export function fxCue(events: readonly EngineEvent[]): FxBeat | undefined {
	for (let at = events.length - 1; at >= 0; at -= 1) {
		const event = events[at];
		if (!event) continue;

		switch (event.type) {
			case 'run.finished':
				switch (event.payload.outcome) {
					case 'SUCCESS':
						return { cue: 'celebrating', at };
					case 'STOPPED_BY_GUARDRAIL':
						return { cue: 'denied', at };
					case 'OUT_OF_STEPS':
						return { cue: 'sleeping', at };
					default:
						// Stopped by a person, or an error. Neither is the world saying
						// something about itself, and neither wants a firework.
						return undefined;
				}

			case 'guardrail.tripped':
				// Both dispositions stamp. `block-action` is the one this was really
				// written for: the run carries on, and without a beat here the only
				// sign a rule fired is a row in the trace.
				return { cue: 'denied', at };

			case 'action.performed':
				if (!event.payload.result.ok) return { cue: 'puzzled', at };
				// A pickup is the one success small enough to deserve an accent
				// rather than a celebration.
				return event.payload.name === 'pick_up' ? { cue: 'sparkle', at } : undefined;

			case 'think.started':
				return undefined;
		}
	}
	return undefined;
}
