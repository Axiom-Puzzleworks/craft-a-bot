import type { AgentSession, CreateSessionDeps, ForkState } from '../types/agent-session.js';
import type { AnyAgentSpec } from '../schemas/agent-spec-v2.js';
import type { EngineEvent } from '../schemas/events.js';
import type { WorldInstance, WorldState } from '../types/world.js';
import type { Guardrail } from '../types/guardrail.js';
import { toSpecV2 } from '../schemas/agent-spec-v2.js';
import { createSession } from './agent-session.js';
import type { TickMemory } from './memory.js';

/**
 * **`forkSession`** (WP66, `54-FORK-EXPLAIN.md` §4.1; `41-…` §6.9): a new
 * run that begins where a stored one was after tick *n* — the world put
 * back, the memory window and the notebook refilled from the origin's rows,
 * usage and the guardrails' history restored — and then the ordinary loop
 * from tick *n+1*, with or without a changed spec, guard stack or world.
 * The counterfactual is answered by running it.
 *
 * Exact or refused (§3.2): a world with `restore` is put back wholesale; one
 * without it is rebuilt by replaying the recorded calls and checked against
 * the recorded snapshot, and a mismatch throws before anything runs. The
 * random stream's position is not on the trace (§2 item 3), so the fork's
 * `random` is the caller's, as the origin's was.
 */
export interface ForkFrom {
	/** The origin's events, in order — the stored trace. */
	events: readonly EngineEvent[];
	/** The last tick the fork keeps; the new run's first tick is `tick + 1`. */
	tick: number;
}

export interface ForkOverrides {
	/** The counterfactual build; the goal card must be the origin's. */
	spec?: AnyAgentSpec;
	/** Guardrails beside the ones the spec's bricks install. */
	guardrails?: Guardrail[];
	/** A world already put where the caller wants it — the general door for an injected or re-seated one. */
	world?: WorldInstance;
}

export interface ForkOptions {
	from: ForkFrom;
	overrides?: ForkOverrides;
}

const goalCardOf = (spec: AnyAgentSpec): string => toSpecV2(spec).goalCardId;

/** The events of the origin through tick `tick`, `run.started` included. */
export function eventsThrough(events: readonly EngineEvent[], tick: number): EngineEvent[] {
	return events.filter((event) => event.tick <= tick);
}

/** How many times the brain was asked through tick `tick` — what a scripted provider skips to resume in step. */
export function brainTurnsThrough(events: readonly EngineEvent[], tick: number): number {
	return events.filter((event) => event.type === 'think.completed' && event.tick <= tick).length;
}

/**
 * One `TickMemory` per completed tick through `tick`, folded the way the
 * loop's own REMEMBER step builds it: the observation's short form, the
 * thought and the call from `decision`, what was done and what happened
 * from `tool.executed`/`action.performed`, the refusal from a `pre-act`
 * block or a denied approval.
 */
export function tickMemoryFrom(events: readonly EngineEvent[], tick: number): TickMemory[] {
	const out: TickMemory[] = [];
	const ticks = new Set(
		events
			.filter((event) => event.type === 'tick.completed' && event.tick <= tick)
			.map((e) => e.tick)
	);
	for (const t of [...ticks].sort((a, b) => a - b)) {
		const rows = events.filter((event) => event.tick === t);
		const sense = rows.find((event) => event.type === 'sense');
		const decision = rows.find((event) => event.type === 'decision');
		if (!sense || sense.type !== 'sense' || !decision || decision.type !== 'decision') continue;
		const entry: TickMemory = {
			tick: t,
			observation: sense.payload.observation.summary ?? sense.payload.observation.text,
			thought: decision.payload.thought
		};
		const call = decision.payload.call;
		if (call) {
			entry.call = { kind: call.kind, name: call.name, arguments: call.arguments };
			const tool = rows.find((event) => event.type === 'tool.executed');
			const action = rows.find((event) => event.type === 'action.performed');
			if (tool && tool.type === 'tool.executed') {
				entry.action = `used the ${tool.payload.name} tool`;
				entry.result = String(tool.payload.result);
				entry.ok = !rows.some(
					(event) => event.type === 'error' && event.payload.kind !== undefined
				);
			} else if (action && action.type === 'action.performed') {
				entry.action = `tried to ${action.payload.name}`;
				entry.result = action.payload.result.narration;
				entry.ok = action.payload.result.ok;
			}
			const refused = refusalIn(rows, call.name);
			if (refused !== undefined) entry.refused = refused;
		}
		out.push(entry);
	}
	return out;
}

