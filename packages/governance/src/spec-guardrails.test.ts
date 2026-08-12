import { describe, expect, it } from 'vitest';
import { ACTION_BLOCKLIST_ID } from './guardrails/action-blocklist.js';
import { APPROVAL_MODE_ID } from './guardrails/approval-mode.js';
import { STEP_BUDGET_ID } from './guardrails/step-budget.js';
import { guardrailsForSpec } from './spec-guardrails.js';
import { specWithSafety } from './test-context.js';

/**
 * The compiler from Safety Brick data to running guardrails — the seam V1.x
 * policy cards will later join (08-GOVERNANCE-GUARDRAILS.md §5).
 */

const ids = (spec: Parameters<typeof guardrailsForSpec>[0]) =>
	guardrailsForSpec(spec).map((guardrail) => guardrail.id);

describe('guardrailsForSpec', () => {
	it('produces nothing when no Safety Brick is fitted', () => {
		// The engine floor still applies; that is core's business, not policy's.
		expect(guardrailsForSpec(specWithSafety())).toStrictEqual([]);
	});

	it('always installs the step budget when a brick is fitted', () => {
		const spec = specWithSafety({ maxTicks: 12, blockedActions: [], approvalMode: false });
		expect(ids(spec)).toStrictEqual([STEP_BUDGET_ID]);
	});

	it('installs the blocklist only when something is actually blocked', () => {
		const withBlocks = specWithSafety({
			maxTicks: 12,
			blockedActions: ['open'],
			approvalMode: false
		});
		expect(ids(withBlocks)).toStrictEqual([STEP_BUDGET_ID, ACTION_BLOCKLIST_ID]);
	});

	it('installs approval mode when the toggle is on', () => {
		const spec = specWithSafety({ maxTicks: 12, blockedActions: [], approvalMode: true });
		expect(ids(spec)).toStrictEqual([STEP_BUDGET_ID, APPROVAL_MODE_ID]);
	});

	it('orders the blocklist ahead of approval mode', () => {
		// An action the builder already forbade should be refused outright, not
		// offered to a human as a choice they only appear to have.
		const spec = specWithSafety({
			maxTicks: 12,
			blockedActions: ['open'],
			approvalMode: true
		});
		expect(ids(spec)).toStrictEqual([STEP_BUDGET_ID, ACTION_BLOCKLIST_ID, APPROVAL_MODE_ID]);
	});

	it('passes the dial through to the step budget it builds', () => {
		const spec = specWithSafety({ maxTicks: 7, blockedActions: [], approvalMode: false });
		const [stepBudget] = guardrailsForSpec(spec);
		expect(stepBudget?.description).toBe('Stops the run after 7 turns.');
	});
});
