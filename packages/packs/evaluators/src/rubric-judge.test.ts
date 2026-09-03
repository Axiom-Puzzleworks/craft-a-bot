import { describe, expect, it } from 'vitest';
import type { EngineEvent, EvaluationInput, LLMProvider, RunRecord } from '@craftabot/core';
import { describeConformance } from '@craftabot/pack-testkit';
import pack from './index.js';
import { judgeWithRubric, renderTranscript, rubricJudge } from './rubric-judge.js';

const RUN = { id: 'run-1', ticks: 2, usage: { inputTokens: 10, outputTokens: 5 } } as RunRecord;

function event(type: string, tick: number, payload: unknown, id = `${type}-${tick}`): EngineEvent {
	return {
		id,
		runId: 'run-1',
		agentId: 'a',
		tick,
		timestamp: '2026-09-02T12:00:00.000Z',
		type,
		payload
	} as unknown as EngineEvent;
}

const EVENTS: EngineEvent[] = [
	event('sense', 1, {
		channels: [],
		observation: { text: 'a ball', summary: 'a ball nearby', channels: {} }
	}),
	event('decision', 1, {
		thought: 'take it',
		call: { kind: 'action', name: 'pick_up', arguments: { item: 'ball' } },
		source: 'brain'
	}),
	event('action.performed', 1, {
		name: 'pick_up',
		arguments: {},
		result: { ok: true, narration: 'You pick up the ball.' }
	}),
	event('guardrail.tripped', 2, {
		guardrailId: 'x',
		hook: 'pre-act',
		reason: 'no',
		disposition: 'block-action'
	}),
	event('run.finished', 2, { outcome: 'SUCCESS' })
];

function provider(answer: string | Error): LLMProvider & { seen: string[] } {
	const seen: string[] = [];
	return {
		id: 'stub',
		name: 'Stub',
		keyRequirement: 'none',
		validateKey: () => Promise.resolve({ ok: true, message: '' }),
		chat: (req) => {
			seen.push(req.messages.map((m) => `${m.role}:${m.content}`).join('\n'));
			if (answer instanceof Error) return Promise.reject(answer);
			return Promise.resolve({
				text: answer,
				usage: { inputTokens: 1, outputTokens: 1 },
				raw: null,
				finishReason: 'stop' as const
			});
		},
		seen
	};
}

const input: EvaluationInput = { run: RUN, events: EVENTS };
const deps = (p: LLMProvider) => ({
	provider: p,
	model: 'judge-1',
	config: { rubric: 'Did the bot take the ball?' },
	fetch: globalThis.fetch,
	getCredential: () => undefined
});

describe('renderTranscript', () => {
	it('reads what was seen, thought, done and tripped, tick by tick, and keeps the newest ticks', () => {
		const lines = renderTranscript(EVENTS, 40).map((l) => `${l.tick} ${l.line}`);
		expect(lines).toEqual([
			'1 saw: a ball nearby',
			'1 thought: take it → pick_up({"item":"ball"})',
			'1 did: You pick up the ball.',
			'2 guardrail: no',
			'2 finished: SUCCESS'
		]);
		expect(renderTranscript(EVENTS, 1).every((l) => l.tick === 2)).toBe(true);
	});
});

describe('the rubric judge', () => {
	it('sends the rubric and the transcript, and scores a well-formed answer with evidence and an external record', async () => {
		const p = provider(
			'Sure! {"score": 0.9, "verdict": "pass", "explanation": "It took the ball.", "evidence": [1, 7]}'
		);
		const result = await judgeWithRubric(input, deps(p));
		expect(p.seen[0]).toContain('Did the bot take the ball?');
		expect(p.seen[0]).toContain('[tick 1] saw: a ball nearby');
		expect(result).toMatchObject({
			evaluatorId: 'evals/judge/rubric',
			verdict: 'pass',
			score: 0.9,
			explanation: 'It took the ball.'
		});
		expect(result.evidence).toEqual([{ eventId: 'sense-1', tick: 1, note: 'saw: a ball nearby' }]);
		expect(result.external).toMatchObject({
			service: 'stub',
			method: 'chat',
			endpoint: 'provider://stub/judge-1',
			outcome: 'ok'
		});
	});

	it('uses the pass mark when the answer has a score but no verdict', async () => {
		const fail = await judgeWithRubric(input, {
			...deps(provider('{"score": 0.2}')),
			config: { rubric: 'r', passMark: 0.5 }
		});
		expect(fail.verdict).toBe('fail');
		const pass = await judgeWithRubric(input, {
			...deps(provider('{"score": 0.6}')),
			config: { rubric: 'r', passMark: 0.5 }
		});
		expect(pass.verdict).toBe('pass');
	});

	it('is inconclusive — never a pass — on a malformed answer, a dead provider, no model or no rubric', async () => {
		const garbled = await judgeWithRubric(input, deps(provider('I cannot say.')));
		expect(garbled).toMatchObject({ verdict: 'inconclusive' });
		expect(garbled.external?.outcome).toBe('partial');
		const dead = await judgeWithRubric(input, deps(provider(new Error('boom'))));
		expect(dead).toMatchObject({ verdict: 'inconclusive' });
		expect(dead.external?.outcome).toBe('unavailable');
		expect(dead.explanation).toContain('boom');
		const { model: _model, ...withoutModel } = deps(provider('{}'));
		void _model;
		const noModel = await judgeWithRubric(input, withoutModel);
		expect(noModel.verdict).toBe('inconclusive');
		const noRubric = await judgeWithRubric(input, { ...deps(provider('{}')), config: {} });
		expect(noRubric.verdict).toBe('inconclusive');
	});

	it('offline is inconclusive and says so', async () => {
		const offline = await rubricJudge.createOffline!().evaluate(input, deps(provider('{}')));
		expect(offline.verdict).toBe('inconclusive');
		expect(offline.explanation).toContain('Offline');
	});
});

describeConformance({
	manifest: pack,
	evaluators: {
		[rubricJudge.id]: {
			inputs: [input],
			config: { rubric: 'r' },
			plantedSecret: 'planted-secret-xyz'
		}
	}
});