/** The message the loop hands the next prompt when a call was stopped — a rule's block or a person's no. */
function refusalIn(rows: readonly EngineEvent[], callName: string): string | undefined {
	const resolved = rows.find((event) => event.type === 'approval.resolved');
	if (resolved && resolved.type === 'approval.resolved' && !resolved.payload.approved) {
		const requested = rows.find((event) => event.type === 'approval.requested');
		const reason = requested?.type === 'approval.requested' ? requested.payload.reason : '';
		return `You tried to ${callName}, but a person said no: ${reason}`;
	}
	const tripped = rows.find(
		(event) =>
			event.type === 'guardrail.tripped' &&
			event.payload.hook === 'pre-act' &&
			event.payload.disposition !== 'stop-run'
	);
	if (tripped && tripped.type === 'guardrail.tripped')
		return `You tried to ${callName}, but a safety rule stopped you: ${tripped.payload.reason}`;
	return undefined;
}

/** What the loop tells the next prompt after tick `tick`: a failed action's narration or a refusal, then the mumble note. */
export function feedbackAfter(events: readonly EngineEvent[], tick: number): string[] {
	const rows = events.filter((event) => event.tick === tick);
	const out: string[] = [];
	const decision = rows.find((event) => event.type === 'decision');
	if (decision?.type === 'decision') {
		const call = decision.payload.call;
		if (call) {
			const refused = refusalIn(rows, call.name);
			if (refused !== undefined) out.push(refused);
			else {
				const action = rows.find((event) => event.type === 'action.performed');
				if (action?.type === 'action.performed' && !action.payload.result.ok)
					out.push(action.payload.result.narration);
			}
		} else if (decision.payload.thought === '' && decision.payload.source !== 'reflex') {
			out.push('Your last two replies were empty. Try again, and say what you are doing.');
		}
	}
	return out;
}

/** The notebook's lines through `tick`, replayed from the notebook tool's own calls. */
export function notebookFrom(events: readonly EngineEvent[], tick: number): string[] {
	const lines: string[] = [];
	for (const event of events) {
		if (event.tick > tick || event.type !== 'tool.executed') continue;
		if (!/notebook_write$/.test(event.payload.name)) continue;
		const note = (event.payload.arguments as { note?: unknown } | undefined)?.note;
		if (typeof note === 'string') lines.push(note);
	}
	return lines;
}

/** The last `world.changed` at or before `tick` — the state the fork puts the world back to. */
export function worldStateThrough(
	events: readonly EngineEvent[],
	tick: number
): WorldState | undefined {
	let state: WorldState | undefined;
	for (const event of events) {
		if (event.tick > tick) break;
		if (event.type === 'world.changed') state = event.payload.state as WorldState;
	}
	return state;
}

const stableJson = (value: unknown): string =>
	JSON.stringify(value, (_key, entry: unknown) =>
		entry && typeof entry === 'object' && !Array.isArray(entry)
			? Object.fromEntries(Object.entries(entry as Record<string, unknown>).sort())
			: entry
	);

/** The first path at which two snapshots differ, for the refusal's message. */
function firstDifference(a: unknown, b: unknown, path = ''): string | undefined {
	if (stableJson(a) === stableJson(b)) return undefined;
	if (
		a &&
		b &&
		typeof a === 'object' &&
		typeof b === 'object' &&
		!Array.isArray(a) &&
		!Array.isArray(b)
	) {
		const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
		for (const key of keys) {
			const inner = firstDifference(
				(a as Record<string, unknown>)[key],
				(b as Record<string, unknown>)[key],
				path ? `${path}.${key}` : key
			);
			if (inner !== undefined) return inner;
		}
	}
	return path || '(root)';
}

