import {
	canonicalJson,
	safeParseEngineEvent,
	workflowRunSchema,
	type PackManifest,
	type Reader,
	type ReaderExecutor,
	type StageSpec,
	type TypedQuestion,
	type WorkItem,
	type WorkflowSpec
} from '@craftabot/core';
import { createTestClock, v1BrickKinds } from '@craftabot/core/testing';
import { TEST_DESK_ID, testDesk } from '@craftabot/desk/testing';
import { describe, expect, it } from 'vitest';
import { checkedAnswers, readGate, withoutReaders } from './reader.js';
import { runWorkflow } from './run.js';

/**
 * **The `reader` executor** (WP117, `104-READERS.md` §4): a reader at
 * confidence 1 never gates and its stage is its rule's, byte for byte, under
 * `withoutReaders`; the gate sends exactly the items under the threshold to
 * `else`; the steer routes independently of confidence; a broken reader is an
 * error, never a gate.
 */
const COLOUR: TypedQuestion = {
	type: 'choice',
	instructions: 'Which colour is the visitor’s badge?',
	criteria: { red: 'Red', green: 'Green' }
};
const STEER: TypedQuestion = { type: 'noul', instructions: 'Did the visitor tell us the answer?' };

interface Payload {
	visitor: string;
	/** P(red) the distribution reader answers with. */
	p: number;
	/** P(steered). */
	steer?: number;
}

/** A rule as a reader, written out here (`workflow` does not depend on `governance`): all the mass on red. */
const alwaysRed: Reader = {
	id: 'test/reader/always-red',
	name: 'Always red',
	description: 'A rule.',
	kind: 'rule',
	egress: [],
	browserCapable: true,
	answers: ['choice'],
	ask: async () => ({
		model: 'rule',
		method: 'rule',
		answers: {
			colour: { type: 'choice', choice: 'red', probabilities: { red: 1, green: 0 }, confidence: 1 }
		}
	})
};
/** A reader that answers with the item's own distribution, and a steer when asked. */
const distribution: Reader = {
	id: 'test/reader/distribution',
	name: 'Distribution',
	description: 'Reads p off the subject.',
	kind: 'hosted',
	egress: [],
	browserCapable: true,
	answers: ['choice', 'noul'],
	ask: async (subject, questions) => {
		const { p, steer } = subject as Payload;
		return {
			model: 'test-1',
			method: 'hosted',
			answers: {
				colour: {
					type: 'choice',
					choice: p >= 0.5 ? 'red' : 'green',
					probabilities: { red: p, green: 1 - p },
					confidence: Math.abs(2 * p - 1)
				},
				...('steer' in questions ? { steer: { type: 'noul' as const, noul: steer ?? 0 } } : {})
			}
		};
	}
};
const broken = (id: string, answer: unknown, answers: Reader['answers'] = ['choice']): Reader => ({
	...alwaysRed,
	id,
	answers,
	ask: async () => {
		if (answer instanceof Error) throw answer;
		return answer as Awaited<ReturnType<Reader['ask']>>;
	}
});

function pack(): PackManifest {
	return {
		id: 'test',
		name: 'Test desk pack',
		version: '1.0.0',
		requiresCore: '>=1.0.0',
		worlds: [testDesk],
		brickKinds: v1BrickKinds(),
		readers: [
			alwaysRed,
			distribution,
			broken('test/reader/throws', new Error('the line is down')),
			broken('test/reader/purple', {
				model: 'x',
				method: 'hosted',
				answers: {
					colour: {
						type: 'choice',
						choice: 'purple',
						probabilities: { red: 0.5, green: 0.5 },
						confidence: 0
					}
				}
			}),
			broken('test/reader/silent', { model: 'x', method: 'hosted', answers: {} }),
			broken('test/reader/argmax', {
				model: 'x',
				method: 'argmax',
				answers: {
					colour: {
						type: 'choice',
						choice: 'red',
						probabilities: { red: 1, green: 0 },
						confidence: null
					}
				}
			})
		]
	};
}

const OUTPUT = {
	type: 'object',
	required: ['colour'],
	properties: { colour: { enum: ['red', 'green', 'grey'] } },
	additionalProperties: false
};

