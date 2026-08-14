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

export function safetyTally(events: readonly EngineEvent[]): SafetyTally {
	let checks = 0;
	let saves = 0;
	for (const event of events) {
		if (event.type === 'guardrail.checked') checks += 1;
		else if (event.type === 'guardrail.tripped') saves += 1;
	}
	return { checks, saves };
}

/**
 * The ticker's words.
 *
 * Says nothing at all before the first check: a run that has not started has no
 * safety story, and "0 checks, 0 saves" reads like the brick is broken rather
 * than idle. Singulars are spelled out because a five-year-old reads this
 * aloud.
 */
export function safetyWords(tally: SafetyTally): string | undefined {
	if (tally.checks === 0) return undefined;

	const checks = tally.checks === 1 ? '1 check' : `${tally.checks} checks`;
	if (tally.saves === 0) return `${checks}, nothing to stop`;

	const saves = tally.saves === 1 ? '1 save' : `${tally.saves} saves`;
	return `${checks}, ${saves}`;
}
