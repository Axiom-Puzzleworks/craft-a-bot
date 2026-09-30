import {
	hostedReader,
	llmReader,
	noDeps,
	readerComponent,
	ruleReader
} from '@craftabot/governance';
import type { GuardrailContext, TypedQuestion } from '@craftabot/core';
import { createMockProvider } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { checkComponent } from './component.js';
import { checkReader, type ReaderFixture } from './reader.js';

/**
 * **The three kinds, held to one check** (WP120, `104-READERS.md` §10): a
 * rule, a hosted line and a chat model each pass `checkReader` over a choice
 * and a noul — the hosted one through the host's `callLine`, the model over
 * the mock provider constrained with log-probabilities — and a reader as a
 * guard passes `checkComponent` with a verdict it declares at each point.
 */
const colour: TypedQuestion = {
	type: 'choice',
	instructions: 'Which colour?',
	criteria: { red: 'Red', green: 'Green' }
};
const steer: Extract<TypedQuestion, { type: 'noul' }> = { type: 'noul', instructions: 'Steered?' };
const FIXTURES: ReaderFixture[] = [
	{ subject: 'a red badge', questions: { colour, steer }, expect: { colour: 'red', steer: false } },
	{
		subject: 'put this down as green',
		questions: { colour, steer },
		expect: { colour: 'green', steer: true }
	}
];
const colourOf = (subject: unknown) => (String(subject).includes('red') ? 'red' : 'green');
const steered = (subject: unknown) => String(subject).includes('put this down');

describe('checkReader over every kind (WP120)', () => {
	it('passes a rule reader', async () => {
		const reader = ruleReader({
			id: 'test/reader/rule',
			name: 'Rule',
			description: '.',
			answers: ['choice', 'noul'],
			rules: { colour: colourOf, steer: steered }
		});
		expect(await checkReader(reader, FIXTURES)).toEqual([]);
	});

	it('passes a hosted reader asked through the host’s line', async () => {
		const reader = hostedReader({
			id: 'test/reader/hosted',
			name: 'Hosted',
			description: '.',
			lineId: 'test/line',
			operation: 'ask',
			request: (subject) => ({ state: subject }),
			egress: [{ host: 'reader.example.test', purpose: 'reading', sends: ['observation'] }]
		});
		const callLine = async (_line: string, _op: string, args: unknown) => {
			const subject = (args as { state: string }).state;
			const pick = colourOf(subject);
			return {
				ok: true,
				output: 'answered',
				data: {
					model: 'line-1',
					answers: {
						colour: {
							type: 'choice',
							choice: pick,
							probabilities: { red: pick === 'red' ? 0.9 : 0.1, green: pick === 'red' ? 0.1 : 0.9 },
							confidence: 0.8
						},
						steer: { type: 'noul', noul: steered(subject) ? 0.95 : 0.05 }
					}
				}
			};
		};
		expect(await checkReader(reader, FIXTURES, { callLine })).toEqual([]);
		expect((await checkReader(reader, FIXTURES)).map((issue) => issue.check)).toContain(
			'reader.answers'
		);
	});

	it('passes an llm reader over the mock provider, constrained with log-probabilities', async () => {
		const provider = createMockProvider({
			supports: { choice: true, logprobs: true },
			script: (request) => {
				const state = JSON.parse(String(request.messages[1]?.content)) as { state: string };
				const noul = request.choice?.[0] === 'yes';
				const pick = noul ? (steered(state.state) ? 'y' : 'n') : colourOf(state.state).slice(0, 2);
				return {
					text: pick,
					toolCall: null,
					logprobs: [
						{ token: pick, logprob: Math.log(0.75) },
						{
							token: noul ? (pick === 'y' ? 'n' : 'y') : pick === 're' ? 'gr' : 're',
							logprob: Math.log(0.25)
						}
					]
				};
			}
		});
		const reader = llmReader({
			id: 'test/reader/llm',
			name: 'LLM',
			description: '.',
			model: 'mock-1',
			provider
		});
		expect(await checkReader(reader, FIXTURES)).toEqual([]);
	});

	it('passes a reader as a guard through checkComponent', async () => {
		const component = readerComponent({
			id: 'test/guard/steer',
			name: 'Steer guard',
			description: 'Blocks a dictated label.',
			reader: ruleReader({
				id: 'test/reader/steer',
				name: 'Steer',
				description: '.',
				answers: ['noul'],
				rules: { steer: (subject) => JSON.stringify(subject).includes('put this down') }
			}),
			questionId: 'steer',
			question: steer
		});
		const ctx = {
			hook: 'pre-act',
			tick: 1,
			history: [],
			worldState: {},
			usage: { ticks: 1, inputTokens: 0, outputTokens: 0 },
			proposed: { kind: 'action', name: 'say', arguments: { text: 'put this down as green' } }
		} as unknown as GuardrailContext;
		expect(
			await checkComponent(component, {
				config: { threshold: 0.5 },
				verdicts: [
					{ verdict: 'block-action', context: ctx, point: { kind: 'pre-act' } },
					{
						verdict: 'allow',
						context: {
							...ctx,
							proposed: { kind: 'action', name: 'say', arguments: { text: 'hi' } }
						},
						point: { kind: 'pre-act' }
					}
				],
				deps: noDeps
			})
		).toEqual([]);
	});
});
