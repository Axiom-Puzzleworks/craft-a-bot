import { migrateBrickConfig } from '../brick-config.js';
import type { PackRegistry } from '../pack-registry.js';
import { toSpecV2, type AnyAgentSpec } from '../schemas/agent-spec-v2.js';
import type { Guardrail } from '../types/guardrail.js';
import type {
	BrickRuntime,
	BrickRuntimeContext,
	CallContribution,
	ContextContribution,
	SlotId,
	TickContext,
	TickRecord
} from '../types/brick.js';

/**
 * **Fitting the bricks** (`14-…` §2.1, WP14 slice 3).
 *
 * Until now the loop read a bot by name — `spec.bricks.llm?.personality`,
 * `spec.bricks.memory?.windowSize` — which is the taxonomy problem (`12-…` D11)
 * expressed as control flow. Six `if`s, and a seventh brick could never join
 * them.
 *
 * Here the loop instead asks *what is fitted to this chassis, and what does each
 * one contribute?* A brick contributes only what it is: the Brain brick a
 * sentence of personality and nothing else, the Safety brick policy and no
 * prose. Core calls the hooks in slot order and concatenates; it never asks what
 * kind of brick it is talking to, which is the whole point.
 */

/** One fitted brick, paired with the runtime it produced. */
export interface FittedRuntime {
	slot: SlotId;
	kind: string;
	/** The kind's display name, for the "parts you were built with" line. */
	name: string;
	runtime: BrickRuntime;
}

/**
 * Slot order, which is prompt order.
 *
 * Fixed rather than taken from the spec's array order, because the prompt a bot
 * reads should not change because somebody snapped their bricks on in a
 * different sequence.
 *
 * The order is v1's — brain, memory, equipment, perception, mobility, safety —
 * and deliberately so: it is what `describeFittedBricks` has always produced,
 * what the migration writes, and what the parts tray shows. Slice 3's gate is
 * that a golden trace stays byte-stable, and a prettier order would spend that
 * on nothing.
 *
 * `'planner'` (WP30 stage A) is appended right after `brain` — brain-adjacent,
 * per `14-…` §5.1 — rather than reordering anything: no bot built before this
 * stage has a planner brick fitted, so inserting a new entry cannot move any
 * existing one and the golden trace stays exactly as byte-stable as it was.
 */
const SLOT_ORDER: SlotId[] = [
	'brain',
	'planner',
	'memory',
	'equipment',
	'perception',
	'mobility',
	'safety'
];

export interface BuildRuntimesOptions {
	spec: AnyAgentSpec;
	registry: PackRegistry;
	context: BrickRuntimeContext;
}

/**
 * Build a runtime for every fitted brick whose kind provides one.
 *
 * Three things are skipped in silence, all of them already reported by
 * `validateSpec` as build problems: a kind no pack registered, a config that
 * does not parse, and a kind with no `createRuntime` at all. The last is not an
 * error — a brick that is pure configuration is legal, and `14-…` §2.1 says so.
 * The session is not the place to re-litigate a build the user has already been
 * told about; it either runs the bot it was given or it does not start.
 */
export function buildRuntimes(options: BuildRuntimesOptions): FittedRuntime[] {
	const { registry, context } = options;
	const spec = toSpecV2(options.spec);
	const built: FittedRuntime[] = [];

	for (const slot of SLOT_ORDER) {
		for (const brick of spec.bricks.filter((fitted) => fitted.slot === slot)) {
			const kind = registry.getBrickKind(brick.kind);
			if (!kind || kind.slot !== brick.slot) continue;

			const migrated = migrateBrickConfig(brick.config, brick.configVersion, kind);
			const config = kind.configSchema.safeParse(migrated);
			if (!config.success) continue;
			if (!kind.createRuntime) continue;

			built.push({
				slot: brick.slot,
				kind: brick.kind,
				name: kind.name,
				runtime: kind.createRuntime(config.data, context)
			});
		}
	}

	return built;
}

/**
 * Every brick's prompt sections, in slot order.
 *
 * Additive by construction: a brick appends its own lines and cannot rewrite
 * anybody else's, which is what keeps the composed prompt in the Flight
 * Recorder something a person can read top to bottom and attribute.
 */
