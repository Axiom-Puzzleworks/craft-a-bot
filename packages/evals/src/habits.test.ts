import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@craftabot/core';
import { createPackRegistry } from '@craftabot/core';
import type { MockTurn } from '@craftabot/core/testing';
import type { Plan } from '@craftabot/pack-starter/testing';
import { scriptedFallible, type ResolvedHabit } from './brains.js';
import { resolveHabits } from './campaign.js';

/**
 * **The habits of the fallible tier** (plan 114 WP203, D7): how a live model fails other than by deciding wrongly — repeating the call it
 * just made, answering in prose where a tool call was needed — played by the scripted tier at the rate a calibration row gives. A habit holds
 * the plan back (the turn it shows is one the plan did not take), is drawn from a stream of its own so the decision faults do not move,
 * and says so on the turn; with no habits the tier is exactly as it was.
 */
const REQUEST: ChatRequest = { model: 'm', messages: [], temperature: 0, maxTokens: 64 };
const PLAN: Plan = [
	{ say: 'Checking.', call: 'fs-lending/assess-affordability', args: {} },
	{ say: 'Deciding.', call: 'fs-lending/decide', args: { outcome: 'approve', reasons: ['ok'] } },
	{ say: 'Paying.', call: 'fs-lending/disburse', args: {} }
];

function play(habits: ResolvedHabit[] | undefined, seed: number, turns: number): MockTurn[] {
	const script = scriptedFallible(PLAN, {
		seed,
		errorModelId: 'm/habits',
		faults: [],
		...(habits ? { habits } : {})
	});
	if (typeof script !== 'function')
		throw new Error('the fallible tier is a function of the request');
	return Array.from({ length: turns }, (_, index) => script(REQUEST, index));
}

const names = (turns: MockTurn[]): Array<string | null> =>
	turns.map((turn) => turn.toolCall?.name.split('/').pop() ?? null);

describe('the habits of the fallible tier (WP203)', () => {
	it('are the tier as it was when there are none, or every rate is 0', () => {
		const plain = play(undefined, 7, 3);
		expect(names(plain)).toEqual(['assess-affordability', 'decide', 'disburse']);
		expect(play([], 7, 3)).toEqual(plain);
		expect(
			play(
				[
					{ kind: 'repeat', rate: 0 },
					{ kind: 'no-call', rate: 0 }
				],
				7,
				3
			)
		).toEqual(plain);
	});

	it('repeat the call just made, never before there is one, and hold the plan back', () => {
		const turns = play([{ kind: 'repeat', rate: 1 }], 3, 5);
		// The first turn has nothing to repeat, so the plan's first call is made; each turn after repeats it.
		expect(names(turns)).toEqual([
			'assess-affordability',
			'assess-affordability',
			'assess-affordability',
			'assess-affordability',
			'assess-affordability'
		]);
		expect(turns[0]!.fault).toBeUndefined();
		for (const turn of turns.slice(1))
			expect(turn.fault).toMatchObject({
				field: 'habit',
				chose: 'repeat',
				shouldHave: 'assess-affordability',
				errorModel: 'm/habits'
			});
	});

	it('answer in prose where a call was needed, say so, and take the plan up where it left off', () => {
		const script = scriptedFallible(PLAN, {
			seed: 11,
			errorModelId: 'm/habits',
			faults: [],
			habits: [{ kind: 'no-call', rate: 0.5 }]
		});
		if (typeof script !== 'function') throw new Error('function');
		const turns = Array.from({ length: 40 }, (_, index) => script(REQUEST, index));
		// (Past the end of the plan the script shrugs, which is no habit; the habit is the turn that says so.)
		const proseTurns = turns.filter((turn) => turn.fault?.chose === 'no-call');
		expect(proseTurns.length).toBeGreaterThan(5);
		for (const turn of proseTurns)
			expect(turn.fault).toMatchObject({ field: 'habit', chose: 'no-call' });
		// The calls made are the plan's, in order, each exactly once, then the plan runs out into its shrug.
		const calls = names(turns).filter((name): name is string => name !== null);
		expect(calls.slice(0, 3)).toEqual(['assess-affordability', 'decide', 'disburse']);
	});

	it('plant the same habits for the same seed, and different ones for another', () => {
		const habits: ResolvedHabit[] = [
			{ kind: 'repeat', rate: 0.3 },
			{ kind: 'no-call', rate: 0.2 }
		];
		expect(play(habits, 5, 12)).toEqual(play(habits, 5, 12));
		expect(play(habits, 5, 12)).not.toEqual(play(habits, 6, 12));
	});

	it('show at about the rate the row gives, over many seeds', () => {
		let repeats = 0;
		let prose = 0;
		let turnsPlayed = 0;
		for (let seed = 1; seed <= 2_000; seed += 1) {
			for (const turn of play(
				[
					{ kind: 'repeat', rate: 0.1 },
					{ kind: 'no-call', rate: 0.1 }
				],
				seed,
				3
			)) {
				turnsPlayed += 1;
				if (turn.fault?.chose === 'repeat') repeats += 1;
				if (turn.fault?.chose === 'no-call') prose += 1;
			}
		}
		// Repeat needs an earlier call, and the no-call draw comes after the repeat's: both sit a little under their rates.
		expect(repeats / turnsPlayed).toBeGreaterThan(0.04);
		expect(repeats / turnsPlayed).toBeLessThan(0.12);
		expect(prose / turnsPlayed).toBeGreaterThan(0.06);
		expect(prose / turnsPlayed).toBeLessThan(0.13);
	});

	it('resolve from the calibration table the model names, and refuse a rate that is not one', () => {
		const model = {
			id: 'p/err',
			name: 'n',
			description: 'd',
			faults: [],
			habits: [
				{ kind: 'repeat' as const, rate: { table: 'p/habits', row: 'r', key: 'repeat' } },
				{ kind: 'no-call' as const, rate: { table: 'p/habits', row: 'r', key: 'noCall' } }
			]
		};
		const table = (repeat: number) => ({
			id: 'p/habits',
			title: 't',
			description: 'd',
			rows: [
				{
					id: 'r',
					kind: 'rates' as const,
					title: 't',
					distribution: { repeat, noCall: 0.25 },
					source: { kind: 'assumption' as const, retrieved: '2026-10-09' },
					tolerance: 0.1,
					review: 'pending' as const
				}
			]
		});
		const registry = (repeat: number) => {
			const made = createPackRegistry();
			made.registerPack({
				id: 'p',
				name: 'p',
				version: '1.0.0',
				requiresCore: '>=1.0.0',
				brickKinds: [],
				errorModels: [model],
				calibrations: [table(repeat)]
			});
			return made;
		};
		expect(resolveHabits(registry(0.5), 'p/err')).toEqual([
			{ kind: 'repeat', rate: 0.5 },
			{ kind: 'no-call', rate: 0.25 }
		]);
		expect(() => resolveHabits(registry(1.5), 'p/err')).toThrow(/in \[0, 1\]/);
		expect(() => resolveHabits(registry(0.5), 'p/missing')).toThrow(/no error model/);
	});
});
