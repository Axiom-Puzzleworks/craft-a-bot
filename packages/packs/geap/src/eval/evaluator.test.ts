import type { EngineEvent, EvaluationInput } from '@craftabot/core';
import { makeRun } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { evalFixtures } from '../fixtures/eval/index.js';
import trace from '../fixtures/trace.geap-armour-offline.v1.json' with { type: 'json' };
import type { EvalClient } from './client.js';
import {
	evalEvaluators,
	evalIdFor,
	evalRequestFor,
	evaluateWithService,
	fulfillmentEvaluator,
	rubricEvaluator,
	safetyEvaluator
} from './evaluator.js';
import { goalText, renderTranscript } from './transcript.js';

/**
 * The three evaluators over a canned client (`39-…` §4.2): the request each
 * builds, the verdict each draws from a fixture, the record each writes —
 * and every way short of a verdict answering `inconclusive`.
 */

const events = trace as unknown as EngineEvent[];
const input: EvaluationInput = { run: makeRun({ id: events[0]?.runId ?? '' }), events };
const config = { projectId: 'proj-1', location: 'europe-west2' };
const deps = {
	config,
	fetch: (() => Promise.reject(new Error('not in this test'))) as typeof globalThis.fetch,
	getCredential: () => 'ya29.planted'
};

function answering(body: unknown, seen: { request?: unknown } = {}): EvalClient {
	return {
		evaluate: (request) => {
			seen.request = request;
			return Promise.resolve({ response: body });
		}
	};
}

describe('the transcript', () => {
	it('renders the run’s words and deeds per tick, and finds the goal in the composed prompt', () => {
		const lines = renderTranscript(events, 40);
		expect(lines.length).toBeGreaterThan(3);
		expect(lines.some((line) => line.line.startsWith('thought:'))).toBe(true);
		expect(lines.some((line) => line.line.startsWith('did:'))).toBe(true);
		expect(goalText(events)).toContain('robot');
	});
});

describe('geap/eval/*', () => {
	it('ships three hosted evaluators on the geap battery with the regional egress declared', () => {
		expect(evalEvaluators.map((evaluator) => evaluator.id)).toEqual([
			'geap/eval/safety',
			'geap/eval/fulfillment',
			'geap/eval/rubric'
		]);
		for (const evaluator of evalEvaluators) {
			expect(evaluator.kind).toBe('hosted');
			expect(evaluator.credential?.id).toBe('geap');
			expect(evaluator.egress?.[0]?.host).toBe('*-aiplatform.googleapis.com');
			expect(typeof evaluator.createOffline).toBe('function');
		}
	});

	it('safety: sends the transcript as the prediction and passes a safe answer', async () => {
		const seen: { request?: unknown } = {};
		const result = await evaluateWithService('safety', input, deps, {
			client: answering(evalFixtures['safety-safe'], seen),
			now: () => 0
		});
		expect(seen.request).toMatchObject({
			safetyInput: { instance: { prediction: expect.stringContaining('[tick 1]') } }
		});
		expect(result).toMatchObject({
			evaluatorId: 'geap/eval/safety',
			verdict: 'pass',
			score: 1,
			external: {
				service: 'geap/evaluation',
				method: 'evaluateInstances',
				policyRef: 'safety',
				outcome: 'ok',
				endpoint: expect.stringContaining('europe-west2-aiplatform')
			}
		});
		expect(result.explanation).toContain('pass mark is 50%');
		expect(result.evidence.length).toBeGreaterThan(0);
		expect(result.evidence.every((row) => events.some((event) => event.id === row.eventId))).toBe(
			true
		);
	});

	it('safety: fails an unsafe answer; fulfillment: sends the goal and normalises 1..5', async () => {
		const unsafe = await evaluateWithService('safety', input, deps, {
			client: answering(evalFixtures['safety-unsafe'])
		});
		expect(unsafe).toMatchObject({ verdict: 'fail', score: 0 });

		const seen: { request?: unknown } = {};
		const high = await evaluateWithService('fulfillment', input, deps, {
			client: answering(evalFixtures['fulfillment-high'], seen)
		});
		expect(seen.request).toMatchObject({
			fulfillmentInput: { instance: { instruction: expect.stringContaining('robot') } }
		});
		expect(high).toMatchObject({ verdict: 'pass', score: 1 });
		const low = await evaluateWithService('fulfillment', input, deps, {
			client: answering(evalFixtures['fulfillment-low'])
		});
		expect(low).toMatchObject({ verdict: 'fail', score: 0 });
	});

	it('rubric: needs a template, sends it with a JSON instance, and scales the score', async () => {
		expect(
			await evaluateWithService('rubric', input, deps, {
				client: answering(evalFixtures.pointwise)
			})
		).toMatchObject({
			verdict: 'inconclusive',
			explanation: expect.stringContaining('template')
		});
		const seen: { request?: unknown } = {};
		const result = await evaluateWithService(
			'rubric',
			input,
			{
				...deps,
				config: { ...config, metricPromptTemplate: 'Rate {transcript} against {goal} from 1 to 5.' }
			},
			{ client: answering(evalFixtures.pointwise, seen) }
		);
		expect(seen.request).toMatchObject({
			pointwiseMetricInput: {
				metricSpec: { metricPromptTemplate: expect.stringContaining('Rate') },
				instance: { jsonInstance: expect.stringContaining('"transcript"') }
			}
		});
		expect(result).toMatchObject({ verdict: 'pass', score: 0.8 });
	});

	it('is inconclusive, never a pass, without a config, with a transport failure, or with the wrong result', async () => {
		expect(
			await evaluateWithService('safety', input, { ...deps, config: undefined })
		).toMatchObject({
			verdict: 'inconclusive'
		});
		const refused = await evaluateWithService('safety', input, deps, {
			client: { evaluate: () => Promise.resolve({ error: { kind: 'bad-token', message: 'nope' } }) }
		});
		expect(refused).toMatchObject({ verdict: 'inconclusive', external: { outcome: 'bad-token' } });
		const wrong = await evaluateWithService('safety', input, deps, {
			client: answering(evalFixtures['fulfillment-high'])
		});
		expect(wrong).toMatchObject({ verdict: 'inconclusive', external: { outcome: 'partial' } });
		const empty = await evaluateWithService('safety', { ...input, events: [] }, deps, {
			client: answering(evalFixtures['safety-safe'])
		});
		expect(empty.verdict).toBe('inconclusive');
	});

	it('offline says it did not call, with the endpoint it would have used', async () => {
		const offline = safetyEvaluator.createOffline?.();
		const result = await offline!.evaluate(input, deps);
		expect(result).toMatchObject({
			evaluatorId: evalIdFor('safety'),
			verdict: 'inconclusive',
			external: { outcome: 'offline', latencyMs: 0, endpoint: expect.stringContaining('proj-1') }
		});
		expect(
			(await fulfillmentEvaluator.createOffline!().evaluate(input, { ...deps, config: undefined }))
				.external?.endpoint
		).toBe('unset');
	});

	it('builds the same request the smoke leg sends', () => {
		const request = evalRequestFor(
			'safety',
			{ ...config, passMark: 0.5, maxTicks: 40, scale: 5, timeoutMs: 1 },
			'hello',
			undefined
		);
		expect(request).toEqual({ safetyInput: { metricSpec: {}, instance: { prediction: 'hello' } } });
		expect(rubricEvaluator.configSchema).toBeDefined();
	});
});
