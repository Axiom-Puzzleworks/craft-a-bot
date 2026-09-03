import {
	createPackRegistry,
	createSession,
	type AgentSpec,
	type EngineEvent,
	type GuardrailHook,
	type Observation,
	type PackManifest,
	type PolicyCard,
	type PolicyDisposition,
	type PolicyRule,
	type PredicateExpr
} from '@craftabot/core';
import { createMockProvider, createTestClock, obedient } from '@craftabot/core/testing';
import { compilePolicyCard, evaluatePredicate } from '@craftabot/governance';
import starterPack from '@craftabot/pack-starter';

/**
 * **Policy Studio logic** (`17-…` §4.5, WP22 slice e), kept out of the
 * `+page.svelte` so it can be unit-tested directly — the pattern
 * `eval-cells.ts`/`run-filter.ts` already set for the other Workshop screens.
 *
 * Two things live here: turning a flat, form-shaped draft rule into the real
 * (recursive) `PredicateExpr` tree the schema wants, and replaying a card
 * against a stored trace's `decision` events to answer "would this have
 * fired?" — test bench part (a).
 */

export type LeafKind =
	| 'call-kind-is'
	| 'call-name-is'
	| 'argument-equals'
	| 'usage-at-least'
	| 'argument-contains'
	| 'argument-matches'
	| 'observation-contains'
	| 'world-predicate'
	| 'history-count'
	| 'hook-is';

/**
 * One row of the rule builder's flat condition list. A rule's `when` is this
 * list ANDed together, each optionally negated — the "hook → condition →
 * disposition → reason" shape `17-…` §4.5 asks for, not the full and/or/not
 * tree a pack-authored card may use (`starter/policy/no-loose-ends` nests
 * `not` inside `and`; a form that built arbitrary trees would be most of a
 * small programming language).
 */
export interface ConditionRow {
	negate: boolean;
	kind: LeafKind;
	callKind: 'tool' | 'action';
	name: string;
	path: string;
	argValue: string;
	field: 'ticks' | 'inputTokens' | 'outputTokens';
	threshold: number;
	/** The v2 leaves' fields (WP45, `33-…` §4.4). */
	pattern: string;
	predicateId: string;
	eventType: string;
	hook: GuardrailHook;
	count: number;
}

export interface DraftRule {
	hook: GuardrailHook;
	conditions: ConditionRow[];
	then: PolicyDisposition;
	reason: string;
}

export function newCondition(): ConditionRow {
	return {
		negate: false,
		kind: 'call-name-is',
		callKind: 'action',
		name: '',
		path: '',
		argValue: '',
		field: 'ticks',
		threshold: 10,
		pattern: '',
		predicateId: '',
		eventType: 'action.performed',
		hook: 'pre-act',
		count: 2
	};
}

export function newRule(): DraftRule {
	return { hook: 'pre-act', conditions: [newCondition()], then: 'block-action', reason: '' };
}

/** A typed argument literal from a text field — numbers and booleans parse, everything else stays a string. */
export function parseLiteral(raw: string): string | number | boolean | null {
	if (raw === 'true') return true;
	if (raw === 'false') return false;
	if (raw === 'null') return null;
	if (raw.trim() !== '' && !Number.isNaN(Number(raw))) return Number(raw);
	return raw;
}

export function conditionToExpr(row: ConditionRow): PredicateExpr {
	let base: PredicateExpr;
	if (row.kind === 'call-kind-is') base = { kind: 'call-kind-is', value: row.callKind };
	else if (row.kind === 'call-name-is') base = { kind: 'call-name-is', value: row.name };
	else if (row.kind === 'argument-equals') {
		base = { kind: 'argument-equals', path: row.path, value: parseLiteral(row.argValue) };
	} else if (row.kind === 'argument-contains') {
		base = { kind: 'argument-contains', path: row.path, value: row.argValue };
	} else if (row.kind === 'argument-matches') {
		base = { kind: 'argument-matches', path: row.path, pattern: row.pattern };
	} else if (row.kind === 'observation-contains') {
		base = { kind: 'observation-contains', value: row.argValue };
	} else if (row.kind === 'world-predicate') {
		base = { kind: 'world-predicate', predicateId: row.predicateId };
	} else if (row.kind === 'history-count') {
		base = {
			kind: 'history-count',
			type: row.eventType,
			...(row.name.trim() !== '' ? { name: row.name } : {}),
			atLeast: row.count
		};
	} else if (row.kind === 'hook-is') {
		base = { kind: 'hook-is', hook: row.hook };
	} else base = { kind: 'usage-at-least', field: row.field, value: row.threshold };
	return row.negate ? { kind: 'not', expr: base } : base;
}