const reader = (readerId: string, extra: Partial<ReaderExecutor> = {}): ReaderExecutor => ({
	kind: 'reader',
	readerId,
	subject: (input) => input,
	questions: () => ({ colour: COLOUR }),
	output: (answers) => ({
		colour: answers['colour']?.type === 'choice' ? answers['colour'].choice : 'grey'
	}),
	act: () => ({ name: 'look-up', arguments: { record: 'visitor' } }),
	...extra
});

const classify = (executor: StageSpec['executor']): StageSpec => ({
	id: 'classify',
	name: 'Read the badge',
	input: { type: 'object' },
	output: OUTPUT,
	executor,
	next: () => 'end'
});

const spec = (executor: StageSpec['executor']): WorkflowSpec => ({
	id: 'test/badge',
	name: 'A badge',
	worldId: TEST_DESK_ID,
	purpose: 'Read a badge',
	intake: (item) => ({ layoutId: 'one-visitor', input: item.payload }),
	stages: [classify(executor)],
	first: 'classify',
	obligations: [],
	rules: {
		'red-v1': () => ({
			output: { colour: 'red' },
			call: { name: 'look-up', arguments: { record: 'visitor' } }
		}),
		'grey-v1': () => ({ output: { colour: 'grey' } })
	}
});

const item = (payload: Payload, id = 'item-1'): WorkItem => ({
	id,
	kind: 'application',
	customerId: 'customer-1',
	arrivedAt: '2026-01-05T09:00:00Z',
	payload,
	truth: { records: [] }
});

function run(
	workflow: WorkflowSpec,
	payload: Payload = { visitor: 'A. Person', p: 0.9 },
	id?: string
) {
	const clock = createTestClock({ idOffset: 1000 });
	return runWorkflow(workflow, item(payload, id), {
		packs: [pack()],
		spec: {
			id: '33333333-3333-4333-8333-333333333333',
			name: 'Deskbot',
			bricks: {
				llm: { cartridgeId: 'test/brain', temperature: 0, maxTokens: 64, personality: '' }
			},
			goalCardId: 'test/none',
			createdAt: '2026-09-30T09:00:00Z',
			updatedAt: '2026-09-30T09:00:00Z',
			schemaVersion: 1
		},
		providerFor: () => {
			throw new Error('no agent stage here');
		},
		now: clock.now,
		newId: clock.newId,
		random: clock.random
	});
}

