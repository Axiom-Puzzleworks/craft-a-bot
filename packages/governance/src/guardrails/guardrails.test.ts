import { describe, expect, it } from 'vitest';
import { action, context, tool } from '../test-context.js';
import { ACTION_BLOCKLIST_ID, createActionBlocklistGuardrail } from './action-blocklist.js';
import { APPROVAL_MODE_ID, createApprovalModeGuardrail } from './approval-mode.js';
import { STEP_BUDGET_ID, createStepBudgetGuardrail } from './step-budget.js';

/**
 * The three V1 rules (08-GOVERNANCE-GUARDRAILS.md §3). Each is a pure function
 * of a `GuardrailContext`, so these tests need no session and no world.
 */

describe('step budget', () => {
	const guardrail = createStepBudgetGuardrail(5);

	it('allows a turn while budget remains, and says how much is left', () => {
		const verdict = guardrail.check(
			context({ usage: { ticks: 3, inputTokens: 0, outputTokens: 0 } })
		);
		expect(verdict).toStrictEqual({ allow: true, note: '2 turns left' });
	});

	it('stops the run on the turn the budget is reached', () => {
		// `usage.ticks` already counts the current turn at pre-think, so tripping
		// on `>=` matches the engine budget's timing exactly.
		const verdict = guardrail.check(
			context({ usage: { ticks: 5, inputTokens: 0, outputTokens: 0 } })
		);
		expect(verdict).toStrictEqual({
			allow: false,
			reason: 'The step budget of 5 turns is used up.',
			disposition: 'stop-run'
		});
	});

	it('stays tripped once past the budget', () => {
		const verdict = guardrail.check(
			context({ usage: { ticks: 9, inputTokens: 0, outputTokens: 0 } })
		);
		expect(verdict).toMatchObject({ allow: false, disposition: 'stop-run' });
	});

	it('says "turn" rather than "turns" for a budget of one', () => {
		const verdict = createStepBudgetGuardrail(1).check(
			context({ usage: { ticks: 1, inputTokens: 0, outputTokens: 0 } })
		);
		expect(verdict).toMatchObject({ reason: 'The step budget of 1 turn is used up.' });
	});

	it('runs before thinking, so a spent run does not pay for another completion', () => {
		expect(guardrail.hooks).toStrictEqual(['pre-think']);
		expect(guardrail.id).toBe(STEP_BUDGET_ID);
		expect(guardrail.description).toBe('Stops the run after 5 turns.');
	});
});

describe('action blocklist', () => {
	const guardrail = createActionBlocklistGuardrail(['open', 'throw']);

	it('blocks a listed action without ending the run', () => {
		const verdict = guardrail.check(context({ hook: 'pre-act', proposed: action('open') }));
		expect(verdict).toStrictEqual({
			allow: false,
			reason: 'open is on the blocked list.',
			disposition: 'block-action'
		});
	});

	it('allows an action that is not listed', () => {
		expect(guardrail.check(context({ hook: 'pre-act', proposed: action('move') }))).toStrictEqual({
			allow: true
		});
	});

	it('never blocks a tool, only world actions', () => {
		// A tool of the same name is still allowed: looking is not changing.
		expect(guardrail.check(context({ hook: 'pre-act', proposed: tool('open') }))).toStrictEqual({
			allow: true
		});
	});

	it('allows when there is nothing proposed at all', () => {
		expect(guardrail.check(context({ hook: 'pre-act' }))).toStrictEqual({ allow: true });
	});

	it('describes itself by what it blocks', () => {
		expect(guardrail.hooks).toStrictEqual(['pre-act']);
		expect(guardrail.id).toBe(ACTION_BLOCKLIST_ID);
		expect(guardrail.description).toBe('Blocks these actions: open, throw.');
		expect(createActionBlocklistGuardrail([]).description).toBe('No actions are blocked.');
	});

	it('blocks nothing when the list is empty', () => {
		const empty = createActionBlocklistGuardrail([]);
		expect(empty.check(context({ hook: 'pre-act', proposed: action('open') }))).toStrictEqual({
			allow: true
		});
	});
});

describe('approval mode', () => {
	const guardrail = createApprovalModeGuardrail();

	it('pauses for a world action', () => {
		const verdict = guardrail.check(context({ hook: 'pre-act', proposed: action('open') }));
		expect(verdict).toStrictEqual({
			pause: true,
			reason: 'Approval mode is switched on, so a person checks every action first.'
		});
	});

	it('lets tools through — looking is free, changing things is not', () => {
		expect(guardrail.check(context({ hook: 'pre-act', proposed: tool('look') }))).toStrictEqual({
			allow: true
		});
	});

	it('allows when there is nothing proposed', () => {
		expect(guardrail.check(context({ hook: 'pre-act' }))).toStrictEqual({ allow: true });
	});

	it('is a pre-act rule', () => {
		expect(guardrail.hooks).toStrictEqual(['pre-act']);
		expect(guardrail.id).toBe(APPROVAL_MODE_ID);
		expect(guardrail.description).toContain('Asks a person');
	});
});
