import type { EngineEvent, RunOutcome } from '@craftabot/core';

/**
 * **What a run was like, computed from its trace and nothing else** (`13-…` §8).
 *
 * The constraint in that section — "all computable from the trace alone — the
 * trace is the interface" — is the whole design, not a convenience. It buys
 * three things:
 *
 * 1. **A live run and a stored one score identically**, because there is only
 *    one input and it is the thing that gets persisted. The same fold runs over
 *    a session that finished a millisecond ago and over a trace exported from
 *    somebody else's machine last month.
 * 2. **The scorer cannot cheat.** A metric that reached into the session could
 *    measure something the trace never recorded, and then the scorecard would
 *    be claiming things an auditor could not check. Hard rule 3 says anything
 *    the UI shows about engine behaviour arrives as a typed event; a scorecard
 *    is a UI.
 * 3. **It is world-agnostic.** Nothing here knows about the Playroom. A pack
 *    with a different world gets the same numbers, which is what makes this the
 *    data model `17-…` §4.4's Eval Matrix renders rather than a starter-pack
 *    scoring script.
 *
 * Deliberately **not** reactive, not async, and free of any session handle: a
 * plain fold over plain data, like `run-projection.ts` in the app.
 */

/** One run, measured. Every field is a number the scorecard can print. */
export interface RunMetrics {
	/** Absent only if the run never finished — a crash, or a trace cut short. */
	outcome: RunOutcome | undefined;
	/** Turns the bot actually took. */
	ticksUsed: number;
	tokensIn: number;
	tokensOut: number;

	/**
	 * **The C3 phenomenon, measured** (`12-…`): a bot going round in circles.
	 *
	 * Two numbers because there are two ways to loop and they need different
	 * fixes. A bot repeating a *successful* call is stuck in a behavioural rut
	 * the Safety brick's repeat-limit rule is for; a bot repeating a *failing*
	 * call has misread the world and needs better information design. Reporting
	 * one number would average the two into something nobody can act on.
	 */
	loop: LoopScore;

	/**
	 * Turns that achieved nothing, over turns taken. The single most useful
	 * number for "is this card teaching or frustrating".
	 */
	wastedTickRatio: number;

	/**
	 * Times the bot named something the world could not resolve.
	 *
	 * Split, because they are different failures. A **miss** is the bot naming
	 * something that is not there — bad recall, or a world that never told it.
	 * An **ambiguity** is the bot naming something that matches several things
	 * — the world knows what it might have meant and says so, which is a
	 * recoverable turn rather than a wasted one.
	 */
	namingMisses: number;
	namingAmbiguities: number;

	/** How many times each guardrail stopped something, keyed by rule id. */
	guardrailTrips: Record<string, number>;
	approvalsRequested: number;
	approvalsDenied: number;

	/**
	 * The tick of the first action the world accepted, or `undefined` if there
	 * never was one.
	 *
	 * A bot that wins on turn 20 having done nothing until turn 18 is a
	 * different animal from one that started well and got stuck, and `outcome`
	 * alone cannot tell them apart.
	 */
	firstProductiveTick: number | undefined;
}

export interface LoopScore {
	/** The longest run of identical consecutive calls, successful or not. */
	longestStreak: number;
	/** How many failing calls were repeats of a call that had already failed. */
	repeatedFailures: number;
}

/**
 * How a naming miss is recognised.
 *
 * **Ambiguity is structured and misses are prose**, which is an asymmetry in
 * the engine rather than a choice made here: `ActionResult.didYouMean` carries
 * the candidates when a name matched several things (added in WP16 §2.4 so the
 * UI could offer chips), and nothing equivalent exists for a name that matched
 * nothing at all. So ambiguity is counted from the field and misses are matched
 * against the narration.
 *
 * Matching prose is exactly as brittle as it sounds, which is why the default
 * is **pinned by a test that runs a real bot into a real miss** rather than by
 * a fixture somebody wrote to match the regex. If the world's wording changes,
 * that test fails; without it the metric would quietly start reading zero and a
 * scorecard full of zeroes looks like good news.
 */
export const DEFAULT_NAMING_MISS_PATTERN =
	/cannot find it|nothing within reach|there is nobody called|there is no container called|there is no such/i;

export interface MetricsOptions {
	/** Override for a world whose refusals are worded differently. */
	namingMissPattern?: RegExp;
}

interface ActionPayload {
	name: string;
	arguments: unknown;
	result: { ok: boolean; narration: string; didYouMean?: string[] };
}

