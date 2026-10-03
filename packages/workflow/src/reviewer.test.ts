import { describe, expect, it } from 'vitest';
import { createPackRegistry } from '@craftabot/core';
import {
	ASKED_REASON,
	REFUSED_REASON,
	approvalAnswerDrawn,
	createApprover,
	namesPersonRates,
	overrideReason,
	personAtStage,
	recommendationIn,
	resolveReviewer,
	reviewerAnswer,
	reviewerAnswerDrawn,
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

	it('gives a reason on an override at the model’s rate, and a model with no rate answers as before (WP156)', () => {
		let overrides = 0;
		let reasons = 0;
		for (let index = 0; index < N; index += 1) {
			const answer = reviewerAnswer(
				{ ...model(0.95, 0), reasonRate: 0.8 },
				OPTIONS,
				'decline',
				'approve',
				reviewerRandom(1, `item-${index}`, 'decision', 0)
			);
			if (answer.answer === 'approve') continue;
			overrides += 1;
			if (answer.reason !== undefined) {
				reasons += 1;
				expect(answer.reason).toBe(overrideReason(answer.answer, 'approve'));
			}
		}
		// Within ±0.02 of the rate, tighter than the row's stated 0.05 tolerance (this seed draws 0.812).
		expect(Math.abs(reasons / overrides - 0.8)).toBeLessThan(0.02);
		// The draw comes last: a model with no rate gives the same answer and seconds, and no reason.
		for (let index = 0; index < 200; index += 1) {
			const draw = () => reviewerRandom(2, `item-${index}`, 'decision', 0);
			const before = reviewerAnswer(model(0.95, 0.3), OPTIONS, 'decline', 'approve', draw());
			const after = reviewerAnswer(
				{ ...model(0.95, 0.3), reasonRate: 1 },
				OPTIONS,
				'decline',
				'approve',
				draw()
			);
			expect({ ...after, reason: undefined }).toEqual({ ...before, reason: undefined });
			expect(before.reason).toBeUndefined();
		}
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

	it('says how it drew (WP160): the path, and every roll in order, without changing the answer', () => {
		const paths = new Set<string>();
		for (let i = 0; i < 400; i += 1) {
			const draw = () => reviewerRandom(5, `item-${i}`, 'decision', 0);
			const plain = reviewerAnswer(model(0.6, 0.4), OPTIONS, 'decline', 'approve', draw());
			const { answer, draw: how } = reviewerAnswerDrawn(
				model(0.6, 0.4),
				OPTIONS,
				'decline',
				'approve',
				draw()
			);
			expect(answer).toEqual(plain);
			paths.add(how.path);
			// Each path's rolls are the ones that decided it: a bias roll first, then accuracy, then the rest.
			if (how.path === 'took-recommendation') {
				expect(how.rolls[0]).toBeLessThan(0.4);
				expect(answer.followed).toBe(true);
			}
			if (how.path === 'accurate') expect(answer.correct).toBe(true);
			if (how.path === 'slipped') expect(answer.correct).toBe(false);
			expect(how.rolls.length).toBeGreaterThanOrEqual(2);
			expect(how.rolls.every((roll) => roll >= 0 && roll < 1)).toBe(true);
		}
		expect([...paths].sort()).toEqual(['accurate', 'slipped', 'took-recommendation']);
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

/**
 * **The person at an approval** (WP171, `112-REAL-ENOUGH-PLAN.md` §5): says no
 * at the refuse row's rate, asks a question first at the question row's, is
 * late at the late row's — each reproduced within its Wilson interval — and a
 * model naming none of the three approves every time.
 */
const person = (rates: {
	refuse?: number;
	question?: number;
	late?: number;
}): ResolvedReviewer => ({
	...model(1, 0),
	...(rates.refuse !== undefined ? { refuseRate: rates.refuse } : {}),
	...(rates.question !== undefined ? { questionRate: rates.question } : {}),
	...(rates.late !== undefined ? { lateRate: rates.late } : {})
});

describe('the person at an approval (WP171)', () => {
	it('a model naming none of the three rates approves every time, and makes the one seconds roll', () => {
		expect(namesPersonRates(model(1, 0))).toBe(false);
		for (let i = 0; i < 300; i += 1) {
			const draw = approvalAnswerDrawn(model(1, 0), reviewerRandom(1, `item-${i}`, 'approvals', 0));
			expect(draw).toMatchObject({ approved: true, path: 'approved', late: false });
			expect(draw.rolls).toHaveLength(1);
			expect(draw).not.toHaveProperty('reason');
		}
	});

	it('refuses at the refuse rate, asks first at the question rate, and is late at the late rate', () => {
		let refused = 0;
		let asked = 0;
		let late = 0;
		let approved = 0;
		for (let i = 0; i < N; i += 1) {
			const draw = approvalAnswerDrawn(
				person({ refuse: 0.2, question: 0.1, late: 0.3 }),
				reviewerRandom(2, `item-${i}`, 'approvals', 0)
			);
			if (draw.path === 'refused') refused += 1;
			if (draw.path === 'asked') asked += 1;
			if (draw.path === 'approved') approved += 1;
			if (draw.late) late += 1;
			expect(draw.approved).toBe(draw.path === 'approved');
		}
		// A question is drawn first (0.1); a refusal only among the rest (0.9 × 0.2).
		expect(within(asked, N, 0.1)).toBe(true);
		expect(within(refused, N, 0.9 * 0.2)).toBe(true);
		expect(within(approved, N, 0.9 * 0.8)).toBe(true);
		expect(within(late, N, 0.3)).toBe(true);
	});

	it('says what it said when it did not say yes, in the same words every time', () => {
		const refuses = approvalAnswerDrawn(person({ refuse: 1 }), () => 0);
		expect(refuses).toMatchObject({ approved: false, path: 'refused', reason: REFUSED_REASON });
		const asks = approvalAnswerDrawn(person({ question: 1 }), () => 0);
		expect(asks).toMatchObject({ approved: false, path: 'asked', reason: ASKED_REASON });
		// Asked once: the second time the same act is proposed, the question is skipped.
		const second = approvalAnswerDrawn(person({ question: 1 }), () => 0.99, { alreadyAsked: true });
		expect(second).toMatchObject({ approved: true, path: 'approved' });
	});

	it('is the same draw for the same run, item and stream, and adding a rate moves no earlier draw', () => {
		const draw = (rates: Parameters<typeof person>[0]) =>
			approvalAnswerDrawn(person(rates), reviewerRandom(5, 'x', 'approvals', 0));
		expect(draw({ refuse: 0.5, late: 0.5 })).toEqual(draw({ refuse: 0.5, late: 0.5 }));
		// Naming only the late rate leaves the approval and the seconds exactly as a model naming nothing draws them.
		const bare = approvalAnswerDrawn(model(1, 0), reviewerRandom(5, 'x', 'approvals', 0));
		expect(draw({ late: 0 }).seconds).toBe(bare.seconds);
		expect(draw({ late: 0 }).approved).toBe(true);
	});

	it('the approver asks about each act once, answers the same act when it is proposed again, and carries what it drew', () => {
		const approve = createApprover(person({ question: 1, refuse: 0 }), () => 0);
		const first = approve({ name: 'decide', arguments: { outcome: 'decline' } });
		expect(first).toMatchObject({ approved: false, by: { kind: 'person' } });
		expect(first.meta).toMatchObject({
			reason: ASKED_REASON,
			drew: { path: 'asked', rates: { questionRate: 1, refuseRate: 0 } }
		});
		const again = approve({ name: 'decide', arguments: { outcome: 'decline' } });
		expect(again.approved).toBe(true);
		expect(again.meta.drew?.path).toBe('approved');
		// A different act is a different proposal: it is asked about too.
		expect(approve({ name: 'decide', arguments: { outcome: 'approve' } }).approved).toBe(false);
	});

	it('at a stage the person may ask a question first and be late, from a stream of their own', () => {
		let asked = 0;
		let late = 0;
		for (let i = 0; i < N; i += 1) {
			const drawn = personAtStage(
				person({ question: 0.25, late: 0.4 }),
				reviewerRandom(3, `item-${i}`, 'decide#person', 0)
			);
			if (drawn.asked) {
				asked += 1;
				expect(drawn.extraSeconds).toBeGreaterThan(0);
			} else expect(drawn.extraSeconds).toBe(0);
			if (drawn.late) late += 1;
		}
		expect(within(asked, N, 0.25)).toBe(true);
		expect(within(late, N, 0.4)).toBe(true);
		// A model naming neither asks nothing and is never late.
		const none = personAtStage(model(1, 0), () => 0);
		expect(none).toEqual({ asked: false, late: false, extraSeconds: 0, rolls: [] });
	});
});
