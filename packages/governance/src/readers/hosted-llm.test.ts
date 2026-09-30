import { describe, expect, it } from 'vitest';
import type { ChatRequest, ToolResult, TypedQuestion } from '@craftabot/core';
import { createMockProvider, type MockTurn } from '@craftabot/core/testing';
import { hostedReader } from './hosted.js';
import { foldFirstToken, llmReader, optionNamed, optionsFor } from './llm.js';

/** The hosted and LLM adapters (WP120, `104-READERS.md` §10.3). */
const colour: TypedQuestion = {
	type: 'choice',
	instructions: 'Which colour?',
	criteria: { red: 'Red', green: 'Green', blue: 'Blue' }
};
const urgent: TypedQuestion = { type: 'noul', instructions: 'Urgent?' };
const size: TypedQuestion = {
	type: 'score',
	instructions: 'How big?',
	criteria: ['small', 'large']
};

describe('hostedReader', () => {
	const line =
		(data: unknown, ok = true): ((...args: unknown[]) => Promise<ToolResult>) =>
		async () =>
			ok ? { ok: true, output: 'answered', data } : { ok: false, output: 'down' };
	const reader = hostedReader({
		id: 'test/reader/hosted',
		name: 'Hosted',
		description: 'A line.',
		lineId: 'test/line',
		operation: 'ask',
		request: (subject, questions) => ({ model: 'm-1', state: { subject }, questions }),
		egress: [{ host: 'reader.example.test', purpose: 'reading', sends: ['observation'] }]
	});

	it('asks the line with the arguments it builds and reads the wire shape back, a score by level', async () => {
		const asked: unknown[] = [];
		const response = await reader.ask(
			'a badge',
			{ colour, urgent, size },
			{
				callLine: async (lineId, operation, args) => {
					asked.push([lineId, operation, args]);
					return line({
						model: 'm-1',
						answers: {
							colour: {
								type: 'choice',
								choice: 'red',
								probabilities: { red: 0.8, green: 0.1, blue: 0.1 },
								confidence: 0.7
							},
							urgent: { type: 'noul', noul: 0.2 },
							size: {
								type: 'score',
								score: 1,
								probabilities: { '1': 0.7, '0': 0.3 },
								confidence: 0.4
							}
						}
					})();
				}
			}
		);
		expect(asked).toEqual([
			[
				'test/line',
				'ask',
				{ model: 'm-1', state: { subject: 'a badge' }, questions: { colour, urgent, size } }
			]
		]);
		expect(response).toMatchObject({ model: 'm-1', method: 'hosted' });
		expect(response.answers['size']).toEqual({
			type: 'score',
			score: 1,
			probabilities: [0.3, 0.7],
			confidence: 0.4
		});
		expect(response.answers['urgent']).toEqual({ type: 'noul', noul: 0.2 });
	});

	it('refuses with no host line, a failed call, an answer off the contract, and an unknown type', async () => {
		await expect(reader.ask('x', { colour }, {})).rejects.toThrow(/calls service lines/);
		await expect(reader.ask('x', { colour }, { callLine: line({}, false) })).rejects.toThrow(
			/answered: down/
		);
		await expect(reader.ask('x', { colour }, { callLine: line({ answers: {} }) })).rejects.toThrow(
			/off the contract/
		);
		await expect(
			reader.ask(
				'x',
				{ colour },
				{ callLine: line({ model: 'm', answers: { colour: { type: 'x' } } }) }
			)
		).rejects.toThrow(/no type the contract knows/);
		expect(reader).toMatchObject({ kind: 'hosted', browserCapable: false });
	});
});

