import { describe, expect, it } from 'vitest';
import type { ChatRequest, DecisionFaultSpec } from '@craftabot/core';
import { createPackRegistry } from '@craftabot/core';
import type { MockTurn } from '@craftabot/core/testing';
import { wilson } from '@craftabot/metrics';
import type { Plan } from '@craftabot/pack-starter/testing';
import { scriptedFallible, scriptedOptimal, type ResolvedFault } from './brains.js';
import { campaignBrainSchema, resolveErrorModel } from './campaign.js';

/**
 * **The fallible tier** (WP115, `103-FALLIBLE-ACTORS.md` §5): the plan
 * played exactly but for the decisions an error model names, wrong at the
 * row's rate — within the Wilson interval over 5,000 cases — in the
 * direction the model says, the same seed planting the same faults, and a
 * rate of 0 the optimal tier turn for turn.
 */
const REQUEST: ChatRequest = { model: 'm', messages: [], temperature: 0, maxTokens: 64 };
const DECIDE: Plan = [
	{ say: 'Checking.', call: 'fs-lending/assess-affordability', args: {} },
	{ say: 'Deciding.', call: 'fs-lending/decide', args: { outcome: 'approve', reasons: ['ok'] } }
];
const OUTCOME: DecisionFaultSpec = {
	action: 'decide',
	field: 'outcome',
	options: ['approve', 'decline', 'refer'],
	rate: { table: 't', row: 'r', key: 'wrong' },
	direction: 'uniform'
};

function play(plan: Plan, faults: ResolvedFault[], seed: number): MockTurn[] {
	const script = scriptedFallible(plan, { seed, errorModelId: 'm/err', faults });
	if (typeof script !== 'function')
		throw new Error('the fallible tier is a function of the request');
	return plan.map((_, index) => script(REQUEST, index));
}

describe('the fallible tier (WP115)', () => {
	it('plants faults at the row’s rate, within the Wilson interval over 5,000 cases', () => {
		const rate = 0.1;
		let faults = 0;
		for (let seed = 1; seed <= 5_000; seed += 1) {
			const turns = play(DECIDE, [{ spec: OUTCOME, rate }], seed);
			const decided = turns[1]!;
			if (decided.fault) {
				faults += 1;
				expect(decided.fault.shouldHave).toBe('approve');
				expect(['decline', 'refer']).toContain(decided.fault.chose);
				// The roll behind it (WP160): a fault is a roll under the rate in force.
				expect(decided.fault.draw?.rate).toBe(rate);
				expect(decided.fault.draw!.roll).toBeGreaterThanOrEqual(0);
				expect(decided.fault.draw!.roll).toBeLessThan(rate);
				expect((decided.toolCall?.arguments as { outcome: string }).outcome).toBe(
					decided.fault.chose
				);
			} else {
				expect((decided.toolCall?.arguments as { outcome: string }).outcome).toBe('approve');
			}
			// Nothing but the decision is ever touched.
			expect(turns[0]?.fault).toBeUndefined();
		}
		const [lower, upper] = wilson(faults, 5_000);
		expect(lower).toBeLessThanOrEqual(rate);
		expect(upper).toBeGreaterThanOrEqual(rate);
	});

	it('the same seed plants the same faults; rate 0 is the optimal tier turn for turn', () => {
		expect(play(DECIDE, [{ spec: OUTCOME, rate: 0.5 }], 42)).toEqual(
			play(DECIDE, [{ spec: OUTCOME, rate: 0.5 }], 42)
		);
		const optimal = scriptedOptimal(DECIDE);
		const zero = play(DECIDE, [{ spec: OUTCOME, rate: 0 }], 7);
		expect(zero).toEqual(
			DECIDE.map((_, index) =>
				typeof optimal === 'function' ? optimal(REQUEST, index) : optimal[index]
			)
		);
	});

	it('swaps the action itself when the model names options and no field, keeping the pack prefix', () => {
		const ALERT: Plan = [
			{ say: 'Holding.', call: 'fs-fraud/hold', args: { alertId: 'alert-1', reason: 'r' } }
		];
		const spec: DecisionFaultSpec = {
			options: ['release', 'hold', 'freeze-account'],
			rate: { table: 't', row: 'r', key: 'wrong' },
			direction: 'uniform'
		};
		const [held] = play(ALERT, [{ spec, rate: 1 }], 3);
		expect(held?.fault?.field).toBe('action');
		expect(held?.fault?.shouldHave).toBe('hold');
		expect(held?.toolCall?.name).toMatch(/^fs-fraud\/(release|freeze-account)$/);
		expect(held?.toolCall?.arguments).toEqual({ alertId: 'alert-1', reason: 'r' });
	});

	it('errs toward one option when the model says so, and cannot err toward where it already is', () => {
		const toward: DecisionFaultSpec = { ...OUTCOME, direction: { toward: 'decline' } };
		const [, decided] = play(DECIDE, [{ spec: toward, rate: 1 }], 1);
		expect(decided?.fault?.chose).toBe('decline');
		const refuses: DecisionFaultSpec = { ...OUTCOME, direction: { toward: 'approve' } };
		expect(play(DECIDE, [{ spec: refuses, rate: 1 }], 1)[1]?.fault).toBeUndefined();
	});

	it('resolves an error model’s rates from the registry, and refuses what it cannot resolve', () => {
		const registry = createPackRegistry();
		registry.registerPack({
			id: 'm',
			name: 'M',
			version: '1.0.0',
			requiresCore: '>=1.0.0',
			calibrations: [
				{
					id: 't',
					title: 'T',
					description: 'T',
					rows: [
						{
							id: 'r',
							kind: 'rates',
							title: 'R',
							distribution: { wrong: 0.25, broken: 3 },
							source: { kind: 'assumption', retrieved: '2026-09-29' },
							note: 'A test row.',
							tolerance: 0.01,
							review: 'pending'
						}
					]
				}
			],
			errorModels: [
				{ id: 'm/err', name: 'E', description: 'E', faults: [OUTCOME] },
				{
					id: 'm/broken',
					name: 'B',
					description: 'B',
					faults: [{ ...OUTCOME, rate: { table: 't', row: 'r', key: 'broken' } }]
				}
			]
		});
		expect(resolveErrorModel(registry, 'm/err')).toEqual([{ spec: OUTCOME, rate: 0.25 }]);
		expect(() => resolveErrorModel(registry, 'm/none')).toThrow(/no error model/);
		expect(() => resolveErrorModel(registry, 'm/broken')).toThrow(/in \[0, 1\]/);
	});

	it('a fallible brain names its model, and only a fallible brain does', () => {
		expect(
			campaignBrainSchema.safeParse({ id: 'f', tier: 'fallible', errorModel: 'm/err' }).success
		).toBe(true);
		expect(campaignBrainSchema.safeParse({ id: 'f', tier: 'fallible' }).success).toBe(false);
		expect(
			campaignBrainSchema.safeParse({ id: 'o', tier: 'scripted-optimal', errorModel: 'm/err' })
				.success
		).toBe(false);
	});
});
