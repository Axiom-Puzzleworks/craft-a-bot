import type { AgentSpec, Guardrail } from '@craftabot/core';
import { createActionBlocklistGuardrail } from './guardrails/action-blocklist.js';
import { createApprovalModeGuardrail } from './guardrails/approval-mode.js';
import { createNoRepetitionGuardrail } from './guardrails/no-repetition.js';
import { createStepBudgetGuardrail } from './guardrails/step-budget.js';

/**
 * Turns a fitted Safety Brick into running guardrails — the one place the
 * brick's *data* becomes *behaviour*.
 *
 * Everything upstream of here treats the brick as plain configuration that
 * serialises into a kit file, and everything downstream sees only the
 * `Guardrail` interface. That seam is what lets V1.x policy cards
 * (08-GOVERNANCE-GUARDRAILS.md §5) arrive as a second compiler beside this one
 * without the engine changing at all, and it is why this function lives in
 * `governance` rather than in `core` or in a pack.
 *
 * Order matters, because the chain stops at the first non-allow verdict
 * (§2). Blocklist before approval mode: an action the builder has already
 * forbidden should be refused outright rather than presented to a human as a
 * decision they appear to be free to make. No-repetition sits between them —
 * after the flat prohibitions, but before a human is asked to approve the
 * fourth identical attempt at something that has plainly stopped working.
 */
export function guardrailsForSpec(spec: AgentSpec): Guardrail[] {
	const safety = spec.bricks.safety;
	if (!safety) return [];

	const guardrails: Guardrail[] = [createStepBudgetGuardrail(safety.maxTicks)];

	// An empty list would allow everything on every check; the trace is easier to
	// read without a rule that cannot possibly fire.
	if (safety.blockedActions.length > 0) {
		guardrails.push(createActionBlocklistGuardrail(safety.blockedActions));
	}
	if (safety.repeatLimit !== undefined) {
		guardrails.push(createNoRepetitionGuardrail(safety.repeatLimit));
	}
	if (safety.approvalMode) guardrails.push(createApprovalModeGuardrail());

	return guardrails;
}
