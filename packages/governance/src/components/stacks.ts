import type {
	ComponentDeps,
	Guardrail,
	PackRegistry,
	PointKind,
	Stack,
	StageSpec
} from '@craftabot/core';
import { compileComponents, componentDepsFor, type ComponentFit } from './compile.js';

/**
 * **A stack's fits, by where they run** (WP97, `89-STACKS.md` §4): the loop
 * fits go on a session's chain, the boundary fits at a stage (all stages
 * when the fit names none), the egress fits to the host that sets the
 * session's mode. The chokepoint is the stack's `group` half, not a fit —
 * `stackGroupOf` hands it over in a campaign guard's shape.
 */
const LOOP_POINTS: ReadonlySet<string> = new Set(['pre-think', 'pre-act', 'post-act']);

function toFit(entry: Stack['fit'][number], at?: string): ComponentFit {
	const fit: ComponentFit = {
		id: entry.componentId,
		point: {
			kind: entry.point.kind as PointKind,
			...(at !== undefined ? { at } : entry.point.at !== undefined ? { at: entry.point.at } : {})
		}
	};
	if (entry.config !== undefined) fit.config = entry.config;
	return fit;
}

/** The fits a session's chain runs, in the stack's order. */
export function stackLoopFits(stack: Stack): ComponentFit[] {
	return stack.fit
		.filter((entry) => LOOP_POINTS.has(entry.point.kind))
		.map((entry) => toFit(entry));
}

/** The fits a stage's boundary runs: those at `stage-in`/`stage-out` naming this stage or no stage, stamped with it. */
export function stackBoundaryFits(stack: Stack, stageId: string): ComponentFit[] {
	return stack.fit
		.filter(
			(entry) =>
				(entry.point.kind === 'stage-in' || entry.point.kind === 'stage-out') &&
				(entry.point.at === undefined || entry.point.at === stageId)
		)
		.map((entry) => toFit(entry, stageId));
}

/** The egress components a stack fits, for the host that sets the session's mode. */
export function stackEgressFits(stack: Stack): ComponentFit[] {
	return stack.fit.filter((entry) => entry.point.kind === 'egress').map((entry) => toFit(entry));
}

/** The chokepoint half in a campaign guard's `group` shape, or nothing. */
export function stackGroupOf(stack: Stack):
	| {
			watchFor: string[];
			refusalLimit?: number;
			breakOn: Array<{ evaluatorId: string; labels?: string[]; onFail?: boolean }>;
	  }
	| undefined {
	if (!stack.group) return undefined;
	return {
		watchFor: [...stack.group.watchFor],
		...(stack.group.refusalLimit !== undefined ? { refusalLimit: stack.group.refusalLimit } : {}),
		breakOn: stack.group.breakOn.map((entry) => ({
			evaluatorId: entry.evaluatorId,
			...(entry.labels ? { labels: [...entry.labels] } : {}),
			...(entry.onFail !== undefined ? { onFail: entry.onFail } : {})
		}))
	};
}

/** The stack's loop chain, compiled: what the Safety brick's `stack` config and a journey's `stack` run. */
export function compileStackLoop(
	stack: Stack,
	registry: Pick<
		PackRegistry,
		'getGuardrailComponent' | 'getPolicyCard' | 'getGuardrailService' | 'getEvaluator' | 'getAction'
	>,
	deps: ComponentDeps = componentDepsFor(registry)
): Guardrail[] {
	return compileComponents(stackLoopFits(stack), registry, deps);
}

/** The stacks that apply at a stage under a configuration: the journey's, then the stage's own. Throws on an unknown id. */
export function stacksForStage(
	registry: Pick<PackRegistry, 'getStack'>,
	config: { stack?: string; stageStacks?: Record<string, string> } | undefined,
	stage: Pick<StageSpec, 'id'>
): Stack[] {
	const ids = [config?.stack, config?.stageStacks?.[stage.id]].filter(
		(id): id is string => id !== undefined
	);
	return ids.map((id) => {
		const stack = registry.getStack(id);
		if (!stack) throw new Error(`no stack '${id}' is registered`);
		return stack;
	});
}
