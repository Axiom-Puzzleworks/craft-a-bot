import type { EngineEvent, RunOutcome } from '@craftabot/core';

/**
 * **"What would help?"** (`16-…` §2.3).
 *
 * An end card that says only *what* happened leaves the most useful question
 * unanswered. A child who ran out of steps needs to know whether the budget was
 * too small or the bot was going in circles — those look identical from
 * OUT_OF_STEPS and want opposite fixes, and guessing wrong is how a toy stops
 * being worth another go.
 *
 * Read from the trace, never from a guess: the hint has to be *about this run*
 * or it is worse than nothing. Where the trace does not support a confident
 * diagnosis there is no hint, which is the common case and the right default —
 * a wrong hint sends a child to change the wrong thing.
 */
export interface EndCardHint {
	/** What to try, in the child's register. */
	text: string;
	/** Which observation drove it, so a test can pin cause to advice. */
	cause: 'looping' | 'budget' | 'no-tools' | 'kept-being-refused';
}

/** How many identical actions in a row count as going in circles. */
const LOOP_THRESHOLD = 3;

export function endCardHint(
	outcome: RunOutcome,
	events: readonly EngineEvent[]
): EndCardHint | undefined {
	// A win needs no advice, and a run somebody stopped was not trying to finish.
	if (outcome === 'SUCCESS' || outcome === 'STOPPED_BY_USER') return undefined;

	if (outcome === 'STOPPED_BY_GUARDRAIL') {
		// The Safety Brick stopping a run is the system working (`08-…` §3), so
		// there is nothing here to fix and saying otherwise would teach the
		// opposite of the lesson.
		return undefined;
	}

	if (outcome === 'OUT_OF_STEPS') {
		if (longestRepeatRun(events) >= LOOP_THRESHOLD) {
			return {
				cause: 'looping',
				text: 'It kept trying the same thing over and over. The Safety Brick has a rule that spots that — switch on the loop-breaker and it will nudge your bot to try something else.'
			};
		}
		if (refusalCount(events) >= LOOP_THRESHOLD) {
			return {
				cause: 'kept-being-refused',
				text: 'The room kept saying no. Read the story strip to see what it was told — the bot needs a different plan, not more steps.'
			};
		}
		if (!usedAnyTool(events)) {
			return {
				cause: 'no-tools',
				text: 'Your bot never reached for a tool. If the job needs counting or a dice roll, fit the Tool Belt brick and it will have something to reach for.'
			};
		}
		return {
			cause: 'budget',
			text: 'It was still going when it ran out of steps. Turn the step dial up and give it more room.'
		};
	}

	return undefined;
}

/** The longest streak of the same action with the same arguments, back to back. */
function longestRepeatRun(events: readonly EngineEvent[]): number {
	let longest = 0;
	let current = 0;
	let previous: string | undefined;

	for (const event of events) {
		if (event.type !== 'action.performed') continue;
		const signature = `${event.payload.name}:${JSON.stringify(event.payload.arguments)}`;
		current = signature === previous ? current + 1 : 1;
		previous = signature;
		longest = Math.max(longest, current);
	}
	return longest;
}

function refusalCount(events: readonly EngineEvent[]): number {
	return events.filter((event) => event.type === 'action.performed' && !event.payload.result.ok)
		.length;
}

function usedAnyTool(events: readonly EngineEvent[]): boolean {
	return events.some((event) => event.type === 'tool.executed');
}
