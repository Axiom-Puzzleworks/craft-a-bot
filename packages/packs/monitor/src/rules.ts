import type {
	EngineEvent,
	EvaluationResult,
	Evaluator,
	EventBus,
	Guardrail,
	GuardrailContext,
	GuardrailHook,
	Unsubscribe
} from '@craftabot/core';
import { evaluationInputFor, inputReadableBy } from '@craftabot/governance';

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

/**
 * **The circuit breaker** (WP48, `36-…` §4.2; `19-…` #34): the one rule a
 * group Watchbot contributes that is not a note — once the merged stream
 * holds this many trips, the group stops through the chokepoint it already
 * has. A group's `pre-think` is where it checks.
 */
export const GROUP_CIRCUIT_BREAKER_ID = 'monitor/group-circuit-breaker';

export function createGroupCircuitBreaker(refusalLimit: number): Guardrail {
	return {
		id: GROUP_CIRCUIT_BREAKER_ID,
		name: 'Circuit breaker',
		description: `Stops the group once ${refusalLimit} things its robots tried were refused by a rule.`,
		hooks: ['pre-think'],
		check: (ctx: GuardrailContext) => {
			const refusals = ctx.history.filter((event) => event.type === 'guardrail.tripped').length;
			if (refusals < refusalLimit) return { allow: true };
			return {
				allow: false,
				reason: `${refusals} attempts refused across the group — the circuit breaker has tripped.`,
				disposition: 'stop-run'
			};
		}
	};
}

export interface GroupWatchbotOptions {
	watchFor: readonly string[];
	/** Trips across the merged stream before the breaker stops the group; omit for no breaker. */
	refusalLimit?: number;
}

export interface GroupWatchbot {
	/** The observer the host installs on the group (`options.observers`): a `brick.state` note on the merged stream whenever a watched rule holds. */
	observe: (events: EventBus, group: { groupRunId: string }) => Unsubscribe;
	/** The rules the host installs at the group's chokepoint (`groupGuardrails`): the watched rules at `pre-think`, and the breaker. */
	guardrails: Guardrail[];
}

/**
 * **A Watchbot on no chassis** (WP48, `36-…` §4.2): the monitor's rules
 * read the merged stream instead of one robot's history, note on the
 * merged bus, and stop the group through its own chokepoint. Two things,
 * because an observer has the group's ear but not its hand.
 */
export function createGroupWatchbot(options: GroupWatchbotOptions): GroupWatchbot {
	const rules = rulesFor(options.watchFor).map((rule) => ({
		...rule,
		hooks: ['pre-think'] as GuardrailHook[]
	}));
	const guardrails: Guardrail[] = [
		...rules,
		...(options.refusalLimit !== undefined ? [createGroupCircuitBreaker(options.refusalLimit)] : [])
	];
	return {
		guardrails,
		observe(events, group) {
			const history: EngineEvent[] = [];
			const noted = new Set<string>();
			return events.onAny((event) => {
				history.push(event);
				if (event.type !== 'action.performed' && event.type !== 'guardrail.tripped') return;
				for (const rule of rules) {
					const verdict = rule.check({
						hook: 'post-act',
						tick: event.tick,
						spec: {
							id: group.groupRunId,
							name: 'group',
							goalCardId: '',
							schemaVersion: 1
						} as never,
						usage: { ticks: event.tick, inputTokens: 0, outputTokens: 0 },
						worldState: {},
						history
					});
					const note = 'note' in verdict ? verdict.note : undefined;
					if (note === undefined || noted.has(`${rule.id}:${note}`)) continue;
					noted.add(`${rule.id}:${note}`);
					events.emit({
						id: `${group.groupRunId}:watchbot:${history.length}`,
						runId: group.groupRunId,
						tick: event.tick,
						timestamp: event.timestamp,
						type: 'brick.state',
						payload: {
							slot: 'safety',
							kind: 'monitor/group-watchbot',
							state: { rule: rule.id, note }
						}
					} as EngineEvent);
				}
			});
		}
	};
}

