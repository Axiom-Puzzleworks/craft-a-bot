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
 * ## What counts as repetition (v2)
 *
 * > **Amended 2026-08-13 (WP11):** rewritten per `14-…` §4.6 to close `12-…` C3.
 *
 * The same call — same kind, same name, same arguments — proposed N times
 * inside the last ten decisions. Two changes from v1, each fixing a way the
 * old rule was wrong:
 *
 *  - **A window, not a streak.** v1 needed the repeats to be consecutive, so a
 *    bot alternating between two hopeless ideas — push the lid, walk into the
 *    table, push the lid, walk into the table — never tripped anything. That
 *    is the loop people actually watch their bot perform.
 *  - **Walking is not looping.** v1 counted every identical call, so a bot
 *    crossing the room four squares east tripped a limit of three. That false
 *    positive was the stated reason the rule shipped switched *off*, and a
 *    rule switched off is why the reported hello-loop was the default
 *    experience. A `move` that worked is therefore exempt: it took the bot
 *    somewhere new, which is the opposite of being stuck.
 *
 * Note what is deliberately *not* exempt: a call that succeeded but achieved
 * nothing. The loop first reported from play was a bot beside the toy chest
 * calling "hello!" to a Teddy three squares away, over and over — every `say`
 * succeeded, and it was still the clearest loop in the box. Success is not
 * progress.
 */

export const NO_REPETITION_ID = 'safety/no-repetition';

/** How far back the rule looks. Ten decisions is a third of the default budget. */
const WINDOW = 10;

export interface NoRepetitionOptions {
	/**
	 * Whether a successful call of this action is progress (WP45, `33-…`
	 * §4.2) — declared by the world on the action, answered here by whoever
	 * fits the guardrail. Governance knows no action's name; without an
	 * answer, nothing is exempt.
	 */
	isProgress?: (actionName: string) => boolean;
}

function signatureOf(call: { kind: string; name: string; arguments: unknown }): string {
	return `${call.kind}:${call.name}:${JSON.stringify(call.arguments ?? null)}`;
}

type PastCall = { signature: string; counts: boolean };

/**
 * The calls behind us, newest first, each with whether it came to anything.
 *
 * A decision's fate is written by the events that follow it, so this walks
 * forward and closes each decision off when the next one opens. The newest
 * decision is deliberately never closed: it is the proposal being judged right
 * now — the engine emits `decision` before pre-act guards run — and its fate
 * has not been written yet.
 */
function recentCalls(
	history: ReadonlyArray<EngineEvent>,
	isProgress: (actionName: string) => boolean
): PastCall[] {
	const calls: PastCall[] = [];
	let current: PastCall | undefined;

	for (const event of history) {
		switch (event.type) {
			case 'decision': {
				if (current) calls.push(current);
				current = event.payload.call
					? { signature: signatureOf(event.payload.call), counts: true }
					: undefined;
				break;
			}
			case 'action.performed': {
				if (current && event.payload.result.ok && isProgress(event.payload.name)) {
					current.counts = false;
				}
				break;
			}
		}
	}
	return calls.reverse();
}

export function createNoRepetitionGuardrail(
	limit: number,
	options: NoRepetitionOptions = {}
): Guardrail {
	const isProgress = options.isProgress ?? (() => false);
	return {
		id: NO_REPETITION_ID,
		name: 'No Repetition',
		description: `Stops the bot repeating the same move more than ${limit} times in its last ${WINDOW} turns.`,
		hooks: ['pre-act'],
		check(ctx) {
			const proposed = ctx.proposed;
			if (!proposed) return { allow: true };

			const signature = signatureOf(proposed);
			const repeats = recentCalls(ctx.history, isProgress)
				.slice(0, WINDOW)
				.filter((call) => call.signature === signature && call.counts).length;

			if (repeats < limit) {
				return { allow: true, note: `${repeats} of ${limit} repeats` };
			}

			return {
				allow: false,
				reason: `You have tried ${proposed.name} ${repeats} times and it has not got you anywhere. Try something different.`,
				disposition: 'block-action'
			};
		}
	};
}