/** Score one run. */
export function scoreRun(events: readonly EngineEvent[], options: MetricsOptions = {}): RunMetrics {
	const missPattern = options.namingMissPattern ?? DEFAULT_NAMING_MISS_PATTERN;

	let outcome: RunOutcome | undefined;
	let ticksUsed = 0;
	let tokensIn = 0;
	let tokensOut = 0;
	let namingMisses = 0;
	let namingAmbiguities = 0;
	let approvalsRequested = 0;
	let approvalsDenied = 0;
	let firstProductiveTick: number | undefined;
	let wastedTicks = 0;
	const guardrailTrips: Record<string, number> = {};

	/** Call signatures in order, for the loop score. */
	const signatures: { signature: string; ok: boolean }[] = [];
	/**
	 * Ticks in which the bot produced nothing the world accepted. A set, because
	 * a tick can contain several disappointments and is still only one wasted
	 * turn.
	 */
	const productiveTicks = new Set<number>();
	const attemptedTicks = new Set<number>();

	for (const event of events) {
		switch (event.type) {
			case 'tick.started':
				ticksUsed += 1;
				attemptedTicks.add(event.tick);
				break;

			case 'think.completed':
				tokensIn += event.payload.response.usage.inputTokens;
				tokensOut += event.payload.response.usage.outputTokens;
				break;

			case 'action.performed': {
				const payload = event.payload as ActionPayload;
				signatures.push({ signature: signatureOf(payload), ok: payload.result.ok });

				if (payload.result.ok) {
					productiveTicks.add(event.tick);
					firstProductiveTick ??= event.tick;
				} else {
					if (missPattern.test(payload.result.narration)) namingMisses += 1;
					if ((payload.result.didYouMean?.length ?? 0) > 0) namingAmbiguities += 1;
				}
				break;
			}

			case 'tool.executed':
				/*
				 * A tool call is productive. The Sums card is won by using the
				 * calculator and saying the answer, so a run scored on world actions
				 * alone would call its best turn wasted.
				 */
				productiveTicks.add(event.tick);
				firstProductiveTick ??= event.tick;
				signatures.push({ signature: `tool:${event.payload.name}`, ok: true });
				break;

			case 'guardrail.tripped':
				guardrailTrips[event.payload.guardrailId] =
					(guardrailTrips[event.payload.guardrailId] ?? 0) + 1;
				break;

			case 'approval.requested':
				approvalsRequested += 1;
				break;

			case 'approval.resolved':
				if (!event.payload.approved) approvalsDenied += 1;
				break;

			case 'run.finished':
				outcome = event.payload.outcome;
				break;
		}
	}

	for (const tick of attemptedTicks) {
		if (!productiveTicks.has(tick)) wastedTicks += 1;
	}

	return {
		outcome,
		ticksUsed,
		tokensIn,
		tokensOut,
		loop: loopScore(signatures),
		// A run with no turns wasted none of them. Guarding the divide rather
		// than reporting NaN, which would poison every average downstream.
		wastedTickRatio: ticksUsed === 0 ? 0 : wastedTicks / ticksUsed,
		namingMisses,
		namingAmbiguities,
		guardrailTrips,
		approvalsRequested,
		approvalsDenied,
		firstProductiveTick
	};
}

/**
 * Name plus arguments, so `move(north)` and `move(south)` are different calls.
 *
 * Arguments are part of the identity deliberately. A bot alternating north and
 * south is looping just as surely as one going north twice, but by *name* alone
 * those are the same call and would score an infinite streak — every `move` in
 * the run counted as one. Including the arguments makes the streak mean "it did
 * the identical thing again", which is the behaviour the Safety brick's
 * repeat-limit rule actually watches for.
 */
function signatureOf(payload: ActionPayload): string {
	return `${payload.name}(${stableStringify(payload.arguments)})`;
}

/**
 * Key order must not change a signature, or a provider that serialises its
 * arguments differently would look like a bot that stopped repeating itself.
 */
function stableStringify(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
	// Two-way, not three-way: an object cannot have two identical keys, so an
	// "equal" branch is code no test could ever reach.
	const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
		a < b ? -1 : 1
	);
	return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

function loopScore(calls: readonly { signature: string; ok: boolean }[]): LoopScore {
	let longestStreak = 0;
	let currentStreak = 0;
	let previous: string | undefined;
	let repeatedFailures = 0;
	const failedBefore = new Set<string>();

	for (const call of calls) {
		currentStreak = call.signature === previous ? currentStreak + 1 : 1;
		if (currentStreak > longestStreak) longestStreak = currentStreak;
		previous = call.signature;

		if (!call.ok) {
			// Counted on the repeat, not on the first failure: failing once is
			// information, failing the same way twice is the bot not using it.
			if (failedBefore.has(call.signature)) repeatedFailures += 1;
			failedBefore.add(call.signature);
		}
	}

	return { longestStreak, repeatedFailures };
}
