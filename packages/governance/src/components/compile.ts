import type { ComponentDeps, GuardPoint, Guardrail, PackRegistry } from '@craftabot/core';

/** The deps a host hands `compile`: the registry's four lookups, and whatever of the session's fetch, vault and screening the host chooses to add. */
export function componentDepsFor(
	registry: Pick<
		PackRegistry,
		'getPolicyCard' | 'getGuardrailService' | 'getEvaluator' | 'getAction'
	>,
	extras: Pick<ComponentDeps, 'fetch' | 'getCredential' | 'screening'> = {}
): ComponentDeps {
	return {
		getPolicyCard: (id) => registry.getPolicyCard(id),
		getGuardrailService: (id) => registry.getGuardrailService(id),
		getEvaluator: (id) => registry.getEvaluator(id),
		getAction: (id) => registry.getAction(id),
		...(extras.fetch ? { fetch: extras.fetch } : {}),
		...(extras.getCredential ? { getCredential: extras.getCredential } : {}),
		...(extras.screening ? { screening: extras.screening } : {})
	};
}

/** One fit of a component at a point, with its config — a stack's row, a campaign guard's entry (WP94, `85-…` §6). */
export interface ComponentFit {
	id: string;
	config?: unknown;
	point?: GuardPoint;
}

/**
 * Compile a list of fits to the chain the session runs, in order: each
 * component looked up in the registry, its config parsed by its own schema,
 * its `compile` called for its point (the component's first declared point
 * when the fit names none). Throws on an unknown component or a config its
 * schema refuses — a stack that cannot compile must not run half-fitted.
 */
export function compileComponents(
	fits: readonly ComponentFit[],
	registry: Pick<PackRegistry, 'getGuardrailComponent'>,
	deps: ComponentDeps
): Guardrail[] {
	const chain: Guardrail[] = [];
	for (const fit of fits) {
		const component = registry.getGuardrailComponent(fit.id);
		if (!component) throw new Error(`no guardrail component '${fit.id}' is registered`);
		const point = fit.point ?? { kind: component.points[0] ?? 'pre-act' };
		if (!component.points.includes(point.kind)) {
			throw new Error(
				`component '${fit.id}' cannot decide at ${point.kind}; it decides at ${component.points.join(', ')}`
			);
		}
		const parsed = component.configSchema.safeParse(fit.config ?? {});
		if (!parsed.success) {
			throw new Error(`component '${fit.id}' refuses its config: ${parsed.error.message}`);
		}
		chain.push(...component.compile(parsed.data, deps, point));
	}
	return chain;
}
