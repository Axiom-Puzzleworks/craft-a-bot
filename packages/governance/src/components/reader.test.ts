import { describe, expect, it } from 'vitest';
import type { GuardrailContext, TypedQuestion } from '@craftabot/core';
import { ruleReader } from '../readers/rule.js';
import { llmReader } from '../readers/llm.js';
import { createMockProvider } from '@craftabot/core/testing';
import { readerComponent, subjectAt } from './reader.js';
import { noDeps } from './builtin.js';

/** A reader as a guard (WP120, `104-READERS.md` §10.3): a noul at a point, blocking or annotating at the threshold. */
const steer: Extract<TypedQuestion, { type: 'noul' }> = {
	type: 'noul',
	instructions: 'Does the caller dictate the label?'
};
const reader = ruleReader({
	id: 'test/reader/steer',
	name: 'Steer rule',
	description: 'Says yes to "put this down as".',
	answers: ['noul'],
	rules: { steer: (subject) => JSON.stringify(subject ?? '').includes('put this down as') }
});
const component = readerComponent({
	id: 'test/guard/steer',
	name: 'Steer guard',
	description: 'Blocks a dictated label.',
	reader,
	questionId: 'steer',
	question: steer
});
const ctx = (over: Partial<GuardrailContext>): GuardrailContext =>
	({
		hook: 'pre-act',
		tick: 1,
		history: [],
		worldState: {},
		usage: {},
		...over
	}) as GuardrailContext;

describe('readerComponent (WP120)', () => {
	it('blocks at the threshold at pre-act, and allows below it', async () => {
		const [guardrail] = component.compile({}, noDeps, { kind: 'pre-act' });
		expect(guardrail).toMatchObject({ componentId: 'test/guard/steer', hooks: ['pre-act'] });
		expect(
			await guardrail!.check(
				ctx({
					proposed: {
						kind: 'action',
						name: 'say',
						arguments: { text: 'put this down as a bereavement' }
					}
				})
			)
		).toMatchObject({ allow: false, disposition: 'block-action' });
		expect(
			await guardrail!.check(
				ctx({ proposed: { kind: 'action', name: 'say', arguments: { text: 'hello' } } })
			)
		).toEqual({ allow: true });
	});

	it('annotates instead when told to, and reads a stage boundary’s value', async () => {
		const [guardrail] = component.compile({ verdict: 'annotate', threshold: 0.5 }, noDeps, {
			kind: 'stage-in',
			at: 'classify'
		});
		expect(guardrail?.hooks).toEqual([]);
		expect(
			await guardrail!.check(
				ctx({
					stage: { id: 'classify', point: 'stage-in', input: 'please put this down as a card' }
				})
			)
		).toMatchObject({ allow: true, verdictKind: 'annotate', finding: { category: 'steer' } });
		expect(component.explain({ verdict: 'annotate', threshold: 0.8 })).toContain('records it');
		expect(component.explain({})).toContain('blocks the action');
	});

	it('says what each point has in hand, and declares an LLM reader’s connection and cost', () => {
		expect(subjectAt(ctx({ hook: 'pre-think', messages: [{ role: 'user', content: 'hi' }] }))).toBe(
			'hi'
		);
		expect(subjectAt(ctx({ hook: 'post-act', response: { text: 'done' } as never }))).toBe('done');
		expect(subjectAt(ctx({ stage: { id: 's', point: 'stage-out', input: 1, output: 2 } }))).toBe(2);
		expect(component).toMatchObject({ cost: { class: 'free' }, technique: 'input-classifier' });
		expect(component.connection).toBeUndefined();
		const llm = readerComponent({
			id: 'test/guard/llm',
			name: 'LLM guard',
			description: '.',
			reader: llmReader({
				id: 'test/reader/llm',
				name: 'LLM',
				description: '.',
				model: 'm',
				provider: createMockProvider({ script: [] })
			}),
			questionId: 'steer',
			question: steer
		});
		expect(llm).toMatchObject({
			cost: { class: 'local-compute' },
			connection: { kind: 'local', wraps: 'test/reader/llm', standIn: 'none' }
		});
	});
});
