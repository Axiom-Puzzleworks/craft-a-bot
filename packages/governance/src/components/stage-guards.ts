import type {
	BoundaryPoint,
	ComponentDeps,
	Guardrail,
	PackRegistry,
	StageSpec
} from '@craftabot/core';
import { compileComponents, componentDepsFor, type ComponentFit } from './compile.js';
import { POLICY_CARD_COMPONENT_ID } from './policy-card.js';
import { stackBoundaryFits } from './stacks.js';
import type { Stack } from '@craftabot/core';

/**
 * **A stage's boundary chain** (WP95, `69-WORKFLOWS.md` §10; `83-…` §6.2.3):
 * what `RunWorkflowOptions.boundaryGuardrailsFor` is — the stage's
 * `guards.policyCards` as `policy-card` components at `stage-in`, then its
 * `guards.components` at the point asked for, compiled in that order with
 * the point stamped `{ kind, at: stage.id }`. A component that cannot
 * decide at the point, or a config its schema refuses, throws — a journey
 * must not run half-guarded.
 */
export function stageBoundaryGuardrails(
	registry: Pick<
		PackRegistry,
		'getGuardrailComponent' | 'getPolicyCard' | 'getGuardrailService' | 'getEvaluator' | 'getAction'
	>,
	deps: ComponentDeps = componentDepsFor(registry),
	/** The stacks that apply at a stage (WP97): their boundary fits run after the stage's own. */
	stacksFor?: (stage: StageSpec) => readonly Stack[]
): (stage: StageSpec, point: BoundaryPoint) => Guardrail[] {
	return (stage, point) => {
		const fits: ComponentFit[] = [];
		if (point === 'stage-in') {
			for (const cardId of stage.guards?.policyCards ?? []) {
				fits.push({
					id: POLICY_CARD_COMPONENT_ID,
					config: { cardId },
					point: { kind: 'stage-in', at: stage.id }
				});
			}
		}
		for (const component of stage.guards?.components ?? []) {
			if (component.point !== point) continue;
			const fit: ComponentFit = { id: component.id, point: { kind: point, at: stage.id } };
			if (component.config !== undefined) fit.config = component.config;
			fits.push(fit);
		}
		for (const stack of stacksFor?.(stage) ?? []) {
			fits.push(...stackBoundaryFits(stack, stage.id).filter((fit) => fit.point?.kind === point));
		}
		return compileComponents(fits, registry, deps);
	};
}
