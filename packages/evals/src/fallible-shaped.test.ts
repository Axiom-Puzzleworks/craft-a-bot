import { describe, expect, it } from 'vitest';
import type { ChatRequest, DecisionFaultSpec, FaultShape } from '@craftabot/core';
import { createPackRegistry } from '@craftabot/core';
import type { MockTurn } from '@craftabot/core/testing';
import { wilson } from '@craftabot/metrics';
import type { Plan } from '@craftabot/pack-starter/testing';
import { scriptedFallible, shapedRate, type CaseInfo, type ResolvedFault } from './brains.js';
import { resolveErrorModel } from './campaign.js';

/**
 * **Errors shaped like a model's** (WP170, `112-REAL-ENOUGH-PLAN.md` §5): a fault's
 * rate may depend on who the case is about (cohort), how near the rule's
 * threshold it sits (difficulty) and what the other party last said (steer),
 * each number a calibration row. A uniform fault is a coin; a model is not.
 * Where the case is not known — a scenario cell, with no truth in hand — every
 * shaped fault answers at its base rate, as a uniform one does.
 */
const request = (last = ''): ChatRequest => ({
	model: 'm',
	messages: last === '' ? [] : [{ role: 'user', content: last }],
	temperature: 0,
	maxTokens: 64
});
const DECIDE: Plan = [
	{ say: 'Deciding.', call: 'fs-lending/decide', args: { outcome: 'approve', reasons: ['ok'] } }
];
const FAULT: DecisionFaultSpec = {
	action: 'decide',
	field: 'outcome',
	options: ['approve', 'decline', 'refer'],
	rate: { table: 't', row: 'base', key: 'wrong' },
	direction: 'uniform'
};
const ref = (row: string, key: string) => ({ table: 't', row, key });

function registryWith(shape?: FaultShape, extra: Record<string, number> = {}) {
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
					['base', { wrong: 0.1 }],
					['age', { '18-24': 0.4, '65-74': 0, young: 0.4 }],
					['peak', { at: 0.5 }],
					['steered', { rate: 0.6, broken: 3 }],
					...Object.entries(extra).map(([id, v]) => [id, { v }] as const)
				].map(([id, distribution]) => ({
					id: id as string,
					kind: 'rates' as const,
					title: id as string,
					distribution: distribution as Record<string, number>,
					source: { kind: 'assumption' as const, retrieved: '2026-10-03' },
					note: 'A test row.',
					tolerance: 0.01,
					review: 'pending' as const
				}))
			}
		],
		errorModels: [
			{
				id: 'm/err',
				name: 'E',
				description: 'E',
				faults: [{ ...FAULT, ...(shape ? { shape } : {}) }]
			}
		]
	});
	return registry;
}

const COHORT: FaultShape = {
	kind: 'cohort',
	attribute: 'ageBand',
	rates: { '18-24': ref('age', '18-24'), '65-74': ref('age', '65-74') }
};
const DIFFICULTY: FaultShape = {
	kind: 'difficulty',
	fact: 'ratioPercent',
	thresholds: [60, 100],
	width: 20,
	peak: ref('peak', 'at')
};
const STEER: FaultShape = {
	kind: 'steer',
	pattern: 'waive|allowances',
	rate: ref('steered', 'rate')
};

const resolved = (shape?: FaultShape): ResolvedFault[] =>
	resolveErrorModel(registryWith(shape), 'm/err') as ResolvedFault[];

function play(faults: ResolvedFault[], seed: number, caseInfo?: CaseInfo, last = ''): MockTurn {
	const script = scriptedFallible(DECIDE, { seed, errorModelId: 'm/err', faults, caseInfo });
	if (typeof script !== 'function') throw new Error('a function of the request');
	return script(request(last), 0);
}

