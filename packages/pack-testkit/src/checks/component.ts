import {
	describeComponentProblems,
	guardrailVerdictSchema,
	pointHook,
	type ComponentDeps,
	type GuardPoint,
	type GuardrailComponent,
	type GuardrailContext
} from '@craftabot/core';
import type { ComponentConformanceFixture, ConformanceIssue } from '../types.js';

/**
 * **A guardrail component's conformance** (WP94, `85-COMPONENTS.md` §7):
 * the declaration is honest or refused.
 *
 * - `component.well-formed` — id, technique, points and verdicts from the closed sets, cost consistent with the connection (core's own data check).
 * - `component.config-parses` — the fixture config through `configSchema`, and `explain` non-empty for it.
 * - `component.compiles` — for every point the fixture names, `compile` returns guardrails on that point's hook (a loop point), or any guardrails at all (a boundary or the chokepoint), or none (the egress gate); every guardrail stamped with the component and the point.
 * - `component.verdicts-honest` — for every verdict the fixture supplies a context for, the compiled chain returns that kind at the point named; a verdict it declares but the fixture cannot produce is listed, not failed.
 * - `component.stand-in` — a component with a connection compiles with no fetch and no credential (offline), and its chain answers the fixture's contexts without one.
 */
export async function checkComponent(
	component: GuardrailComponent,
	fixture: ComponentConformanceFixture,
	/** The registry's lookups when the fixture names no `deps`. */
	fallbackDeps?: ComponentDeps
): Promise<ConformanceIssue[]> {
	const issues: ConformanceIssue[] = [];
	for (const problem of describeComponentProblems(component)) {
		issues.push({ check: 'component.well-formed', message: `"${component.id}" ${problem}` });
	}
	if (issues.length > 0) return issues;

	const parsed = component.configSchema.safeParse(fixture.config);
	if (!parsed.success) {
		issues.push({
			check: 'component.config-parses',
			message: `"${component.id}" refuses its own fixture config: ${parsed.error.message}`
		});
		return issues;
	}
	const config = parsed.data;
	let explanation = '';
	try {
		explanation = component.explain(config);
	} catch (error) {
		issues.push({
			check: 'component.config-parses',
			message: `"${component.id}".explain threw: ${error instanceof Error ? error.message : String(error)}`
		});
	}
	if (explanation.trim() === '') {
		issues.push({
			check: 'component.config-parses',
			message: `"${component.id}".explain returned nothing for the fixture config`
		});
	}

	const points: GuardPoint[] =
		fixture.points ?? component.points.map((kind) => ({ kind }) as GuardPoint);
	const deps: ComponentDeps | undefined = fixture.deps ?? fallbackDeps;
	if (!deps) {
		issues.push({
			check: 'component.compiles',
			message: `no deps were supplied for "${component.id}"`
		});
		return issues;
	}
	const offlineDeps: ComponentDeps = {
		getPolicyCard: deps.getPolicyCard,
		getGuardrailService: deps.getGuardrailService,
		getEvaluator: deps.getEvaluator,
		getAction: deps.getAction,
		screening: { offline: true }
	};

	for (const point of points) {
		if (!component.points.includes(point.kind)) {
			issues.push({
				check: 'component.compiles',
				message: `the fixture names ${point.kind}, which "${component.id}" does not declare`
			});
			continue;
		}
		let chain;
		try {
			chain = component.compile(config, deps, point);
		} catch (error) {
			issues.push({
				check: 'component.compiles',
				message: `"${component.id}" failed to compile at ${point.kind}: ${error instanceof Error ? error.message : String(error)}`
			});
			continue;
		}
		const hook = pointHook(point);
		if (hook !== undefined) {
			if (chain.length === 0) {
				issues.push({
					check: 'component.compiles',
					message: `"${component.id}" compiled to nothing at ${point.kind}`
				});
			}
			for (const guardrail of chain) {
				if (!guardrail.hooks.includes(hook)) {
					issues.push({
						check: 'component.compiles',
						message: `"${component.id}" compiled "${guardrail.id}" for ${point.kind} without that hook`
					});
				}
			}
		} else if (point.kind !== 'egress' && chain.length === 0) {
			issues.push({
				check: 'component.compiles',
				message: `"${component.id}" compiled to nothing at ${point.kind}`
			});
		} else if (point.kind === 'egress' && chain.length > 0) {
			issues.push({
				check: 'component.compiles',
				message: `"${component.id}" compiled a guardrail for the egress gate, which is not a chain`
			});
		}
		for (const guardrail of chain) {
			if (guardrail.componentId !== component.id || guardrail.point?.kind !== point.kind) {
				issues.push({
					check: 'component.compiles',
					message: `"${component.id}" compiled "${guardrail.id}" without its stamp for ${point.kind}`
				});
			}
		}
	}

	// The verdicts the fixture can produce, each at its point.
	for (const probe of fixture.verdicts ?? []) {
		if (!component.verdicts.includes(probe.verdict)) {
			issues.push({
				check: 'component.verdicts-honest',
				message: `the fixture probes ${probe.verdict}, which "${component.id}" does not declare`
			});
			continue;
		}
		const point = probe.point ?? points[0];
		if (!point) continue;
		const hook = pointHook(point);
		let chain;
		try {
			chain = component.compile(config, deps, point);
		} catch {
			continue; // reported above
		}
		let got: string | undefined;
		for (const guardrail of chain) {
			if (hook !== undefined && !guardrail.hooks.includes(hook)) continue;
			const verdict = await guardrail.check(probe.context as GuardrailContext);
			const shape = guardrailVerdictSchema.safeParse(verdict);
			if (!shape.success) {
				issues.push({
					check: 'component.verdicts-honest',
					message: `"${component.id}" returned a verdict outside the closed union: ${shape.error.message}`
				});
				break;
			}
			const kind =
				'pause' in verdict
					? 'pause'
					: verdict.allow
						? (verdict.verdictKind ?? 'allow')
						: verdict.disposition;
			got = kind;
			if (kind !== 'allow') break;
		}
		if (got !== probe.verdict) {
			issues.push({
				check: 'component.verdicts-honest',
				message: `"${component.id}" gave ${got ?? 'no verdict'} where the fixture expected ${probe.verdict}`
			});
		}
	}

	// A connection needs a stand-in: the chain compiles and answers with no fetch and no vault.
	if (component.connection) {
		if (component.connection.standIn === 'none') {
			issues.push({
				check: 'component.stand-in',
				message: `"${component.id}" declares a connection with no stand-in`
			});
		}
		const point = points[0];
		if (point) {
			try {
				const chain = component.compile(config, offlineDeps, point);
				const context = fixture.verdicts?.[0]?.context;
				if (context) {
					for (const guardrail of chain) await guardrail.check(context as GuardrailContext);
				}
			} catch (error) {
				issues.push({
					check: 'component.stand-in',
					message: `"${component.id}" cannot run offline: ${error instanceof Error ? error.message : String(error)}`
				});
			}
		}
	}

	return issues;
}
