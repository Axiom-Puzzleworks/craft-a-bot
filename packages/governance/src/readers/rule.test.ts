import { describe, expect, it } from 'vitest';
import { readerConfidence, type TypedQuestion } from '@craftabot/core';
import { ruleReader } from './rule.js';

/** The rule adapter's exact wrap (WP117, `104-READERS.md` §5). */
const colour: TypedQuestion = {
	type: 'choice',
	instructions: 'Which colour?',
	criteria: { red: 'Red', green: 'Green', blue: 'Blue' }
};
const urgent: TypedQuestion = { type: 'noul', instructions: 'Is it urgent?' };
const size: TypedQuestion = {
	type: 'score',
	instructions: 'How big?',
	criteria: ['small', 'medium', 'large']
};

const reader = ruleReader({
	id: 'test/reader/rule',
	name: 'Rule',
	description: 'A rule.',
	answers: ['choice', 'noul', 'score'],
	rules: {
		colour: (subject) => String(subject),
		urgent: (subject) => String(subject).startsWith('r'),
		size: (subject) => String(subject).length % 3
	}
});

describe('ruleReader (WP117)', () => {
	it('answers a choice with all the mass on its pick, at confidence 1, over every option in order', async () => {
		const response = await reader.ask('green', { colour }, {});
		expect(response).toEqual({
			model: 'rule',
			method: 'rule',
			answers: {
				colour: {
					type: 'choice',
					choice: 'green',
					probabilities: { red: 0, green: 1, blue: 0 },
					confidence: 1
				}
			}
		});
		expect(readerConfidence([0, 1, 0])).toBe(1);
	});

	it('answers a noul with 1 or 0 and a score with a one-hot level', async () => {
		const { answers } = await reader.ask('red', { urgent, size }, {});
		expect(answers['urgent']).toEqual({ type: 'noul', noul: 1 });
		expect(answers['size']).toEqual({
			type: 'score',
			score: 0,
			probabilities: [1, 0, 0],
			confidence: 1
		});
	});

	it('declares a rule: no egress, runs anywhere, choice by default', () => {
		expect(reader.kind).toBe('rule');
		expect(reader.egress).toEqual([]);
		expect(reader.browserCapable).toBe(true);
		expect(
			ruleReader({ id: 'x/reader/y', name: 'Y', description: '.', rules: {} }).answers
		).toEqual(['choice']);
	});

	it('refuses a question it has no rule for, and an answer outside the question', async () => {
		await expect(reader.ask('red', { other: colour }, {})).rejects.toThrow(/no rule for/);
		await expect(reader.ask('purple', { colour }, {})).rejects.toThrow(/not one of its options/);
		await expect(reader.ask('red', { urgent: { ...colour, type: 'choice' } }, {})).rejects.toThrow(
			/not one of its options/
		);
		const wrong = ruleReader({
			id: 'x/reader/wrong',
			name: 'W',
			description: '.',
			rules: { urgent: () => 'yes', size: () => 7 }
		});
		await expect(wrong.ask('', { urgent }, {})).rejects.toThrow(/no truth value/);
		await expect(wrong.ask('', { size }, {})).rejects.toThrow(/no level in range/);
	});
});
