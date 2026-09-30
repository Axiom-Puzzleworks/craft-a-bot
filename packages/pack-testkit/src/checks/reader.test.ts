import { ruleReader } from '@craftabot/governance';
import type { Reader, TypedQuestion } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { checkReader, type ReaderFixture } from './reader.js';

/** `checkReader` (WP117, `104-READERS.md` §3): a fixture per question type, and a red reader per check. */
const choice: TypedQuestion = {
	type: 'choice',
	instructions: 'Which?',
	criteria: { a: 'A', b: 'B', c: 'C' }
};
const noul: TypedQuestion = { type: 'noul', instructions: 'Is it?' };
const score: TypedQuestion = {
	type: 'score',
	instructions: 'How much?',
	criteria: ['low', 'high']
};

const rule = ruleReader({
	id: 'test/reader/rule',
	name: 'Rule',
	description: 'A rule over one letter.',
	answers: ['choice', 'noul', 'score'],
	rules: {
		which: (subject) => String(subject),
		is: (subject) => subject === 'a',
		much: (subject) => (subject === 'c' ? 1 : 0)
	}
});

const FIXTURES: ReaderFixture[] = [
	{ subject: 'a', questions: { which: choice, is: noul }, expect: { which: 'a', is: true } },
	{ subject: 'c', questions: { which: choice, much: score }, expect: { which: 'c', much: 1 } }
];

/** A hosted-looking reader answering whatever it is given — a place to break one thing at a time. */
function hosted(answer: (questionId: string) => unknown, extra: Partial<Reader> = {}): Reader {
	return {
		id: 'test/reader/hosted',
		name: 'Hosted',
		description: 'Answers as told.',
		kind: 'hosted',
		egress: [{ host: 'reader.example.test', purpose: 'reading', sends: ['observation'] }],
		browserCapable: false,
		answers: ['choice'],
		ask: async (_subject, questions) => ({
			model: 'm-1',
			method: 'hosted',
			answers: Object.fromEntries(Object.keys(questions).map((id) => [id, answer(id)]))
		}),
		...extra
	} as Reader;
}
const soft = {
	type: 'choice',
	choice: 'a',
	probabilities: { a: 0.6, b: 0.3, c: 0.1 },
	confidence: 0.4
};
const ONE: ReaderFixture[] = [
	{ subject: 'x', questions: { which: choice }, expect: { which: 'a' } }
];
const checks = async (reader: Reader, fixtures = ONE) =>
	(await checkReader(reader, fixtures)).map((issue) => issue.check);

describe('checkReader (WP117)', () => {
	it('passes a rule reader over a fixture per question type', async () => {
		expect(await checkReader(rule, FIXTURES)).toEqual([]);
	});

	it('passes a hosted reader whose confidence is the formula over its distribution', async () => {
		expect(await checks(hosted(() => soft))).toEqual([]);
	});

	it('refuses what a reader declares wrongly', async () => {
		expect(await checks(hosted(() => soft, { id: 'unqualified' }))).toContain('reader.declares');
		expect(await checks(hosted(() => soft, { answers: [] }))).toContain('reader.declares');
		expect(await checks(hosted(() => soft, { egress: [] }))).toContain('reader.declares');
		expect(await checks({ ...rule, egress: hosted(() => soft).egress })).toContain(
			'reader.declares'
		);
		expect(await checkReader(rule, [])).toEqual([
			{ check: 'reader.answers', message: 'test/reader/rule: no fixture to ask it' }
		]);
	});

	it('refuses an answer off the contract, a wrong type, a missing one, one outside the options', async () => {
		expect(await checks(hosted(() => ({ type: 'choice', choice: 'a' })))).toEqual([
			'reader.answers'
		]);
		expect(await checks(hosted(() => ({ type: 'noul', noul: 1 })))).toEqual(['reader.answers']);
		expect(await checks(hosted(() => ({ ...soft, choice: 'z' })))).toEqual(['reader.answers']);
		const silent = hosted(() => soft, {
			ask: async () => ({ model: 'm', method: 'hosted', answers: {} })
		});
		expect(await checks(silent)).toEqual(['reader.answers']);
		const throws = hosted(() => soft, {
			ask: async () => {
				throw new Error('down');
			}
		});
		expect(await checks(throws)).toEqual(['reader.answers']);
		expect(
			await checks(
				hosted(() => soft),
				[{ subject: 'x', questions: { n: noul } }]
			)
		).toContain('reader.answers');
	});

	it('refuses a confidence that is not the formula, and numbers past six places', async () => {
		expect(await checks(hosted(() => ({ ...soft, confidence: 0.9 })))).toEqual([
			'reader.confidence'
		]);
		expect(
			await checks(
				hosted(() => ({
					...soft,
					probabilities: { a: 0.6000001, b: 0.2999999, c: 0.1 },
					confidence: 0.40000015
				}))
			)
		).toContain('reader.rounding');
		expect(await checks(hosted(() => ({ ...soft, confidence: null })))).toEqual([]);
	});

	it('holds a rule to confidence 1 by the rule method, so it never gates', async () => {
		const unsure: Reader = { ...hosted(() => soft), kind: 'rule', egress: [] };
		expect(await checks(unsure)).toEqual(['reader.rule', 'reader.rule']);
	});

	it('refuses an answer the fixture did not expect, of each type', async () => {
		expect(
			await checks(rule, [
				{
					subject: 'b',
					questions: { which: choice, is: noul, much: score },
					expect: { which: 'a', is: true, much: 1 }
				}
			])
		).toEqual(['reader.expected', 'reader.expected', 'reader.expected']);
	});

	it('asks the offline stand-in the same fixtures, and refuses one with egress or a wrong answer', async () => {
		const withStandIn = hosted(() => soft, {
			createOffline: () => ({ ...rule, answers: ['choice'] })
		});
		expect(
			await checks(withStandIn, [
				{ subject: 'b', questions: { which: choice }, expect: { which: 'a' } }
			])
		).toEqual([]);
		const leaky = hosted(() => soft, { createOffline: () => hosted(() => soft) });
		expect(await checks(leaky)).toEqual(['reader.offline']);
		const wrong = hosted(() => soft, {
			createOffline: () => hosted(() => ({ ...soft, choice: 'z' }), { egress: [] })
		});
		expect(await checks(wrong)).toEqual(['reader.offline']);
	});
});
