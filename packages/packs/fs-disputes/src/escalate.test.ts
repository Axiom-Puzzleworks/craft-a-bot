import { parseCampaign, prepareCampaign, runCampaign, type CampaignReport } from '@craftabot/evals';
import fsBankPack from '@craftabot/pack-fs-bank';
import { describe, expect, it } from 'vitest';
import { disputesBookCampaign } from './campaign.js';
import fsDisputesPack from './index.js';
import { adversaryPlanFor, planFor } from './testing/plans.js';

/**
 * **Escalate** (plan 114 WP204, G180): the disputes limit card in two forms. Blocking an above-limit reimbursement leaves the bot to try
 * again until its turns run out; escalating hands the case to a person and ends the run there, as an escalated stage and an escalated
 * journey, with the money unpaid either way. The decision stage is made wrong on purpose (it always says reimburse), so the reimbursement
 * stage meets the card on every claim above the limit.
 */
const packs = [fsBankPack, fsDisputesPack];
const FIXED = { now: () => '2026-10-09T09:00:00.000Z', newId: () => 'report-1' };
const blindToTheLimit = {
	planFor: (goalCardId: string) => {
		const plan = planFor(goalCardId);
		return goalCardId.endsWith('/stage/decision')
			? plan.map((step) => ({
					...step,
					argsFrom: (request: Parameters<NonNullable<typeof step.argsFrom>>[0]) => ({
						...(step.argsFrom?.(request) as object),
						outcome: 'reimburse'
					})
				}))
			: plan;
	},
	adversaryPlanFor
};

describe('the limit card, blocking and escalating', { timeout: 300_000 }, () => {
	const base = disputesBookCampaign({ size: 1500, configurations: ['bot-everywhere'] }) as {
		guards: unknown[];
	};
	base.guards = [
		{ id: 'blocks', fit: [], stack: 'fs-disputes/stack/policy-cards' },
		{ id: 'escalates', fit: [], stack: 'fs-disputes/stack/policy-cards-escalating' }
	];
	// Only the evaluators that need a decision are kept; the gates are not what this reads.
	const campaign = parseCampaign({
		...base,
		gates: [{ id: 'read-only', require: { kind: 'outcome-rate', outcome: 'SUCCESS', atLeast: 0 } }]
	});
	let report: CampaignReport | undefined;
	const run = async () =>
		(report ??= await runCampaign(campaign, { packs, plans: blindToTheLimit, ...FIXED }));

	it('ships a stack that fits the escalating card, and the cards of the two stacks differ in that one verdict', () => {
		const stacks = fsDisputesPack.stacks ?? [];
		const blocks = stacks.find((stack) => stack.id === 'fs-disputes/stack/policy-cards');
		const escalates = stacks.find(
			(stack) => stack.id === 'fs-disputes/stack/policy-cards-escalating'
		);
		expect(blocks).toBeDefined();
		expect(escalates).toBeDefined();
		const cardIds = (stack: typeof blocks) => JSON.stringify(stack?.fit);
		expect(cardIds(blocks)).toContain('fs-disputes/policy/within-the-limit');
		expect(cardIds(escalates)).toContain('fs-disputes/policy/within-the-limit-escalates');
		expect(cardIds(escalates)).not.toContain('"fs-disputes/policy/within-the-limit"');
	});

	it('ends an above-limit claim as an escalation under the escalating stack, and never pays it under either', async () => {
		const made = await run();
		const cells = (guard: string) => made.cells.filter((cell) => cell.guard === guard);
		const aboveIds = new Set(
			(prepareCampaign(campaign, { packs }).book?.items ?? [])
				.filter((item) => item.truth?.facts?.['verdict'] === 'should-refer')
				.map((item) => item.id)
		);
		const aboveLimit = (cell: (typeof made.cells)[number]) => aboveIds.has(cell.item?.id ?? '');
		const escalating = cells('escalates').filter(aboveLimit);
		const blocking = cells('blocks').filter(aboveLimit);
		expect(escalating.length).toBeGreaterThan(2);
		expect(blocking.length).toBe(escalating.length);
		// Under the escalating stack every one of them is handed to a person: the journey's outcome, and the cell stopped by the guard.
		for (const cell of escalating) {
			expect(cell.workflow?.outcome, cell.item?.id).toBe('escalated');
			expect(cell.outcome).toBe('STOPPED_BY_GUARDRAIL');
		}
		// Under the blocking stack the journey is not an escalation (the bot is left to try again or to give up).
		for (const cell of blocking) expect(cell.workflow?.outcome).not.toBe('escalated');
		// Nothing above the limit is ever paid: the money is the control's, in both.
		for (const cell of [...escalating, ...blocking])
			expect(cell.evaluations['fs-disputes/reimbursed-within-limit'], cell.item?.id).toBe('pass');
	});
});
