import { describe, expect, it } from 'vitest';
import { betaInc, betaQuantile, erfc, normalQuantile, tQuantile } from './normal.js';
import { clopperPearson, logRatio, summarise, welch, wilson } from './intervals.js';
import { fisherExact, ksTwoSample, twoProportionZ } from './tests.js';
import {
	conditionalParity,
	counterfactualFlip,
	demographicParity,
	disparateImpact,
	matchedPairDiscordance,
	rateWithBand,
	ruleAgreement
} from './fairness.js';
import { agreementDrift, ksDrift, pageHinkley, psiCategorical, psiNumeric } from './drift.js';
import {
	ceilingBreachRate,
	humanLoadAtVolume,
	minutesPerCase,
	oversightCost,
	touchesPerCase,
	unattendedRate
} from './human-load.js';
import { confusionRates } from './confusion.js';

/**
 * The edges: empty inputs, zero cells, one group, a pair with the wrong
 * shape — every branch that says "nothing to compare" says it as a value
 * a reader can see (n = 0, [0, 1], underpowered), never a NaN or a throw.
 */
describe('the edges', () => {
	it('intervals at the boundaries', () => {
		expect(wilson(0, 0)).toEqual([0, 1]);
		expect(wilson(10, 10)[1]).toBe(1);
		expect(wilson(0, 10)[0]).toBe(0);
		expect(clopperPearson(0, 0)).toEqual([0, 1]);
		expect(clopperPearson(10, 10)[1]).toBe(1);
		expect(logRatio(0, 10, 5, 10).corrected).toBe(true);
		// Nothing at all still gets the correction, so the ratio is finite and says so.
		expect(logRatio(0, 0, 0, 0)).toMatchObject({ corrected: true });
		expect(logRatio(0, 0, 0, 0).interval[1]).toBeGreaterThan(1);
		expect(summarise([])).toEqual({ n: 0, mean: 0, sd: 0 });
		expect(welch([1], [2]).interval).toEqual([-1, -1]);
		expect(welch([2, 2], [1, 1]).interval).toEqual([1, 1]);
	});

	it('distributions at the boundaries', () => {
		expect(normalQuantile(0)).toBe(-Infinity);
		expect(normalQuantile(1)).toBe(Infinity);
		expect(normalQuantile(0.01)).toBeCloseTo(-2.326, 3);
		expect(normalQuantile(0.99)).toBeCloseTo(2.326, 3);
		expect(tQuantile(0.975, 5000)).toBeCloseTo(1.96, 2);
		expect(() => tQuantile(1.5, 5)).toThrow(RangeError);
		expect(betaInc(2, 2, 0)).toBe(0);
		expect(betaInc(2, 2, 1)).toBe(1);
		expect(betaInc(2, 2, 0.9)).toBeCloseTo(0.972, 3);
		expect(betaQuantile(0, 2, 2)).toBe(0);
		expect(betaQuantile(1, 2, 2)).toBe(1);
		expect(erfc(-1)).toBeCloseTo(1.8427, 4);
	});

	it('tests with nothing to test', () => {
		expect(twoProportionZ(0, 0, 0, 0).p).toBe(1);
		expect(twoProportionZ(5, 5, 5, 5).p).toBe(1);
		expect(fisherExact(0, 5, 0, 5).statistic).toBe(1);
		expect(fisherExact(5, 0, 0, 5).statistic).toBe(Infinity);
		expect(ksTwoSample([1], []).p).toBe(1);
	});

	it('fairness with one group, no verdicts, no pairs, no forks', () => {
		const one = demographicParity([{ group: 'a', decision: 'approve' }]);
		expect(one.underpowered).toBe(true);
		expect(one.interval).toEqual([0, 0]);
		const ratio = disparateImpact([{ group: 'a', decision: 'approve' }]);
		expect(ratio.value).toBe(1);
		expect(ratio.interval).toEqual([0, Infinity]);
		expect(
			disparateImpact([
				{ group: 'a', decision: 'decline' },
				{ group: 'b', decision: 'decline' }
			]).value
		).toBe(1);
		expect(ruleAgreement([{ group: 'a', decision: 'approve' }]).underpowered).toBe(true);
		const strata = conditionalParity([
			{ group: 'a', decision: 'approve', stratum: 's1' },
			{ group: 'a', decision: 'decline', stratum: 's1' },
			{ group: 'b', decision: 'approve' }
		]);
		expect(strata.detail?.['left-out']).toBe('s1');
		expect(strata.underpowered).toBe(true);
		const pairs = matchedPairDiscordance([
			{ group: 'a', decision: 'approve', pairId: 'x' },
			{ group: 'a', decision: 'decline', pairId: 'x' },
			{ group: 'a', decision: 'approve', pairId: 'y' },
			{ group: 'b', decision: 'approve' }
		]);
		expect(pairs.n).toEqual({ pairs: 0, discordant: 0 });
		expect(pairs.value).toBe(0);
		expect(counterfactualFlip([]).value).toBe(0);
		expect(rateWithBand(0, 0).value).toBe(0);
	});

	it('drift over nothing', () => {
		expect(psiCategorical([], []).value).toBe(0);
		expect(psiNumeric([], []).value).toBe(0);
		// A constant reference has one distinct edge, so two bins, and no drift.
		expect(psiNumeric([1, 1, 1, 1], [1, 1, 1, 1], 4).bins).toHaveLength(2);
		expect(psiNumeric([1, 1, 1, 1], [1, 1, 1, 1], 4).value).toBe(0);
		expect(ksDrift([], []).p).toBe(1);
		expect(agreementDrift([{ group: 'a', decision: 'approve' }], []).value).toBe(0);
		expect(pageHinkley([]).detectedAt).toBeUndefined();
	});

	it('human load over nothing', () => {
		expect(touchesPerCase([]).value).toBe(0);
		expect(unattendedRate([]).value).toBe(0);
		expect(minutesPerCase([{ id: 'c', touches: [{ kind: 'unknown' }] }], { other: 3 }).value).toBe(
			3
		);
		expect(minutesPerCase([{ id: 'c', touches: [{ kind: 'unknown' }] }], {}).value).toBe(0);
		expect(humanLoadAtVolume(minutesPerCase([], {}), 100).value).toBe(0);
		expect(
			ceilingBreachRate([{ id: 'c', touches: [], decisions: [{ kind: 'x', level: 5 }] }], {}).n
		).toBe(0);
		expect(ceilingBreachRate([{ id: 'c', touches: [] }], { x: 3 }).value).toBe(0);
		expect(oversightCost([], []).value).toBe(0);
		expect(confusionRates({ tp: 0, fp: 0, tn: 0, fn: 0 }).f1.value).toBe(0);
	});
});