/** A rule's flat condition list, ANDed together — a single condition needs no wrapper. */
export function conditionsToWhen(conditions: ConditionRow[]): PredicateExpr {
	const exprs = conditions.map(conditionToExpr);
	const [first] = exprs;
	if (!first) return { kind: 'call-kind-is', value: 'action' };
	return exprs.length === 1 ? first : { kind: 'and', all: exprs };
}

export function draftRuleToPolicyRule(rule: DraftRule): PolicyRule {
	return {
		hook: rule.hook,
		when: conditionsToWhen(rule.conditions),
		then: rule.then,
		reason: rule.reason.trim() === '' ? '(no reason given yet)' : rule.reason
	};
}

export interface ReplayHit {
	tick: number;
	callKind: 'tool' | 'action';
	callName: string;
	ruleIndex: number;
	reason: string;
}

/**
 * Every point in `events` where `card`'s own rules would have fired — test
 * bench part (a) (`17-…` §4.5): "run the card against stored traces …
 * instant, free, and the governance-forensics workflow in miniature."
 *
 * Walks `decision` events (the only ones carrying a `proposed`-shaped call)
 * and folds `think.completed.response.usage` cumulatively alongside them, so
 * a `usage-at-least` rule sees the same running totals a live guardrail
 * would have. `evaluatePredicate` itself (`@craftabot/governance`) is the
 * pure per-call check; this is the fold that gets it a context to check.
 */
export function replayCard(card: PolicyCard, events: readonly EngineEvent[]): ReplayHit[] {
	const hits: ReplayHit[] = [];
	let inputTokens = 0;
	let outputTokens = 0;

	// The replay stands where pre-act stood (WP45): the trace so far is the
	// history, the last observation is what the bot could see. The world's own
	// questions are not on a stored trace, so a `world-predicate` leaf never
	// fires in replay — the scripted probe and a real run are where it shows.
	let observation: Observation | undefined;
	for (const [index, event] of events.entries()) {
		if (event.type === 'think.completed') {
			inputTokens += event.payload.response.usage.inputTokens;
			outputTokens += event.payload.response.usage.outputTokens;
			continue;
		}
		if (event.type === 'sense') {
			observation = event.payload.observation;
			continue;
		}
		if (event.type !== 'decision' || !event.payload.call) continue;

		const call = event.payload.call;
		const usage = { ticks: event.tick, inputTokens, outputTokens };
		const history = events.slice(0, index);
		card.rules.forEach((rule, ruleIndex) => {
			if (
				evaluatePredicate(rule.when, {
					proposed: call,
					usage,
					hook: 'pre-act',
					history,
					...(observation !== undefined ? { observation } : {})
				})
			) {
				hits.push({
					tick: event.tick,
					callKind: call.kind,
					callName: call.name,
					ruleIndex,
					reason: rule.reason
				});
			}
		});
	}

	return hits;
}

// --- test bench, part (b): a scripted adversarial run ------------------------------------

/**
 * A cartridge pack with nothing but a mock brain — the same shape starter's
 * own `session/harness.ts` and `pack-monitor`'s contract test both build, so
 * the Brain brick's `cartridgeId` has something real to resolve to.
 */
const PROBE_CARTRIDGE_PACK: PackManifest = {
	id: 'policy-studio-probe',
	name: 'Policy Studio probe cartridge',
	version: '1.0.0',
	requiresCore: '>=0.0.1',
	cartridges: [
		{
			id: 'policy-studio-probe/mock-brain',
			providerId: 'mock',
			model: 'mock-1',
			displayName: 'Probe Brain',
			blurb: 'Scripted and deterministic — the Studio’s own probe.',
			stats: { words: 2, reasoning: 2, speed: 3 },
			costHint: 'low',
			defaults: { temperature: 0, maxTokens: 256 }
		}
	]
};