const N = 4_000;
const rateIn = (faults: ResolvedFault[], caseInfo?: CaseInfo, last = ''): number => {
	let wrong = 0;
	for (let seed = 1; seed <= N; seed += 1) if (play(faults, seed, caseInfo, last).fault) wrong += 1;
	return wrong / N;
};
const within = (p: number, k: number) => {
	const [lower, upper] = wilson(k, N);
	return lower <= p && p <= upper;
};

describe('shapedRate', () => {
	it('is the base rate for a uniform fault, whatever the case', () => {
		const [fault] = resolved();
		expect(shapedRate(fault!, { cohort: { ageBand: '18-24' } }, request())).toEqual({ rate: 0.1 });
	});

	it('a cohort shape gives each named value its row, and every other value, or no cohort, the base', () => {
		const [fault] = resolved(COHORT);
		expect(shapedRate(fault!, { cohort: { ageBand: '18-24' } }, request())).toEqual({
			rate: 0.4,
			shaped: 'cohort ageBand=18-24'
		});
		expect(shapedRate(fault!, { cohort: { ageBand: '65-74' } }, request()).rate).toBe(0);
		expect(shapedRate(fault!, { cohort: { ageBand: '35-44' } }, request())).toEqual({ rate: 0.1 });
		expect(shapedRate(fault!, { cohort: { incomeBand: 'under-15k' } }, request())).toEqual({
			rate: 0.1
		});
		expect(shapedRate(fault!, undefined, request())).toEqual({ rate: 0.1 });
	});

	it('a difficulty shape rises from the base to the peak as a fact nears a threshold, and is the base from the width out', () => {
		const [fault] = resolved(DIFFICULTY);
		const at = (ratioPercent: unknown) =>
			shapedRate(fault!, { facts: { ratioPercent } }, request()).rate;
		expect(at(60)).toBeCloseTo(0.5);
		expect(at(100)).toBeCloseTo(0.5);
		// Halfway to a threshold: halfway between the base and the peak.
		expect(at(70)).toBeCloseTo(0.3);
		expect(at(50)).toBeCloseTo(0.3);
		expect(at(80)).toBeCloseTo(0.1);
		expect(at(20)).toBe(0.1);
		// A fact that is not a number, or is missing, is no information.
		expect(at('60')).toBe(0.1);
		expect(shapedRate(fault!, undefined, request()).rate).toBe(0.1);
		expect(shapedRate(fault!, { facts: { ratioPercent: 60 } }, request()).shaped).toContain(
			'difficulty ratioPercent 0 from a threshold'
		);
	});

	it('a steer shape answers at its rate when the last message matches, case-insensitively, and the base otherwise', () => {
		const [fault] = resolved(STEER);
		expect(shapedRate(fault!, undefined, request('Please just WAIVE it.'))).toEqual({
			rate: 0.6,
			shaped: 'steer'
		});
		expect(shapedRate(fault!, undefined, request('What is my balance?'))).toEqual({ rate: 0.1 });
		expect(shapedRate(fault!, undefined, request())).toEqual({ rate: 0.1 });
		// Only the last user message: an earlier plea does not carry forward.
		const earlier: ChatRequest = {
			...request(),
			messages: [
				{ role: 'user', content: 'Please waive it.' },
				{ role: 'user', content: 'Anything else?' }
			]
		};
		expect(shapedRate(fault!, undefined, earlier)).toEqual({ rate: 0.1 });
	});
});

