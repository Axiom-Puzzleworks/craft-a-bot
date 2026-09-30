import { readFileSync } from 'node:fs';
import { argsDigest } from '@craftabot/core';
import {
	brierScore,
	expectedCalibrationError,
	gateCurve,
	reliability,
	type CalibratedAnswer
} from '@craftabot/metrics';
import { describe, expect, it } from 'vitest';
import type { JevChoiceAnswer, JevResponse } from './jev/types.js';
import { SERVICING_CORPUS } from './servicing/corpus.js';
import { readerRequest } from './servicing/questions.js';

/**
 * **The branch's published calibration, recomputed** (WP118, `104-READERS.md`
 * §9; `98-JEV.md` §9): Jev's v1 answers read from the shipped cassette,
 * scored against the corpus's labels by `@craftabot/metrics` — ECE 0.023
 * (request) and 0.014 (need), Brier 0.014 and 0.022, and the gate's counts —
 * the same values `scripts/analyse.ts` wrote to `experiment/results.json`,
 * with no call made. The branch binned by its own edges; the ten equal bins
 * the product reads by default are recorded beside them.
 */
const BRANCH_EDGES = [0, 0.5, 0.7, 0.8, 0.9, 0.95, 0.99, 1.0001];
const cassette = JSON.parse(
	readFileSync(new URL('./cassettes/typesafe-jev.craftabot-cassette.json', import.meta.url), 'utf8')
) as { entries: Array<{ argsDigest: string; result: { data?: JevResponse } }> };
const published = JSON.parse(
	readFileSync(new URL('../experiment/results.json', import.meta.url), 'utf8')
) as {
	byQuestion: Record<
		'category' | 'need',
		{
			calibration: { ece: number; brier: number };
			gates: Array<{
				threshold: number;
				toPerson: { k: number };
				autoAccuracy: { k: number; n: number };
			}>;
		}
	>;
};
const byDigest = new Map(cassette.entries.map((entry) => [entry.argsDigest, entry]));
const request = readerRequest('jev');

async function answersFor(question: 'category' | 'need'): Promise<CalibratedAnswer[]> {
	const answers: CalibratedAnswer[] = [];
	for (const row of SERVICING_CORPUS) {
		const entry = byDigest.get(await argsDigest(request(question, row.text, 1)));
		const answer = entry?.result.data?.answers[question] as JevChoiceAnswer | undefined;
		if (!answer) throw new Error(`no recorded answer for ${row.id}/${question}`);
		answers.push({
			choice: answer.choice,
			label: question === 'category' ? row.category : row.need,
			probabilities: answer.probabilities,
			confidence: answer.confidence
		});
	}
	return answers;
}

describe('the branch’s calibration, recomputed from its cassette (WP118)', () => {
	for (const [question, ece, brier] of [
		['category', 0.023, 0.014],
		['need', 0.014, 0.022]
	] as const) {
		it(`${question}: ECE ${ece}, Brier ${brier}, and the gate's counts`, async () => {
			const answers = await answersFor(question);
			expect(answers).toHaveLength(95);
			const recomputed = expectedCalibrationError(answers, { edges: BRANCH_EDGES }).value;
			const score = brierScore(answers).value;
			expect(recomputed).toBeCloseTo(published.byQuestion[question].calibration.ece, 12);
			expect(score).toBeCloseTo(published.byQuestion[question].calibration.brier, 12);
			expect(Number(recomputed.toFixed(3))).toBe(ece);
			expect(Number(score.toFixed(3))).toBe(brier);
			const curve = gateCurve(
				answers,
				published.byQuestion[question].gates.map((gate) => gate.threshold)
			);
			expect(
				curve.map((point) => [point.reviewed.k, point.residualAccuracy.k, point.residualAccuracy.n])
			).toEqual(
				published.byQuestion[question].gates.map((gate) => [
					gate.toPerson.k,
					gate.autoAccuracy.k,
					gate.autoAccuracy.n
				])
			);
			// The product's default: ten equal bins, the same answers.
			const tenBins = expectedCalibrationError(answers, { resamples: 0 }).value;
			expect(tenBins).toBeGreaterThan(0);
			expect(reliability(answers).reduce((sum, bin) => sum + bin.n, 0)).toBe(95);
		});
	}
});