/**
 * A short, generic sweep across the Playroom's action surface — not a plan
 * for any one goal card, deliberately: an authored card's condition is
 * arbitrary, so there is no way to script *the* adversarial run the way the
 * L5 efficacy suite could for the three starter-shipped cards, each written
 * against a known rule. This is the Studio's own probe, wide rather than
 * targeted, and it plays out on Free Play's layout because that is the one
 * with a locked chest, scattered blocks, a key and a snack all at once.
 */
const PROBE_SCRIPT = obedient([
	{ say: 'Let’s see what’s here.', call: 'move', args: { direction: 'east' } },
	{ say: 'Trying the chest.', call: 'open', args: { container: 'toy chest' } },
	{ say: 'Picking something up.', call: 'pick_up', args: { item: 'red-key' } },
	{ say: 'Putting it down again, just here.', call: 'put_down', args: { item: 'red-key' } },
	{ say: 'Saying hello.', call: 'say', args: { text: 'Hello!' } },
	{ say: 'That’s enough poking about.', call: 'celebrate' }
]);

export interface ScriptedProbeResult {
	events: EngineEvent[];
	hits: ReplayHit[];
	outcome: string | undefined;
}

const PLAYROOM_ACTIONS = ['move', 'pick_up', 'put_down', 'give', 'open', 'say', 'celebrate'].map(
	(id) => `starter/playroom/${id}`
);

/**
 * Drives `PROBE_SCRIPT` through a real session with `card` installed as the
 * *only* guardrail — through `CreateSessionDeps.guardrails`, the host seam,
 * rather than a fitted Safety Brick, since the point is to watch this one
 * card and nothing else. Approval is always granted, so a `require-approval`
 * rule does not park the probe forever.
 */
export async function runScriptedProbe(card: PolicyCard): Promise<ScriptedProbeResult> {
	const registry = createPackRegistry();
	registry.registerPack(starterPack);
	registry.registerPack(PROBE_CARTRIDGE_PACK);

	const clock = createTestClock();
	const spec: AgentSpec = {
		id: '00000000-0000-4000-8000-000000000000',
		name: 'Studio Probe Bot',
		bricks: {
			llm: {
				cartridgeId: 'policy-studio-probe/mock-brain',
				temperature: 0,
				maxTokens: 256,
				personality: ''
			},
			memory: { windowSize: 10, notebook: false },
			sense: { channels: ['starter/playroom/sight', 'starter/playroom/compass'] },
			actions: { enabled: PLAYROOM_ACTIONS }
		},
		goalCardId: 'starter/free-play',
		createdAt: '2026-08-16T09:00:00.000Z',
		updatedAt: '2026-08-16T09:00:00.000Z',
		schemaVersion: 1
	};

	const session = createSession({
		spec,
		registry,
		provider: createMockProvider({ script: PROBE_SCRIPT }),
		guardrails: compilePolicyCard(card),
		options: { now: clock.now, newId: clock.newId, random: clock.random }
	});

	const events: EngineEvent[] = [];
	session.events.onAny((event) => events.push(event));
	session.events.on('approval.requested', () => session.resolveApproval(true));

	session.start('step');
	let outcome: string | undefined;
	for (let step = 0; step < 8; step++) {
		const result = await session.step();
		if (result.outcome) {
			outcome = result.outcome;
			break;
		}
	}

	const hits: ReplayHit[] = [];
	let lastCall: { kind: 'tool' | 'action'; name: string } | undefined;
	for (const event of events) {
		if (event.type === 'decision' && event.payload.call) {
			lastCall = { kind: event.payload.call.kind, name: event.payload.call.name };
			continue;
		}
		if (event.type !== 'guardrail.checked' || event.payload.policyCardId !== card.id) continue;
		// A checked event fires for every rule on every eligible tick, allowed or
		// not — a "hit" here means the rule actually matched, the same
		// allow:true-or-not distinction `evaluatePredicate` draws inside the
		// compiled guardrail itself.
		const { verdict } = event.payload;
		if ('allow' in verdict && verdict.allow) continue;

		const ruleIndex = Number(event.payload.guardrailId.split('#rule-').at(-1) ?? 0);
		const rule = card.rules[ruleIndex];
		hits.push({
			tick: event.tick,
			callKind: lastCall?.kind ?? 'action',
			callName: lastCall?.name ?? '',
			ruleIndex,
			reason: rule?.reason ?? ''
		});
	}

	return { events, hits, outcome };
}