/**
 * **A breaker on an evaluator's verdict** (WP64, `56-LIVE-COUNTERPARTS.md`
 * §4.3; `41-…` §6.5.6): the desk's own evaluator run over the merged
 * history at the group's `pre-think`, and `stop-run` when its label is one
 * of the named — `unsuitable` on the Advice Desk, `tipped-off` on the Fraud
 * Desk. A pass, an inconclusive verdict or any other label lets the round
 * go; an evaluator that throws is a note, never a stop. Deterministic
 * evaluators only: a judge that asks a model has no place at a chokepoint
 * that runs every round.
 */
export interface EvaluatorBreakerTrigger {
	/** Stop when the evaluator's label is one of these. */
	labels?: readonly string[];
	/** Stop when the evaluator fails — a verdict with no label, or a label that needs truth the chokepoint never sees. */
	onFail?: boolean;
}

export function createEvaluatorCircuitBreaker(
	evaluator: Evaluator,
	trigger: EvaluatorBreakerTrigger,
	options: { fetch?: typeof globalThis.fetch } = {}
): Guardrail {
	const stopOn = new Set(trigger.labels ?? []);
	const onFail = trigger.onFail === true;
	const what = [...stopOn, ...(onFail ? ['fails'] : [])].join(' or ') || 'nothing';
	return {
		id: `monitor/evaluator-breaker:${evaluator.id}`,
		name: `Breaker on ${evaluator.id}`,
		description: `Stops the group the moment ${evaluator.id} says ${what}.`,
		hooks: ['pre-think'],
		async check(ctx: GuardrailContext) {
			let result: EvaluationResult;
			try {
				result = await evaluator.evaluate(
					inputReadableBy(evaluator, evaluationInputFor(ctx.history)),
					{
						fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
						getCredential: () => undefined
					}
				);
			} catch (error) {
				return {
					allow: true,
					note: `breaker: ${evaluator.id} could not evaluate — ${error instanceof Error ? error.message : String(error)}`
				};
			}
			const tripped =
				(result.label !== undefined && stopOn.has(result.label)) ||
				(onFail && result.verdict === 'fail');
			if (tripped) {
				return {
					allow: false,
					reason: `${evaluator.id} says ${result.label ?? result.verdict}: ${result.explanation}`,
					disposition: 'stop-run'
				};
			}
			return {
				allow: true,
				note: `breaker: ${evaluator.id} — ${result.label ?? result.verdict ?? 'no label'}`
			};
		}
	};
}

export interface ComplianceWatchbotOptions extends GroupWatchbotOptions {
	/** The desk's evaluators and what trips the breaker on each. */
	breakOn: ReadonlyArray<{ evaluator: Evaluator } & EvaluatorBreakerTrigger>;
	fetch?: typeof globalThis.fetch;
}

/**
 * **The Compliance Watchbot** (WP64, `56-…` §4.3; `41-…` §6.5.6's monitor):
 * the group Watchbot with the desk's own evaluators beside it — the watched
 * rules noting on the merged stream, the breaker on refusals, and a breaker
 * per evaluator verdict. Content names it (a campaign's `guards[].group`, a
 * Spec Lab preset); this is the one place it is composed.
 */
export function createComplianceWatchbot(options: ComplianceWatchbotOptions): GroupWatchbot {
	const watchbot = createGroupWatchbot({
		watchFor: options.watchFor,
		...(options.refusalLimit !== undefined ? { refusalLimit: options.refusalLimit } : {})
	});
	return {
		observe: watchbot.observe,
		guardrails: [
			...watchbot.guardrails,
			...options.breakOn.map((entry) =>
				createEvaluatorCircuitBreaker(
					entry.evaluator,
					{
						...(entry.labels !== undefined ? { labels: entry.labels } : {}),
						...(entry.onFail !== undefined ? { onFail: entry.onFail } : {})
					},
					{ ...(options.fetch ? { fetch: options.fetch } : {}) }
				)
			)
		]
	};
}