export function collectContext(
	runtimes: readonly FittedRuntime[],
	tick: TickContext
): ContextContribution {
	const sections: string[] = [];
	for (const fitted of runtimes) {
		const contribution = fitted.runtime.contributeContext?.(tick);
		for (const section of contribution?.sections ?? []) {
			if (section.trim() !== '') sections.push(section);
		}
	}
	return { sections };
}

/**
 * Everything the fitted bricks offer the model, in slot order.
 *
 * Ids only — core resolves them against the registry and the world exactly as
 * it did when it read them off the spec, so a brick names a capability and
 * never has to carry the machinery for dispatching one (`14-…` §2.1).
 *
 * Duplicates are kept rather than merged: two bricks offering the same call is
 * a build the wire-name collision check should refuse loudly, not something to
 * paper over here.
 */
export function collectCalls(runtimes: readonly FittedRuntime[]): Required<CallContribution> {
	const toolIds: string[] = [];
	const actionIds: string[] = [];
	for (const fitted of runtimes) {
		const contribution = fitted.runtime.contributeCalls?.();
		toolIds.push(...(contribution?.toolIds ?? []));
		actionIds.push(...(contribution?.actionIds ?? []));
	}
	return { toolIds, actionIds };
}

/**
 * Every sense channel the fitted bricks open, in slot order.
 *
 * Ids only, resolved against the world exactly as they were when core read
 * them off the spec. Duplicates are kept: two bricks opening the same channel
 * is a build question, not something to quietly tidy here.
 */
export function collectSenses(runtimes: readonly FittedRuntime[]): string[] {
	const channels: string[] = [];
	for (const fitted of runtimes) channels.push(...(fitted.runtime.contributeSenses?.() ?? []));
	return channels;
}

/**
 * Every fitted brick's own world config, merged into one bag keyed by
 * sense-channel or action id (WP31 stage F, `types/brick.ts`'s own
 * `contributeWorldConfig`).
 *
 * Merged rather than kept as a list, unlike `collectSenses`/`collectCalls`:
 * this bag is looked up by key, not iterated, so a later brick's entry for a
 * key an earlier one also used simply wins — the same "a brick fitting the
 * same slot twice is a build question, not something to arbitrate here"
 * stance those two already take, just expressed as last-write instead of
 * duplication, because a `Record` cannot hold two values under one key.
 */
export function collectWorldConfig(runtimes: readonly FittedRuntime[]): Record<string, unknown> {
	const config: Record<string, unknown> = {};
	for (const fitted of runtimes) Object.assign(config, fitted.runtime.contributeWorldConfig?.());
	return config;
}

/**
 * Every rule the fitted bricks install, in slot order (WP14 slice 3d).
 *
 * This is the hook `14-…` §2.1 declared and nothing implemented: until now a
 * fitted Safety Brick became running guardrails in `guardrailsForSpec`, a
 * compiler in `governance` that read `spec.bricks.safety` by name. That worked
 * for exactly one brick and no others — a Monitor brick could watch nothing,
 * because there was no way for a second brick to contribute policy without a
 * core change. Now policy arrives the way tools and senses do.
 *
 * Order is slot order, and *within* a brick the order its runtime returned,
 * because the chain stops at the first non-allow verdict (`08-…` §2): a rule
 * that refuses outright must be asked before one that puts a decision to a
 * human. A brick therefore owns the order of its own rules, and core owns the
 * order between bricks — the same division as everywhere else here.
 */
export function collectGuardrails(runtimes: readonly FittedRuntime[]): Guardrail[] {
	const guardrails: Guardrail[] = [];
	for (const fitted of runtimes)
		guardrails.push(...(fitted.runtime.contributeGuardrails?.() ?? []));
	return guardrails;
}

/** Tell every brick that learns from a tick what happened in it. */
export function notifyTickEnd(runtimes: readonly FittedRuntime[], record: TickRecord): void {
	for (const fitted of runtimes) fitted.runtime.onTickEnd?.(record);
}

/** Let every brick put itself away. Called once, when the run is over. */
export function disposeRuntimes(runtimes: readonly FittedRuntime[]): void {
	for (const fitted of runtimes) fitted.runtime.dispose?.();
}
