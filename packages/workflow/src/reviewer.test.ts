import { describe, expect, it } from 'vitest';
import { createPackRegistry } from '@craftabot/core';
import {
	recommendationIn,
	resolveReviewer,
	reviewerAnswer,
	reviewerRandom,
	type ResolvedReviewer
} from './reviewer.js';

/**
 * **The reviewer model** (WP115, `103-FALLIBLE-ACTORS.md` §6): the person at
 * a `human` stage answers right at the accuracy row's rate, takes a wrong
 * recommendation at the automation-bias row's rate, spends seconds drawn from
 * the weights row — each reproduced within its Wilson interval over 5,000
 * cases — and a model with accuracy 1 and bias 0 is the oracle.
 */
const OPTIONS = ['approve', 'decline', 'refer'];
const model = (accuracy: number, automationBias: number): ResolvedReviewer => ({
	id: 'm',
	accuracy,
	automationBias,
	seconds: [
		{ value: 60, weight: 20 },
		{ value: 120, weight: 45 },
		{ value: 240, weight: 25 },
		{ value: 480, weight: 10 }
	]
});
/** The Wilson score interval at 95% — local, since `workflow` depends on nothing in `metrics`. */
function wilson(k: number, n: number): [number, number] {
	const z = 1.959963984540054;
	const p = k / n;
	const centre = (p + (z * z) / (2 * n)) / (1 + (z * z) / n);
	const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n);
	return [centre - half, centre + half];
}
const N = 5_000;
const within = (k: number, n: number, p: number) => {
	const [lower, upper] = wilson(k, n);
	return lower <= p && p <= upper;
};

describe('the reviewer model (WP115)', () => {
	it('accuracy 1 and automation bias 0 is the oracle: always the right answer', () => {
		for (let i = 0; i < 500; i += 1) {
			const random = reviewerRandom(1, `item-${i}`, 'review', 3);
			const answer = reviewerAnswer(model(1, 0), OPTIONS, 'decline', 'approve', random);
			expect(answer).toMatchObject({ answer: 'decline', correct: true, followed: false });
		}
	});

	it('is right at the accuracy row’s rate when nothing wrong is put in front of them', () => {
		let right = 0;
		for (let i = 0; i < N; i += 1) {
			const answer = reviewerAnswer(
				model(0.9, 0.3),
				OPTIONS,
				'approve',
				undefined,
				reviewerRandom(1, `item-${i}`, 's', 0)
			);
			if (answer.correct) right += 1;
			else expect(answer.answer).not.toBe('approve');
		}
		expect(within(right, N, 0.9)).toBe(true);
	});

	it('takes a wrong recommendation at the automation-bias row’s rate', () => {
		let followed = 0;
		for (let i = 0; i < N; i += 1) {
			const answer = reviewerAnswer(
				model(1, 0.3),
				OPTIONS,
				'decline',
				'approve',
				reviewerRandom(2, `item-${i}`, 's', 0)
			);
			if (answer.followed) {
				followed += 1;
				expect(answer).toMatchObject({ answer: 'approve', correct: false });
			} else expect(answer).toMatchObject({ answer: 'decline', correct: true });
		}
		expect(within(followed, N, 0.3)).toBe(true);
	});

	it('spends seconds drawn from the weights row', () => {
		const seen = new Map<number, number>();
		for (let i = 0; i < N; i += 1) {
			const { seconds } = reviewerAnswer(
				model(1, 0),
				OPTIONS,
				'approve',
				undefined,
				reviewerRandom(3, `item-${i}`, 's', 0)
			);
			seen.set(seconds, (seen.get(seconds) ?? 0) + 1);
		}
		expect([...seen.keys()].sort((a, b) => a - b)).toEqual([60, 120, 240, 480]);
		expect(within(seen.get(120) ?? 0, N, 0.45)).toBe(true);
		expect(within(seen.get(480) ?? 0, N, 0.1)).toBe(true);
	});

	it('the same run, item and stage draw the same answer', () => {
		const a = reviewerAnswer(
			model(0.5, 0.5),
			OPTIONS,
			'refer',
			'approve',
			reviewerRandom(9, 'x', 's', 2)
		);
		const b = reviewerAnswer(
			model(0.5, 0.5),
			OPTIONS,
			'refer',
			'approve',
			reviewerRandom(9, 'x', 's', 2)
		);
		expect(a).toEqual(b);
	});

	it('reads a recommendation out of the stage input only when it is one of the options', () => {
		expect(recommendationIn({ decision: 'freeze', reason: 'x' }, ['skip', 'file', 'freeze'])).toBe(
			'freeze'
		);
		expect(recommendationIn({ reasons: ['a'], text: 'approve' }, OPTIONS)).toBe('approve');
		expect(recommendationIn({ reasons: ['a'] }, OPTIONS)).toBeUndefined();
		expect(recommendationIn(undefined, OPTIONS)).toBeUndefined();
	});

	it('resolves a model from the registry’s rows, and refuses what it cannot resolve', () => {
		const registry = createPackRegistry();
		const rates = (id: string, distribution: Record<string, number>) => ({
			id,
			kind: 'rates' as const,
			title: id,
			distribution,
			source: { kind: 'assumption' as const, retrieved: '2026-09-29' },
			note: 'A test row.',
			tolerance: 0.01,
			review: 'pending' as const
		});
		registry.registerPack({
			id: 'r',
			name: 'R',
			version: '1.0.0',
			requiresCore: '>=1.0.0',
			calibrations: [
				{
					id: 't',
					title: 'T',
					description: 'T',
					rows: [
						rates('acc', { correct: 0.95 }),
						rates('bias', { follows: 0.3 }),
						{ ...rates('secs', { '60': 1, '120': 3 }), kind: 'weights' }
					]
				}
			],
			reviewerModels: [
				{
					id: 'r/m',
					name: 'M',
					description: 'M',
					accuracy: { table: 't', row: 'acc', key: 'correct' },
					automationBias: { table: 't', row: 'bias', key: 'follows' },
					secondsPerCase: { table: 't', row: 'secs', key: 'seconds' }
				},
				{
					id: 'r/broken',
					name: 'B',
					description: 'B',
					accuracy: { table: 't', row: 'acc', key: 'nothing' },
					automationBias: { table: 't', row: 'bias', key: 'follows' },
					secondsPerCase: { table: 't', row: 'secs', key: 'seconds' }
				}
			]
		});
		expect(resolveReviewer(registry, 'r/m')).toEqual({
			id: 'r/m',
			accuracy: 0.95,
			automationBias: 0.3,
			seconds: [
				{ value: 60, weight: 1 },
				{ value: 120, weight: 3 }
			]
		});
		expect(() => resolveReviewer(registry, 'r/none')).toThrow(/no reviewer model/);
		expect(() => resolveReviewer(registry, 'r/broken')).toThrow(/no probability 'nothing'/);
	});
});
