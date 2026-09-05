/**
 * **The scripted counterpart** (WP55 stage A, `46-COUNTERPARTS.md` §4.1;
 * `41-…` §6.3): the person across the desk as a small state machine. A
 * `CounterpartScript` is content — a desk or a scenario carries one — and
 * `advanceCounterpart` is the one interpreter both drivers call: the desk
 * runtime, which advances it inside `perform` when the agent speaks, and the
 * `scripted-counterpart` brain in `evals`, which drives a live seat along the
 * same script so an episode reproduces without a model.
 *
 * Pure over its arguments; the only randomness is the `random` it is handed,
 * used to pick among a rule's lines.
 */

export type CounterpartTrigger =
	/** The agent's last line matches this pattern (a `RegExp` source, case-insensitive). */
	| { kind: 'agent-says-matches'; pattern: string }
	/** The agent's last line is a question that mentions the topic. */
	| { kind: 'agent-asks'; topic: string }
	/** The agent performed this (bare) action. */
	| { kind: 'action-performed'; actionId: string }
	| { kind: 'tick-at-least'; tick: number }
	| { kind: 'always' };

export type CounterpartThen = 'continue' | 'end-conversation' | 'escalate';

export interface CounterpartRule {
	id: string;
	when: CounterpartTrigger;
	/** One line, or a deterministic pick through `random()`. A rule with no line acts without speaking. */
	say?: string | readonly string[];
	then?: CounterpartThen;
	/** 0..1 — how hard this line pushes (the tau-bench "user pressure" of `19-…` #25); a report aggregates it. */
	pressure?: number;
	/** `'social-engineering'`, `'vulnerability-disclosure'`, `'asks-for-guarantee'` … */
	tags?: string[];
	/** Fires at most once per conversation. Default false. */
	once?: boolean;
}

export interface CounterpartScript {
	/** "Mrs Okafor", "Caller claiming to be the account holder". */
	name: string;
	/** The brief — also a live seat's system prompt (`46-…` §4.4). */
	persona: string;
	/** Said before the agent's first turn. */
	opening?: string;
	/** On each cue, the first rule whose `when` matches fires. */
	rules: CounterpartRule[];
	/** What the counterpart says to a line nothing matched. */
	fallback: string;
}

/** What just happened, from the counterpart's side of the desk. */
export type CounterpartCue =
	{ kind: 'said'; text: string } | { kind: 'acted'; actionId: string } | { kind: 'tick' };

export interface CounterpartTurn {
	text: string | undefined;
	/** The rule that fired, or `undefined` for the fallback. */
	rule: CounterpartRule | undefined;
	then: CounterpartThen;
}

export interface CounterpartMemory {
	/** Ids of the rules that have fired, in order. */
	fired: string[];
	/** Set by `end-conversation`; nothing is said after it. */
	ended: boolean;
}

export const freshCounterpartMemory = (): CounterpartMemory => ({ fired: [], ended: false });

export const COUNTERPART_TRIGGER_KINDS: ReadonlySet<CounterpartTrigger['kind']> = new Set([
	'agent-says-matches',
	'agent-asks',
	'action-performed',
	'tick-at-least',
	'always'
]);

function matches(when: CounterpartTrigger, cue: CounterpartCue, tick: number): boolean {
	switch (when.kind) {
		case 'always':
			return true;
		case 'tick-at-least':
			return tick >= when.tick;
		case 'agent-says-matches':
			return cue.kind === 'said' && new RegExp(when.pattern, 'i').test(cue.text);
		case 'agent-asks':
			return (
				cue.kind === 'said' &&
				cue.text.includes('?') &&
				cue.text.toLowerCase().includes(when.topic.toLowerCase())
			);
		case 'action-performed':
			return cue.kind === 'acted' && cue.actionId === when.actionId;
	}
}

function pick(
	say: string | readonly string[] | undefined,
	random: () => number
): string | undefined {
	if (say === undefined) return undefined;
	if (typeof say === 'string') return say;
	if (say.length === 0) return undefined;
	return say[Math.floor(random() * say.length)];
}

/**
 * The first rule whose `when` matches the cue fires; a `once` rule that has
 * fired is skipped. A `said` cue nothing matches gets the `fallback`; an
 * `acted` or `tick` cue nothing matches gets no turn — the counterpart does
 * not speak every time the clerk opens a drawer. After `end-conversation`,
 * nothing is said to any cue.
 */
export function advanceCounterpart(
	script: CounterpartScript,
	cue: CounterpartCue,
	memory: CounterpartMemory,
	tick: number,
	random: () => number
): { turn: CounterpartTurn | undefined; memory: CounterpartMemory } {
	if (memory.ended) return { turn: undefined, memory };
	for (const rule of script.rules) {
		if (rule.once && memory.fired.includes(rule.id)) continue;
		if (!matches(rule.when, cue, tick)) continue;
		const then = rule.then ?? 'continue';
		return {
			turn: { text: pick(rule.say, random), rule, then },
			memory: { fired: [...memory.fired, rule.id], ended: then === 'end-conversation' }
		};
	}
	if (cue.kind !== 'said') return { turn: undefined, memory };
	return { turn: { text: script.fallback, rule: undefined, then: 'continue' }, memory };
}

/**
 * What is wrong with a script, if anything — the checks `checkDesk` makes
 * (`46-…` §4.2), exported so the kit (which is `core`-only) can mirror them
 * and a desk's own test can call them.
 */
export function describeScriptProblems(script: CounterpartScript): string[] {
	const problems: string[] = [];
	if (typeof script.fallback !== 'string' || script.fallback.trim() === '') {
		problems.push(`script "${script.name}" has no fallback`);
	}
	const seen = new Set<string>();
	for (const rule of script.rules) {
		if (seen.has(rule.id)) problems.push(`script "${script.name}" repeats rule id "${rule.id}"`);
		seen.add(rule.id);
		if (!COUNTERPART_TRIGGER_KINDS.has(rule.when?.kind)) {
			problems.push(`rule "${rule.id}" has an unknown trigger kind "${String(rule.when?.kind)}"`);
		}
		if (rule.pressure !== undefined && (rule.pressure < 0 || rule.pressure > 1)) {
			problems.push(`rule "${rule.id}" has a pressure outside 0..1`);
		}
		if (rule.when?.kind === 'agent-says-matches') {
			try {
				new RegExp(rule.when.pattern, 'i');
			} catch {
				problems.push(`rule "${rule.id}" has an invalid pattern`);
			}
		}
	}
	return problems;
}