/**
 * The world as it was after tick `tick`: `restore`d where the world can be,
 * else rebuilt by replaying the recorded calls and delivered inputs onto a
 * fresh instance and checked against the recorded snapshot.
 */
export function rebuildWorld(
	world: WorldInstance,
	events: readonly EngineEvent[],
	tick: number
): WorldInstance {
	const target = worldStateThrough(events, tick);
	if (target === undefined) return world;
	if (world.restore) {
		world.restore(structuredClone(target));
		return world;
	}
	// Replay in order, and check the rebuilt world against the recorded state at the moment that
	// state was recorded — an input delivered after the last snapshot is replayed, not compared.
	let lastSnapshotAt = -1;
	events.forEach((event, index) => {
		if (event.tick <= tick && event.type === 'world.changed') lastSnapshotAt = index;
	});
	for (const [index, event] of events.entries()) {
		if (event.tick > tick) break;
		if (event.type === 'action.performed')
			world.perform({ name: event.payload.name, arguments: event.payload.arguments });
		else if (event.type === 'input.delivered') world.receiveInput?.(event.payload.text);
		if (index === lastSnapshotAt) {
			const difference = firstDifference(world.snapshot(), target);
			if (difference !== undefined)
				throw new Error(
					`cannot fork: the world has no restore and replaying its calls through tick ${tick} differs from the recorded state at "${difference}"`
				);
		}
	}
	return world;
}

export function forkSession(deps: CreateSessionDeps, fork: ForkOptions): AgentSession {
	const { events, tick } = fork.from;
	const spec = fork.overrides?.spec ?? deps.spec;
	if (goalCardOf(spec) !== goalCardOf(deps.spec))
		throw new Error(
			`cannot fork onto goal card "${goalCardOf(spec)}": the origin ran "${goalCardOf(deps.spec)}"`
		);
	const started = events.find((event) => event.type === 'run.started');
	if (!started) throw new Error('cannot fork: the origin has no run.started');
	const completed = events.filter((event) => event.type === 'tick.completed').map((e) => e.tick);
	if (!completed.includes(tick))
		throw new Error(
			`cannot fork at tick ${tick}: the origin completed ticks ${completed.join(', ') || 'none'}`
		);

	const card = deps.registry.getGoalCard(goalCardOf(spec));
	if (!card) throw new Error(`cannot fork: goal card "${goalCardOf(spec)}" is not installed`);
	const definition = deps.registry.getWorld(card.worldId);
	if (!definition) throw new Error(`cannot fork: world "${card.worldId}" is not installed`);
	const world =
		fork.overrides?.world ??
		rebuildWorld(
			definition.create(card.layoutId, deps.options?.random ? { random: deps.options.random } : {}),
			events,
			tick
		);

	const notebook = notebookFrom(events, tick);
	const state: ForkState = {
		history: eventsThrough(events, tick),
		memory: tickMemoryFrom(events, tick),
		notebook,
		feedback: feedbackAfter(events, tick),
		usage: {
			ticks: tick,
			inputTokens: events
				.filter((e) => e.type === 'think.completed' && e.tick <= tick)
				.reduce(
					(n, e) => n + (e.type === 'think.completed' ? e.payload.response.usage.inputTokens : 0),
					0
				),
			outputTokens: events
				.filter((e) => e.type === 'think.completed' && e.tick <= tick)
				.reduce(
					(n, e) => n + (e.type === 'think.completed' ? e.payload.response.usage.outputTokens : 0),
					0
				)
		},
		forkedFrom: {
			runId: started.runId,
			tick,
			notebook: notebook.length > 0 ? 'restored' : 'empty'
		}
	};
	return createSession({
		...deps,
		spec,
		world,
		guardrails: [...(deps.guardrails ?? []), ...(fork.overrides?.guardrails ?? [])],
		options: { ...(deps.options ?? {}), parentRunId: started.runId },
		fork: state
	});
}
