import type { EngineEvent } from '@craftabot/core';

/**
 * **What the Safety Brick has been doing** (`16-…` §2.1).
 *
 * The brick is visually central to the toy and experientially invisible: its
 * checks are silent, and the only loud moment is an approval. A child watching
 * a run has no way to tell that governance is *working* — the successful case
 * looks exactly like no safety at all, which is the wrong lesson to teach about
 * the one brick this whole project exists to make legible.
 *
 * Counted from events, like everything else the UI says about a run, so the
 * ticker and the trace cannot disagree. That is also §2.1's acceptance test:
 * the numbers on screen match the numbers in the Flight Recorder.
 */
export interface SafetyTally {
	/** Every rule the engine consulted, allowed or not. */
	checks: number;
	/**
	 * Checks that said no. "Saves" rather than "blocks" because that is what
	 * they are from the child's side — the brick caught something.
	 *
	 * Each denial emits `guardrail.tripped` alongside its `guardrail.checked`,
	 * so counting the tripped events counts denials exactly once.
	 */
	saves: number;
}

/** The ticker the Kit and the Workshop both show: how many times a rule was consulted, and how many times it said no. */
export function safetyTally(events: readonly EngineEvent[]): SafetyTally {
	let checks = 0;
	let saves = 0;
	for (const event of events) {
		if (event.type === 'guardrail.checked') checks += 1;
		else if (event.type === 'guardrail.tripped') saves += 1;
	}
	return { checks, saves };
}
