import type { EngineEvent, Guardrail, GuardrailContext } from '@craftabot/core';

/**
 * **What a Watchbot can be told to watch for** (`14-…` §5.3).
 *
 * Every rule here is a `Guardrail` that **never refuses anything**. It runs at
 * `post-act`, reads the trace so far, and — when it sees the thing it was fitted
 * to see — allows the step with a *note*. The note lands in the
 * `guardrail.checked` event, which is what `14-…` §5.3 means by "flags become
 * trace events": the observation is in the record, permanently, without the run
 * being interfered with.
 *
 * That read-only stance is the whole teaching point of the brick, and it is
 * what makes it different from the Safety Brick sitting in the same socket. The
 * Safety Brick's loop-breaker *blocks* the fourth identical move at `pre-act`.
 * The Watchbot lets it happen and writes down that it happened. One is a
 * control; the other is oversight. A child can see the difference by fitting
 * each in turn and reading the trace — which is a better explanation of what a
 * monitor agent is (`19-…` #27) than any amount of prose.
 *
 * The rules read `ctx.history`, the live trace view. Per E9 it must be read
 * during `check` and never kept: the engine appends to that array as the run
 * proceeds, so a reference held past the call keeps changing.
 */

/** Every rule this pack ships, as ids a spec can name. */
export const MONITOR_RULE_IDS = [
	'monitor/going-in-circles',
	'monitor/all-talk',
	'monitor/refusal-storm'
] as const;

export type MonitorRuleId = (typeof MONITOR_RULE_IDS)[number];

/** The kit-side name for each, for the brick panel and the ribbon. */
export const MONITOR_RULE_LABELS: Record<MonitorRuleId, string> = {
	'monitor/going-in-circles': 'Going in circles',
	'monitor/all-talk': 'All talk, no doing',
	'monitor/refusal-storm': 'Keeps trying what it may not do'
};

/** How many times in a row counts as a circle. */
const CIRCLE_LENGTH = 3;
/** How many ticks of thinking-without-acting counts as all talk. */
const QUIET_TICKS = 4;
/** How many refusals in one run counts as a storm. */
const REFUSAL_LIMIT = 3;

/** A watching rule: always allows, sometimes with something to say. */
function watcher(
	id: MonitorRuleId,
	description: string,
	look: (history: ReadonlyArray<EngineEvent>) => string | undefined
): Guardrail {
	return {
		id,
		name: MONITOR_RULE_LABELS[id],
		description,
		hooks: ['post-act'],
		check: (ctx: GuardrailContext) => {
			const flag = look(ctx.history);
			// `allow: true` either way — the difference between a quiet tick and a
			// flagged one is the note, and nothing about the run changes.
			return flag === undefined ? { allow: true } : { allow: true, note: flag };
		}
	};
}

/** Actions actually performed, most recent last. */
function performed(history: ReadonlyArray<EngineEvent>): string[] {
	return history
		.filter((event) => event.type === 'action.performed')
		.map((event) => (event.type === 'action.performed' ? event.payload.name : ''));
}

export function createGoingInCirclesRule(): Guardrail {
	return watcher(
		'monitor/going-in-circles',
		`Notes when the same move happens ${CIRCLE_LENGTH} times in a row.`,
		(history) => {
			const recent = performed(history).slice(-CIRCLE_LENGTH);
			if (recent.length < CIRCLE_LENGTH) return undefined;
			const [first] = recent;
			if (first === undefined) return undefined;
			return recent.every((name) => name === first)
				? `Round in circles: "${first}" ${CIRCLE_LENGTH} times in a row.`
				: undefined;
		}
	);
}

export function createAllTalkRule(): Guardrail {
	return watcher(
		'monitor/all-talk',
		`Notes when ${QUIET_TICKS} turns go by with plenty of thinking and nothing done.`,
		(history) => {
			const ticks = history.filter((event) => event.type === 'tick.started').length;
			if (ticks < QUIET_TICKS) return undefined;
			return performed(history).length === 0
				? `${ticks} turns of thinking and nothing actually done yet.`
				: undefined;
		}
	);
}

export function createRefusalStormRule(): Guardrail {
	return watcher(
		'monitor/refusal-storm',
		`Notes when ${REFUSAL_LIMIT} things the bot tried were refused by a rule.`,
		(history) => {
			const refusals = history.filter((event) => event.type === 'guardrail.tripped').length;
			return refusals >= REFUSAL_LIMIT
				? `${refusals} attempts refused by a safety rule so far.`
				: undefined;
		}
	);
}

const FACTORIES: Record<MonitorRuleId, () => Guardrail> = {
	'monitor/going-in-circles': createGoingInCirclesRule,
	'monitor/all-talk': createAllTalkRule,
	'monitor/refusal-storm': createRefusalStormRule
};

/** The rules a Watchbot with this config installs. Unknown ids are skipped. */
export function rulesFor(watchFor: readonly string[]): Guardrail[] {
	return watchFor
		.filter((id): id is MonitorRuleId => id in FACTORIES)
		.map((id) => {
			const make = FACTORIES[id];
			/* c8 ignore next -- narrowed by the filter; kept so the map stays total */
			if (!make) throw new Error(`No monitor rule "${id}"`);
			return make();
		});
}

export function isMonitorRule(id: string): id is MonitorRuleId {
	return id in FACTORIES;
}
