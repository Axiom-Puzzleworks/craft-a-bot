import type { EngineEvent, Guardrail } from '@craftabot/core';

/**
 * **No repetition** — the Safety Brick's loop-breaker.
 *
 * Real-world analogue: the runaway-detection every production agent stack ends
 * up growing, usually after an incident.
 *
 * ## Why this is a guardrail and not engine behaviour
 *
 * A bot that gets stuck repeating itself is one of the most common and most
 * instructive agent failures, and it was reported from real play: a bot at the
 * toy chest calling out to Teddy, over and over, until its steps ran out.
 *
 * The tempting fix is to have the engine notice and nudge. That would be wrong.
 * It would hard-code a policy into every bot ever built, hide a failure the
 * simulator exists to *show* people, and quietly make the "watch it fail, then
 * fix it" arc impossible to demonstrate. Making it a rule the builder fits is
 * the difference between a toy that papers over agent failure modes and one
 * that lets you experiment with the controls for them.
 *
 * ## What counts as repetition
 *
 * The same call — same kind, same name, same arguments — proposed on
 * consecutive turns. A turn that calls something else, or thinks without
 * acting, breaks the streak.
 *
 * Be straight about the trade-off: this counts *identical* calls, so a bot
 * genuinely walking four squares east in a straight line will trip a limit of
 * three. That is a real false positive, and it is why the rule is off unless
 * the builder turns it on and picks the number. A bot pressing the same
 * direction into a wall and a bot crossing a room look alike from here; only
 * the goal tells them apart, and a guardrail does not get to see the goal.
 */

export const NO_REPETITION_ID = 'safety/no-repetition';

function signatureOf(call: { kind: string; name: string; arguments: unknown }): string {
	return `${call.kind}:${call.name}:${JSON.stringify(call.arguments ?? null)}`;
}

/** How many turns in a row have proposed exactly this, including the current one. */
function consecutiveRepeats(history: ReadonlyArray<EngineEvent>, signature: string): number {
	let streak = 0;
	for (let index = history.length - 1; index >= 0; index--) {
		const event = history[index];
		if (event?.type !== 'decision') continue;

		// A turn that did something else — or nothing — ends the run of repeats.
		if (event.payload.call === null) break;
		if (signatureOf(event.payload.call) !== signature) break;
		streak += 1;
	}
	return streak;
}

export function createNoRepetitionGuardrail(limit: number): Guardrail {
	return {
		id: NO_REPETITION_ID,
		name: 'No Repetition',
		description: `Stops the bot repeating the same move more than ${limit} times in a row.`,
		hooks: ['pre-act'],
		check(ctx) {
			const proposed = ctx.proposed;
			if (!proposed) return { allow: true };

			// The `decision` event is emitted before pre-act guards run, so the
			// current proposal is already the last entry in the history.
			const streak = consecutiveRepeats(ctx.history, signatureOf(proposed));
			if (streak <= limit) {
				return { allow: true, note: `${streak} of ${limit} repeats` };
			}

			return {
				allow: false,
				reason: `You have tried ${proposed.name} ${streak - 1} times in a row and it has not got you anywhere. Try something different.`,
				disposition: 'block-action'
			};
		}
	};
}
