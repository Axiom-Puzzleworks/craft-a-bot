import type {
	GuardrailComponent,
	PackRegistry,
	PointKind,
	Principal,
	Stack,
	StackFit
} from '@craftabot/core';
import { localContentId } from '@craftabot/core';
import { browserRefusal } from '@craftabot/governance';

/**
 * **The Guardrail Studio's folds** (WP101, `88-STUDIO.md` §3; `83-…` §6.3):
 * pure over a stack under construction — a fit placed at a point by a drag
 * or by the keyboard goes through the one `fitAt`, so the two produce the
 * same stack by construction; the catalogue's filters; a component's
 * connection as a lamp word; the one-cell campaign the test bench runs a
 * stack through; the stack as a content record. The page draws.
 */
export interface StudioPoint {
	kind: PointKind;
	at?: string | undefined;
}

export const LOOP_POINTS: readonly PointKind[] = ['pre-think', 'pre-act', 'post-act'];

export function emptyStack(author: Principal, now: string, name = 'A new stack'): Stack {
	return {
		schemaVersion: 1,
		id: localContentId('stack', slugOf(name)),
		name,
		description: 'Built in the Studio.',
		fit: [],
		provenance: { author, createdAt: now }
	};
}

export function slugOf(name: string): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return slug === '' ? 'stack' : slug;
}

/** A fit at a point: refused when the component does not decide there; a second fit of the same component at the same point is the same stack. */
export function fitAt(
	stack: Stack,
	component: GuardrailComponent,
	point: StudioPoint,
	config?: unknown
): { ok: true; stack: Stack } | { ok: false; reason: string } {
	if (!component.points.includes(point.kind)) {
		return {
			ok: false,
			reason: `${component.name} does not decide at ${point.kind}; it decides at ${component.points.join(', ')}.`
		};
	}
	const already = stack.fit.some(
		(fit) =>
			fit.componentId === component.id &&
			fit.point.kind === point.kind &&
			(fit.point.at ?? undefined) === (point.at ?? undefined)
	);
	if (already) return { ok: true, stack };
	const entry: StackFit = {
		componentId: component.id,
		point: { kind: point.kind, ...(point.at !== undefined ? { at: point.at } : {}) },
		...(config !== undefined ? { config } : {})
	};
	return { ok: true, stack: { ...stack, fit: [...stack.fit, entry] } };
}

export function unfit(stack: Stack, index: number): Stack {
	return { ...stack, fit: stack.fit.filter((_fit, at) => at !== index) };
}

export function configure(stack: Stack, index: number, config: unknown): Stack {
	return {
		...stack,
		fit: stack.fit.map((fit, at) => (at === index ? { ...fit, config } : fit))
	};
}

export function renamed(stack: Stack, name: string): Stack {
	return { ...stack, id: localContentId('stack', slugOf(name)), name };
}

// ── The catalogue ────────────────────────────────────────────────────────

export interface CatalogueFilter {
	point?: PointKind | '' | undefined;
	verdict?: string | undefined;
	cost?: string | undefined;
	connection?: 'none' | 'local' | 'hosted' | '' | undefined;
	technique?: string | undefined;
}

export function filterComponents(
	components: readonly GuardrailComponent[],
	filter: CatalogueFilter
): GuardrailComponent[] {
	return components.filter(
		(component) =>
			(!filter.point || component.points.includes(filter.point)) &&
			(!filter.verdict || (component.verdicts as string[]).includes(filter.verdict)) &&
			(!filter.cost || component.cost.class === filter.cost) &&
			(!filter.connection || (component.connection?.kind ?? 'none') === filter.connection) &&
			(!filter.technique || component.technique === filter.technique)
	);
}

/** The components grouped by technique, each group in id order. */
export function groupByTechnique(
	components: readonly GuardrailComponent[]
): Array<{ technique: string; components: GuardrailComponent[] }> {
	const groups = new Map<string, GuardrailComponent[]>();
	for (const component of [...components].sort((a, b) => a.id.localeCompare(b.id))) {
		const group = groups.get(component.technique) ?? [];
		group.push(component);
		groups.set(component.technique, group);
	}
	return [...groups.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([technique, entries]) => ({ technique, components: entries }));
}

export type ConnectionLamp =
	| { word: 'built in'; status: 'pass' }
	| { word: 'connected'; status: 'pass' }
	| { word: 'stand-in'; status: 'inconclusive' }
	| { word: 'needs a battery'; status: 'inconclusive' }
	| { word: 'harness only'; status: 'fail' };

/** A component's connection as the lamp the catalogue card shows (§6.3): connected, stand-in, needs a battery, harness only. */
export function connectionLamp(
	component: GuardrailComponent,
	registry: Pick<PackRegistry, 'getGuardrailService'>,
	hasCredential: (credentialId: string) => boolean
): ConnectionLamp {
	const connection = component.connection;
	if (!connection) return { word: 'built in', status: 'pass' };
	if (browserRefusal(connection)) return { word: 'harness only', status: 'fail' };
	if (connection.kind === 'local') return { word: 'connected', status: 'pass' };
	const service = registry.getGuardrailService(component.id);
	const credentialId = service?.credential?.id ?? connection.credential;
	if (credentialId && !hasCredential(credentialId)) {
		return { word: 'needs a battery', status: 'inconclusive' };
	}
	return connection.checkpoint
		? { word: 'connected', status: 'pass' }
		: { word: 'stand-in', status: 'inconclusive' };
}

// ── The test bench ───────────────────────────────────────────────────────

export interface StackTestInput {
	scenarioId: string;
	brain: 'scripted-optimal' | 'scripted-noisy';
	seed: number;
	/** Each stack becomes a guard of the one campaign; the flows are read back per guard. */
	stacks: readonly Stack[];
}

/**
 * The one-cell campaign the bench runs (§5): the scenario under one build and
 * one brain, a guard per stack — the stack's loop fits as the guard's
 * `components`, since a scenario runs the loop and no stage. A workflow's
 * boundary fits are the Pipeline's what-if to test, not the bench's.
 */
export function stackTestCampaign(input: StackTestInput): unknown {
	return {
		schemaVersion: 1,
		id: 'studio-stack-test',
		title: `The Studio: ${input.scenarioId} through ${input.stacks.map((stack) => stack.name).join(' and ')}`,
		scenarios: [{ id: input.scenarioId, scenarioId: input.scenarioId }],
		builds: [{ id: 'starter-default', base: { kind: 'starter-default' } }],
		guards: input.stacks.map((stack) => ({
			id: stack.id,
			fit: [],
			components: stack.fit
				.filter((fit) => LOOP_POINTS.includes(fit.point.kind as PointKind))
				.map((fit) => ({
					id: fit.componentId,
					...(fit.config !== undefined ? { config: fit.config } : {}),
					point: { kind: fit.point.kind }
				}))
		})),
		brains: [{ id: input.brain, tier: input.brain }],
		seeds: [input.seed],
		// The schema wants a gate; the bench is not a trial, so its one gate asks nothing (an outcome rate of at least none).
		gates: [
			{
				id: 'studio-ran',
				require: { kind: 'outcome-rate', outcome: 'SUCCESS', atLeast: 0 }
			}
		]
	};
}

// ── The content record ───────────────────────────────────────────────────

export function stackRecord(stack: Stack, savedAt: string) {
	return {
		id: stack.id,
		kind: 'stack' as const,
		title: stack.name,
		record: stack,
		savedAt,
		schemaVersion: 1 as const
	};
}