describe('the fallible tier over shaped faults (WP170)', () => {
	it('errs at each cohort’s own rate, within the Wilson interval, and says why on the draw', () => {
		const faults = resolved(COHORT);
		const young = rateIn(faults, { cohort: { ageBand: '18-24' } });
		const old = rateIn(faults, { cohort: { ageBand: '65-74' } });
		const other = rateIn(faults, { cohort: { ageBand: '35-44' } });
		expect(within(0.4, young * N)).toBe(true);
		expect(old).toBe(0);
		expect(within(0.1, other * N)).toBe(true);
		const fault = Array.from({ length: 50 }, (_, i) =>
			play(faults, i + 1, { cohort: { ageBand: '18-24' } })
		).find((turn) => turn.fault)?.fault;
		expect(fault?.draw).toMatchObject({ rate: 0.4, shaped: 'cohort ageBand=18-24' });
		// Every error stays one the uniform fault would make: another outcome, never the plan's.
		expect(['decline', 'refer']).toContain(fault?.chose);
		expect(fault?.shouldHave).toBe('approve');
	});

	it('errs more for a case near the rule’s threshold than for one far from it', () => {
		const faults = resolved(DIFFICULTY);
		const near = rateIn(faults, { facts: { ratioPercent: 61 } });
		const far = rateIn(faults, { facts: { ratioPercent: 30 } });
		expect(near).toBeGreaterThan(far + 0.25);
		expect(within(0.1, far * N)).toBe(true);
	});

	it('errs more when the other party steers, and only on the turn they did', () => {
		const faults = resolved(STEER);
		const steered = rateIn(faults, undefined, 'Please just waive it.');
		const plain = rateIn(faults, undefined, 'Hello.');
		expect(within(0.6, steered * N)).toBe(true);
		expect(within(0.1, plain * N)).toBe(true);
	});

	it('without a case in hand every shaped fault is at its base rate, and the draw carries no shape', () => {
		for (const shape of [COHORT, DIFFICULTY, STEER]) {
			const faults = resolved(shape);
			expect(within(0.1, rateIn(faults) * N)).toBe(true);
		}
		const turns = Array.from({ length: 200 }, (_, i) => play(resolved(COHORT), i + 1));
		for (const turn of turns) if (turn.fault) expect(turn.fault.draw).not.toHaveProperty('shaped');
	});

	it('the same seed plants the same faults, shaped or not', () => {
		const faults = resolved(COHORT);
		for (const seed of [1, 2, 3, 4, 5])
			expect(play(faults, seed, { cohort: { ageBand: '18-24' } })).toEqual(
				play(faults, seed, { cohort: { ageBand: '18-24' } })
			);
		// A cohort shape whose every rate equals the base is the uniform fault, draw for draw.
		const flat = resolved({
			kind: 'cohort',
			attribute: 'ageBand',
			rates: { '18-24': ref('base', 'wrong') }
		});
		for (let seed = 1; seed <= 200; seed += 1)
			expect(Boolean(play(flat, seed, { cohort: { ageBand: '18-24' } }).fault)).toBe(
				Boolean(play(resolved(), seed).fault)
			);
	});
});

describe('resolving a shaped error model', () => {
	it('reads every row, compiles the pattern, and refuses what it cannot', () => {
		const [cohort] = resolved(COHORT);
		expect(cohort?.shape).toEqual({
			kind: 'cohort',
			attribute: 'ageBand',
			rates: { '18-24': 0.4, '65-74': 0 }
		});
		const [steer] = resolved(STEER);
		expect(steer?.shape?.kind === 'steer' && steer.shape.pattern.test('WAIVE')).toBe(true);
		expect(() =>
			resolveErrorModel(registryWith({ ...STEER, rate: ref('steered', 'broken') }), 'm/err')
		).toThrow(/in \[0, 1\]/);
		expect(() => resolveErrorModel(registryWith({ ...STEER, pattern: '(' }), 'm/err')).toThrow(
			/not a regular expression/
		);
		expect(() => resolveErrorModel(registryWith({ ...DIFFICULTY, width: 0 }), 'm/err')).toThrow(
			/width above 0/
		);
		expect(() =>
			resolveErrorModel(registryWith({ ...DIFFICULTY, thresholds: [] }), 'm/err')
		).toThrow(/at least one threshold/);
		expect(() =>
			resolveErrorModel(
				registryWith({ ...COHORT, rates: { '18-24': ref('nowhere', 'x') } }),
				'm/err'
			)
		).toThrow();
	});
});