describe('llmReader over the mock provider', () => {
	const seen: ChatRequest[] = [];
	const provider = (
		turn: (request: ChatRequest) => MockTurn,
		supports?: { choice?: boolean; logprobs?: boolean }
	) =>
		createMockProvider({
			script: (request) => {
				seen.push(request);
				return turn(request);
			},
			...(supports ? { supports } : {})
		});
	const reader = (p: ReturnType<typeof provider>) =>
		llmReader({
			id: 'test/reader/llm',
			name: 'LLM',
			description: 'A model.',
			model: 'mock-1',
			provider: p
		});

	it('constrained with log-probabilities: the first token folded onto the options, with a confidence', async () => {
		seen.length = 0;
		const p = provider(
			(request) => ({
				text: request.choice?.[0] === 'yes' ? 'no' : 'red',
				toolCall: null,
				logprobs:
					request.choice?.[0] === 'yes'
						? [
								{ token: 'n', logprob: Math.log(0.9) },
								{ token: 'y', logprob: Math.log(0.1) }
							]
						: [
								{ token: 'red', logprob: Math.log(0.6) },
								{ token: 'gr', logprob: Math.log(0.3) },
								{ token: 'x', logprob: Math.log(0.1) }
							]
			}),
			{ choice: true, logprobs: true }
		);
		const response = await reader(p).ask('a badge', { colour, urgent }, {});
		expect(seen[0]).toMatchObject({
			choice: ['red', 'green', 'blue'],
			topLogprobs: 20,
			temperature: 0
		});
		expect(response.method).toBe('logprobs');
		const answer = response.answers['colour'];
		expect(answer).toMatchObject({ type: 'choice', choice: 'red' });
		expect(answer?.type === 'choice' && answer.probabilities['red']).toBeCloseTo(2 / 3, 10);
		expect(answer?.type === 'choice' && answer.confidence).toBeCloseTo(0.5, 10);
		expect(response.answers['urgent']).toMatchObject({ type: 'noul' });
		expect((response.answers['urgent'] as { noul: number }).noul).toBeCloseTo(0.1, 10);
	});

	it('constrained without log-probabilities: all the mass on what it said, no confidence', async () => {
		seen.length = 0;
		const p = provider(() => ({ text: '1', toolCall: null }), { choice: true });
		const response = await reader(p).ask('a big badge', { size }, {});
		expect(seen[0]).toMatchObject({ choice: ['0', '1'] });
		expect(seen[0]?.topLogprobs).toBeUndefined();
		expect(response).toMatchObject({ method: 'constrained' });
		expect(response.answers['size']).toEqual({
			type: 'score',
			score: 1,
			probabilities: [0, 1],
			confidence: null
		});
	});

	it('unconstrained: the option its text names, by argmax, and an error when it names none', async () => {
		seen.length = 0;
		const p = provider((request) => ({
			text: String(request.messages[1]?.content).includes('badge')
				? 'I would say "green".'
				: 'no idea',
			toolCall: null
		}));
		const response = await reader(p).ask('a badge', { colour }, {});
		expect(seen[0]?.choice).toBeUndefined();
		expect(response).toMatchObject({
			method: 'argmax',
			answers: { colour: { choice: 'green', confidence: null } }
		});
		await expect(reader(p).ask('nothing', { colour }, {})).rejects.toThrow(
			/names none of its options/
		);
	});

	it('reads the weakest method a response used, the host’s provider when it carries none, and refuses none', async () => {
		const p = provider(
			(request) =>
				request.choice?.[0] === 'yes'
					? { text: 'yes', toolCall: null }
					: { text: 'red', toolCall: null, logprobs: [{ token: 'red', logprob: 0 }] },
			{ choice: true, logprobs: true }
		);
		const bare = llmReader({
			id: 'test/reader/bare',
			name: 'Bare',
			description: '.',
			model: 'mock-1'
		});
		expect((await bare.ask('x', { colour, urgent }, { provider: p })).method).toBe('constrained');
		await expect(bare.ask('x', { colour }, {})).rejects.toThrow(/no provider/);
	});
});

describe('the fold and the options', () => {
	it('splits a token that begins two options, and is uniform when none matched', () => {
		const folded = foldFirstToken(['card', 'cash'], [{ token: 'ca', logprob: 0 }]);
		expect(folded).toEqual({ probabilities: { card: 0.5, cash: 0.5 }, covered: 1, ambiguous: 1 });
		expect(
			foldFirstToken(
				['a', 'b'],
				[
					{ token: '', logprob: 0 },
					{ token: 'z', logprob: 0 }
				]
			).probabilities
		).toEqual({
			a: 0.5,
			b: 0.5
		});
	});

	it('names an option exactly or by the one key its text contains', () => {
		expect(optionNamed('red.', ['red', 'green'])).toBe('red');
		expect(optionNamed('Probably green', ['red', 'green'])).toBe('green');
		expect(optionNamed('red or green', ['red', 'green'])).toBeUndefined();
		expect(optionsFor({ type: 'noul', instructions: '?', criteria: { true: 'Y' } })).toEqual({
			yes: 'Y',
			no: 'No.'
		});
	});
});
