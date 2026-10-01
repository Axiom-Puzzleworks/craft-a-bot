import { stackSchema, type PackRegistry, type Stack } from '@craftabot/core';
import type { ConformanceIssue } from '../types.js';

export interface StackCheckOptions {
	/** Whether every component the stack names must be registered (default `true`); a pack whose companions do not ship them sets `false` and the host's own test resolves. */
	resolve?: boolean;
	/** Whether a component with a connection needs a stand-in — a browser edition (default `true`). */
	browser?: boolean;
	/** The obligation vocabulary a stack's `obligations` must come from (WP135); absent, they are not checked. */
	knownObligations?: readonly string[];
	/** The control-map rows a stack's `controls` may claim, `{mapId}/{ref}` (WP135); absent, they are not checked. */
	knownControls?: readonly string[];
}

/**
 * **A stack's conformance** (WP97, `89-STACKS.md` §7): its refusals.
 *
 * - `stack.well-formed` — the schema, and the chokepoint is the `group` half, never a fit at `group`.
 * - `stack.point` — every fit names a component the registry has, at a point the component declares, with a config its schema takes.
 * - `stack.capacity` — the same component twice at one point with the same config: the socket is over capacity for nothing.
 * - `stack.stand-in` — a component with a connection and no stand-in cannot fit a browser edition.
 * - `stack.claims` — with `knownObligations` or `knownControls`, every obligation and control row the stack claims exists (WP135).
 */
export function checkStack(
	stack: Stack,
	registry: Pick<PackRegistry, 'getGuardrailComponent'>,
	options: StackCheckOptions = {}
): ConformanceIssue[] {
	const issues: ConformanceIssue[] = [];
	const parsed = stackSchema.safeParse(stack);
	if (!parsed.success) {
		issues.push({ check: 'stack.well-formed', message: `"${stack.id}" ${parsed.error.message}` });
		return issues;
	}
	const seen = new Set<string>();
	for (const [index, fit] of stack.fit.entries()) {
		if (fit.point.kind === 'group') {
			issues.push({
				check: 'stack.well-formed',
				message: `"${stack.id}" fit ${index} sits at the chokepoint; the group half is the stack's \`group\``
			});
			continue;
		}
		const key = `${fit.componentId}@${fit.point.kind}${fit.point.at ? '@' + fit.point.at : ''}:${JSON.stringify(fit.config ?? null)}`;
		if (seen.has(key)) {
			issues.push({
				check: 'stack.capacity',
				message: `"${stack.id}" fits ${fit.componentId} at ${fit.point.kind} twice with the same config`
			});
		}
		seen.add(key);
		const component = registry.getGuardrailComponent(fit.componentId);
		if (!component) {
			if (options.resolve !== false) {
				issues.push({
					check: 'stack.point',
					message: `"${stack.id}" names component "${fit.componentId}", which nothing ships`
				});
			}
			continue;
		}
		if (!component.points.includes(fit.point.kind as (typeof component.points)[number])) {
			issues.push({
				check: 'stack.point',
				message: `"${stack.id}" fits ${fit.componentId} at ${fit.point.kind}, where it cannot decide (${component.points.join(', ')})`
			});
		}
		const config = component.configSchema.safeParse(fit.config ?? {});
		if (!config.success) {
			issues.push({
				check: 'stack.point',
				message: `"${stack.id}" gives ${fit.componentId} a config it refuses: ${config.error.message}`
			});
		}
		if (
			options.browser !== false &&
			component.connection &&
			component.connection.standIn === 'none'
		) {
			issues.push({
				check: 'stack.stand-in',
				message: `"${stack.id}" fits ${fit.componentId}, a connection with no stand-in, which a browser edition cannot run`
			});
		}
	}
	// WP135 (`110-…` G106): a claim names something that exists — the lending stack had claimed an
	// obligation tag no vocabulary holds, and nothing said so.
	if (options.knownObligations) {
		const known = new Set(options.knownObligations);
		for (const tag of stack.obligations ?? [])
			if (!known.has(tag))
				issues.push({
					check: 'stack.claims',
					message: `"${stack.id}" claims obligation "${tag}", which is not in the obligation vocabulary`
				});
	}
	if (options.knownControls) {
		const known = new Set(options.knownControls);
		for (const control of stack.controls ?? [])
			if (!known.has(control))
				issues.push({
					check: 'stack.claims',
					message: `"${stack.id}" claims control row "${control}", which no registered control map has`
				});
	}
	return issues;
}