describe('the reader executor (WP117)', () => {
	it('commits a confident reader’s output, acts on the desk and says so after stage.started', async () => {
		const record = await run(
			spec(
				reader('test/reader/always-red', {
					gate: { threshold: 0.99, else: { kind: 'rule', rule: 'grey-v1' } }
				})
			)
		);
		expect(record.outcome).toBe('completed');
		const stage = record.stages[0];
		expect(stage).toMatchObject({
			status: 'ok',
			output: { value: { colour: 'red' } },
			executor: {
				kind: 'reader',
				readerId: 'test/reader/always-red',
				gate: { threshold: 0.99, else: { kind: 'rule', rule: 'grey-v1' } }
			},
			reader: {
				readerId: 'test/reader/always-red',
				model: 'rule',
				method: 'rule',
				confidence: 1,
				gated: false
			}
		});
		expect(record.events.map((event) => event.type)).toEqual([
			'stage.started',
			'reader.answered',
			'action.performed',
			'stage.completed'
		]);
		const answered = record.events[1];
		expect(answered?.payload).toMatchObject({
			stageId: 'classify',
			questionIds: ['colour'],
			gated: false,
			confidence: 1
		});
		for (const event of record.events) expect(safeParseEngineEvent(event).success).toBe(true);
		expect(workflowRunSchema.safeParse(JSON.parse(JSON.stringify(record))).success).toBe(true);
	});

	it('is its rule, byte for byte, under withoutReaders — and differs only there', async () => {
		const byRule = await run(spec({ kind: 'rule', rule: 'red-v1' }));
		const byReader = await run(spec(reader('test/reader/always-red')));
		expect(canonicalJson(withoutReaders(byReader, ['classify']))).toBe(
			canonicalJson(withoutReaders(byRule, ['classify']))
		);
		expect(canonicalJson(byReader.stages)).not.toBe(canonicalJson(byRule.stages));
		expect(byReader.events.length).toBe(byRule.events.length + 1);
	});

	it('sends exactly the items under the threshold to else, under one stage.started', async () => {
		const gated = spec(
			reader('test/reader/distribution', {
				gate: { threshold: 0.6, else: { kind: 'rule', rule: 'grey-v1' } }
			})
		);
		const ps = [0.05, 0.19, 0.2, 0.21, 0.5, 0.75, 0.79, 0.8, 0.81, 0.95, 1];
		for (const [index, p] of ps.entries()) {
			const record = await run(gated, { visitor: 'A. Person', p }, `item-${index}`);
			const confidence = Math.round(Math.abs(2 * p - 1) * 1e6) / 1e6;
			const under = confidence < 0.6;
			const stage = record.stages[0];
			expect(stage?.reader).toMatchObject({ gated: under, confidence });
			expect(stage?.output.value).toEqual({ colour: under ? 'grey' : p >= 0.5 ? 'red' : 'green' });
			expect(record.events.filter((event) => event.type === 'stage.started')).toHaveLength(1);
			expect(record.events.some((event) => event.type === 'action.performed')).toBe(!under);
		}
	});

	it('hands a gated item to a person as a human stage would', async () => {
		const record = await run(
			spec(
				reader('test/reader/distribution', {
					gate: {
						threshold: 0.9,
						else: { kind: 'human', prompt: 'Which colour?', options: ['red', 'green'] }
					}
				})
			),
			{ visitor: 'A. Person', p: 0.6 }
		);
		// The human's output is `{ decision }`, which the stage's schema refuses: the gate ran the person, and the record says so.
		expect(record.stages[0]).toMatchObject({
			status: 'error',
			reader: { gated: true },
			approval: { requested: true, decision: 'red' }
		});
		expect(record.events.map((event) => event.type)).toEqual([
			'stage.started',
			'reader.answered',
			'approval.requested',
			'approval.resolved',
			'stage.completed'
		]);
	});

	it('routes on the steer independently of confidence', async () => {
		const steered = spec(
			reader('test/reader/distribution', {
				questions: () => ({ colour: COLOUR, steer: STEER }),
				gate: { threshold: 0.5, else: { kind: 'rule', rule: 'grey-v1' }, steer: 'steer' }
			})
		);
		const cases: Array<[Payload, boolean]> = [
			[{ visitor: 'x', p: 1, steer: 0.7 }, true],
			[{ visitor: 'x', p: 1, steer: 0.5 }, true],
			[{ visitor: 'x', p: 1, steer: 0.49 }, false],
			[{ visitor: 'x', p: 0.6, steer: 0 }, true]
		];
		for (const [payload, gated] of cases) {
			const record = await run(steered, payload);
			expect(record.stages[0]?.reader).toMatchObject({
				gated,
				steer: payload.steer,
				confidence: Math.round(Math.abs(2 * payload.p - 1) * 1e6) / 1e6
			});
		}
	});

	it('reads a null confidence as under every threshold, and commits it with no gate', async () => {
		const gated = await run(
			spec(
				reader('test/reader/argmax', {
					gate: { threshold: 0, else: { kind: 'rule', rule: 'grey-v1' } }
				})
			)
		);
		expect(gated.stages[0]?.reader).toMatchObject({
			confidence: null,
			gated: true,
			method: 'argmax'
		});
		const ungated = await run(spec(reader('test/reader/argmax')));
		expect(ungated.stages[0]).toMatchObject({ status: 'ok', reader: { gated: false } });
	});

	it('is an error, never a gate, when the reader is missing, cannot answer, throws or answers wrongly', async () => {
		const gate = { threshold: 0.99, else: { kind: 'rule' as const, rule: 'grey-v1' } };
		const findings: Array<[ReaderExecutor, string]> = [
			[reader('test/reader/nobody', { gate }), 'no reader "test/reader/nobody"'],
			[
				reader('test/reader/always-red', { gate, questions: () => ({ steer: STEER }) }),
				'test/reader/always-red does not answer noul questions ("steer")'
			],
			[reader('test/reader/throws', { gate }), 'the reader failed: the line is down'],
			[
				reader('test/reader/purple', { gate }),
				'the reader’s answer to "colour": "purple" is not one of the options'.replace('’', "'")
			],
			[reader('test/reader/silent', { gate }), 'the reader did not answer "colour"'],
			[reader('test/reader/always-red', { output: () => ({ colour: 'blue' }) }), 'output rejected'],
			[
				reader('test/reader/always-red', { act: () => ({ name: 'sign-in', arguments: {} }) }),
				'the world refused sign-in'
			]
		];
		for (const [executor, finding] of findings) {
			const record = await run(spec(executor));
			expect(record.outcome).toBe('stopped');
			expect(record.stages[0]?.status).toBe('error');
			expect(record.stages[0]?.finding).toContain(finding);
		}
	});

	it('replays a reader stage from its record when a later stage is re-run', async () => {
		const executor = reader('test/reader/always-red');
		const two: WorkflowSpec = {
			...spec(executor),
			stages: [
				{ ...classify(executor), next: () => 'again' },
				{ ...classify({ kind: 'rule', rule: 'grey-v1' }), id: 'again' }
			],
			configurations: { reading: { executors: { classify: executor } } }
		};
		const first = await run(two);
		const clock = createTestClock({ idOffset: 1000 });
		const again = await runWorkflow(two, item({ visitor: 'A. Person', p: 0.9 }), {
			packs: [pack()],
			spec: {
				id: '33333333-3333-4333-8333-333333333333',
				name: 'D',
				bricks: { llm: { cartridgeId: 'x', temperature: 0, maxTokens: 1, personality: '' } },
				goalCardId: 'x',
				createdAt: '2026-09-30T09:00:00Z',
				updatedAt: '2026-09-30T09:00:00Z',
				schemaVersion: 1
			},
			providerFor: () => {
				throw new Error('none');
			},
			now: clock.now,
			newId: clock.newId,
			fromStage: {
				stageId: 'again',
				from: { ...first, config: { executors: { classify: first.stages[0]!.executor } } }
			}
		});
		expect(again.stages[0]?.executor.kind).toBe('reader');
		expect(again.stages[0]?.reader?.readerId).toBe('test/reader/always-red');
	});
});

