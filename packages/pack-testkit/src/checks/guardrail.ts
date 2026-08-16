import { guardrailVerdictSchema, type Guardrail, type GuardrailContext } from '@craftabot/core';
import type { ConformanceIssue } from '../types.js';

/**
 * "Every guardrail: pure over `GuardrailContext`; verdict shape legal;
 * description present" (`13-…` §7).
 *
 * Purity is checked two ways: the context handed to `check` must come back
 * byte-identical (a guardrail observes, it never mutates — `08-…` §2), and
 * two independent calls with deep-equal-but-distinct context objects must
 * return deep-equal verdicts.
 */
export async function checkGuardrail(
	guardrail: Guardrail,
	context: GuardrailContext
): Promise<ConformanceIssue[]> {
	const issues: ConformanceIssue[] = [];

	if (!guardrail.description || guardrail.description.trim() === '') {
		issues.push({
			check: 'guardrail.description-present',
			message: `"${guardrail.id}" has no description`
		});
	}

	const contextA = structuredClone(context);
	const before = JSON.stringify(contextA);
	const verdictA = await guardrail.check(contextA);
	const after = JSON.stringify(contextA);
	if (before !== after) {
		issues.push({ check: 'guardrail.pure', message: `"${guardrail.id}" mutated its context` });
	}

	const parsed = guardrailVerdictSchema.safeParse(verdictA);
	if (!parsed.success) {
		issues.push({
			check: 'guardrail.verdict-shape',
			message: `"${guardrail.id}" returned a verdict outside the closed union: ${parsed.error.message}`
		});
	}

	const contextB = structuredClone(context);
	const verdictB = await guardrail.check(contextB);
	if (JSON.stringify(verdictA) !== JSON.stringify(verdictB)) {
		issues.push({
			check: 'guardrail.deterministic',
			message: `"${guardrail.id}" returned different verdicts for two deep-equal contexts`
		});
	}

	return issues;
}
