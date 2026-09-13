import type { ZodType } from 'zod';
import type { EgressDeclaration } from './guardrail-service.js';
import type { Evaluator } from './evaluator.js';
import type { Guardrail } from './guardrail.js';
import type { GuardrailService } from './guardrail-service.js';
import type { PolicyCard } from '../schemas/policy-card.js';
import type { WorldActionDefinition } from './world.js';

/**
 * **Guardrail components** (WP94, `85-COMPONENTS.md` §3–§4; `83-…` §6.2;
 * decision D10; tenet 27): one contract over everything that decides — the
 * built-in rules, a policy card, a guard service, an evaluator breaker, the
 * egress rule — as an *adapter*. A component declares where it decides (its
 * points), what it can say (its verdicts), what it costs and what it
 * connects to, and `compile`s to today's `Guardrail`, built by the very
 * factory its lane uses; the session, the chain runner and every golden
 * trace are untouched. What a reader can now do is pick a guardrail up as a
 * thing, compare two, and put one on a stage boundary (WP95).
 */
export type PointKind =
	'pre-think' | 'pre-act' | 'post-act' | 'stage-in' | 'stage-out' | 'group' | 'egress';
export const POINT_KINDS: readonly PointKind[] = [
	'pre-think',
	'pre-act',
	'post-act',
	'stage-in',
	'stage-out',
	'group',
	'egress'
];

/** A place a component decides: a loop hook, a stage boundary (`at` the stage id), the two-seat chokepoint, or the egress gate (`at` a host pattern). */
export interface GuardPoint {
	kind: PointKind;
	at?: string;
}

export type ComponentVerdictKind =
	'allow' | 'block-action' | 'stop-run' | 'pause' | 'redact' | 'annotate';
export const COMPONENT_VERDICT_KINDS: readonly ComponentVerdictKind[] = [
	'allow',
	'block-action',
	'stop-run',
	'pause',
	'redact',
	'annotate'
];

export interface ComponentCost {
	class: 'free' | 'local-compute' | 'metered';
	latency: 'none' | 'local' | 'network';
	/** What a call costs, in the vendor's own words, when it is metered. */
	perCall?: string;
}

/** A component's binding to something outside the product (`83-…` §6.2.4): a declaration over the shell, never the mechanism. */
export interface Connection {
	kind: 'hosted' | 'local' | 'policy-engine';
	/** What it wraps: `google/model-armor`, `azure/content-safety`, `meta/llama-guard-4`, `open-policy-agent`, … */
	wraps: string;
	/** The credential id the host's vault holds it under, as `BrickKindDefinition.credential` names one. */
	credential?: string;
	egress: EgressDeclaration[];
	browserCapable: boolean | 'checkpoint-pending';
	/** What `createOffline` gives: a fixture, a rule, or nothing. */
	standIn: 'offline-fixture' | 'deterministic-rule' | 'none';
	checkpoint?: { takenOn: string; note: string };
	/** The vendor's API or filter version the adapter targets. */
	version?: string;
}

/** What `compile` may ask the host for: the registry's lookups and, for a connection, the session's fetch and vault. */
export interface ComponentDeps {
	getPolicyCard(id: string): PolicyCard | undefined;
	getGuardrailService(id: string): GuardrailService | undefined;
	getEvaluator(id: string): Evaluator | undefined;
	getAction(id: string): WorldActionDefinition | undefined;
	fetch?: typeof globalThis.fetch;
	getCredential?: (id: string) => string | undefined;
	/** How a guard service screens: offline (the stand-in) or live, with a timeout. Offline when absent. */
	screening?: { offline: boolean; timeoutMs?: number };
}

export interface GuardrailComponent<Config = unknown> {
	id: string;
	name: string;
	description: string;
	/** The catalogue entry it implements (`86-…`): `input-classifier`, `policy-as-code`, `budget-cap`, … */
	technique: string;
	points: PointKind[];
	verdicts: ComponentVerdictKind[];
	cost: ComponentCost;
	/** Absent for a bespoke component. */
	connection?: Connection;
	configSchema: ZodType<Config>;
	/** One sentence a reviewer can read, for this config. */
	explain(config: Config): string;
	/**
	 * The thing the session runs — today's `Guardrail`, built by the lane's
	 * own factory, stamped with `componentId` and `point` so the events say
	 * where the verdict came from. A component at a loop point returns
	 * guardrails on that hook; at a boundary point, guardrails the workflow
	 * runtime reads at the boundary (WP95); at the egress point, none.
	 */
	compile(config: Config, deps: ComponentDeps, point: GuardPoint): Guardrail[];
}

/** The loop hook a point maps to; undefined for a boundary, the group chokepoint and the egress gate. */
export function pointHook(point: GuardPoint): 'pre-think' | 'pre-act' | 'post-act' | undefined {
	return point.kind === 'pre-think' || point.kind === 'pre-act' || point.kind === 'post-act'
		? point.kind
		: undefined;
}

/** Stamp a compiled chain with the component and the point it was compiled for. */
export function stampComponent(
	guardrails: readonly Guardrail[],
	componentId: string,
	point: GuardPoint
): Guardrail[] {
	return guardrails.map((guardrail) => ({ ...guardrail, componentId, point }));
}

/** What is wrong with a component's declaration, in words; empty when it is sound. */
export function describeComponentProblems(component: GuardrailComponent): string[] {
	const problems: string[] = [];
	if (!component.id || !component.id.includes('/')) problems.push('has no qualified id');
	if (!component.technique) problems.push('names no technique');
	if (component.points.length === 0) problems.push('declares no point');
	for (const point of component.points)
		if (!POINT_KINDS.includes(point)) problems.push(`declares an unknown point "${point}"`);
	if (component.verdicts.length === 0) problems.push('declares no verdict');
	for (const verdict of component.verdicts)
		if (!COMPONENT_VERDICT_KINDS.includes(verdict))
			problems.push(`declares an unknown verdict "${verdict}"`);
	if (component.connection) {
		if (component.connection.kind === 'hosted' && component.cost.class === 'free')
			problems.push('claims a free cost over a hosted connection');
		if (component.connection.egress.length === 0 && component.connection.kind !== 'local')
			problems.push('declares a connection with no egress');
	} else if (component.cost.class === 'metered') {
		problems.push('claims a metered cost with no connection');
	}
	if (typeof component.explain !== 'function' || typeof component.compile !== 'function')
		problems.push('lacks explain or compile');
	return problems;
}