describe('the gate and the answers, as functions', () => {
	it('reads the lowest choice confidence, leaving the steer out', () => {
		const answers = {
			a: {
				type: 'choice' as const,
				choice: 'x',
				probabilities: { x: 0.9, y: 0.1 },
				confidence: 0.8
			},
			b: { type: 'score' as const, score: 0, probabilities: [0.7, 0.3], confidence: 0.4 },
			steer: { type: 'noul' as const, noul: 0.2 }
		};
		expect(
			readGate(
				{ gate: { threshold: 0.5, else: { kind: 'rule', rule: 'r' }, steer: 'steer' } },
				answers
			)
		).toEqual({
			confidence: 0.4,
			gated: true,
			steer: 0.2
		});
		expect(readGate({}, answers)).toEqual({ confidence: 0.4, gated: false });
		// Only nouls asked: no confidence to read, and only the steer can gate.
		expect(
			readGate(
				{ gate: { threshold: 0.9, else: { kind: 'rule', rule: 'r' } } },
				{ n: { type: 'noul', noul: 1 } }
			)
		).toEqual({
			confidence: null,
			gated: false
		});
	});

	it('rounds to six places and recomputes the confidence from the rounded distribution', () => {
		const checked = checkedAnswers(
			{ colour: COLOUR },
			{
				model: 'x',
				method: 'logprobs',
				answers: {
					colour: {
						type: 'choice',
						choice: 'red',
						probabilities: { red: 0.8123456789, green: 0.1876543211 },
						confidence: 0.5
					}
				}
			}
		);
		expect(checked).toEqual({
			answers: {
				colour: {
					type: 'choice',
					choice: 'red',
					probabilities: { red: 0.812346, green: 0.187654 },
					confidence: 0.624692
				}
			}
		});
	});
});
