import type {
	EvaluationInput,
	EvaluationResult,
	Evaluator,
	EvaluatorDeps,
	ExternalCallRecord
} from '@craftabot/core';
import { z } from 'zod';
import { ARMOR_CREDENTIAL_ID } from '../armor/service.js';
import { validateArmourCredential } from '../armor/validate.js';
import { createEvalClient, describeEvalEndpoint, type EvalClient } from './client.js';
import { EVAL_METRICS, normaliseScore, readEvalResponse, type EvalMetric } from './reading.js';
import { goalText, renderTranscript, transcriptText, type TranscriptLine } from './transcript.js';

/**
 * **`geap/eval/*` — the Gen AI evaluation service as an `Evaluator`**
 * (`39-HOSTED-EVALUATOR.md` §4.2, WP51; `26-…` §6.2's third shipped
 * evaluator). Three metrics over one client: `safety` (is what the bot said
 * safe), `fulfillment` (did it do what it was told), `rubric` (a pointwise
 * metric over a template of your own). Kind `hosted`: the `geap` battery,
 * declared egress to the regional Vertex AI host, and an offline stand-in
 * that says it did not call.
 *
 * The score is the service's, normalised to 0..1; the verdict is ours from
 * `passMark`, and the explanation says both. A transport failure or an
 * unreadable answer is `inconclusive`, never a pass, with the failure's kind
 * as the record's `outcome` — the same record a hosted guardrail writes.
 */

export const EVAL_ID_PREFIX = 'geap/eval/';

export const evalConfigSchema = z.object({
	projectId: z.string().min(1),
	location: z.string().min(1),
	/** A normalised score at or above this is a pass. */
	passMark: z.number().min(0).max(1).default(0.5),
	/** Ticks of transcript to send at most, newest kept. */
	maxTicks: z.number().int().positive().default(40),
	/** `geap/eval/rubric` only: the metric prompt template, with `{transcript}` and `{goal}` placeholders. */
	metricPromptTemplate: z.string().min(1).optional(),
	/** `geap/eval/rubric` only: the scale the template's score is on. */
	scale: z.number().positive().default(5),
	timeoutMs: z.number().int().positive().default(30_000)
});
export type EvalConfig = z.infer<typeof evalConfigSchema>;
export type EvalConfigInput = z.input<typeof evalConfigSchema>;

const METRIC_NAMES: Record<EvalMetric, { name: string; description: string }> = {
	safety: {
		name: 'Cloud safety score',
		description:
			'Sends the run’s own words to the Gen AI evaluation service’s safety metric: 1 is safe, 0 is not.'
	},
	fulfillment: {
		name: 'Cloud fulfillment score',
		description:
			'Sends the goal the bot was given and what it did to the evaluation service’s fulfillment metric (1–5, normalised).'
	},
	rubric: {
		name: 'Cloud rubric score',
		description:
			'Sends the run to the evaluation service as a pointwise metric over a prompt template you write.'
	}
};

export function evalIdFor(metric: EvalMetric): string {
	return `${EVAL_ID_PREFIX}${metric}`;
}

/** The request body for one metric — exported so the smoke leg and the tests build the same one. */
export function evalRequestFor(
	metric: EvalMetric,
	config: EvalConfig,
	transcript: string,
	goal: string | undefined
): unknown {
	if (metric === 'safety') {
		return { safetyInput: { metricSpec: {}, instance: { prediction: transcript } } };
	}
	if (metric === 'fulfillment') {
		return {
			fulfillmentInput: {
				metricSpec: {},
				instance: { instruction: goal ?? '', prediction: transcript }
			}
		};
	}
	return {
		pointwiseMetricInput: {
			metricSpec: { metricPromptTemplate: config.metricPromptTemplate ?? '' },
			instance: { jsonInstance: JSON.stringify({ transcript, goal: goal ?? '' }) }
		}
	};
}

function inconclusive(
	metric: EvalMetric,
	explanation: string,
	external?: ExternalCallRecord
): EvaluationResult {
	return {
		evaluatorId: evalIdFor(metric),
		verdict: 'inconclusive',
		label: 'inconclusive',
		explanation,
		evidence: [],
		...(external ? { external } : {})
	};
}

function evidenceFor(transcript: readonly TranscriptLine[]): EvaluationResult['evidence'] {
	const byTick = new Map<number, TranscriptLine>();
	for (const line of transcript) if (!byTick.has(line.tick)) byTick.set(line.tick, line);
	return [...byTick.values()].map((line) => ({ eventId: line.eventId, tick: line.tick }));
}

export interface EvaluateWithServiceOptions {
	/** Injected by tests; a real one is built from the config and `deps` otherwise. */
	client?: EvalClient;
	now?: () => number;
}

export async function evaluateWithService(
	metric: EvalMetric,
	input: EvaluationInput,
	deps: EvaluatorDeps,
	options: EvaluateWithServiceOptions = {}
): Promise<EvaluationResult> {
	const parsed = evalConfigSchema.safeParse(deps.config);
	if (!parsed.success) {
		return inconclusive(
			metric,
			'The evaluation service needs a project and a location — set them on the evaluator.'
		);
	}
	const config = parsed.data;
	if (metric === 'rubric' && config.metricPromptTemplate === undefined) {
		return inconclusive(metric, 'The rubric metric needs a metric prompt template.');
	}
	const lines = renderTranscript(input.events, config.maxTicks);
	if (lines.length === 0)
		return inconclusive(metric, 'The run has nothing the service could score.');
	const transcript = transcriptText(lines);
	const goal = goalText(input.events);
	const request = evalRequestFor(metric, config, transcript, goal);
	const now = options.now ?? (() => Date.now());
	const client =
		options.client ??
		createEvalClient({
			projectId: config.projectId,
			location: config.location,
			timeoutMs: config.timeoutMs,
			fetch: deps.fetch,
			token: () => deps.getCredential(ARMOR_CREDENTIAL_ID)
		});
	const record = {
		service: 'geap/evaluation',
		method: 'evaluateInstances',
		endpoint: describeEvalEndpoint(config),
		policyRef: metric,
		charsScreened: transcript.length
	};
	const startedAt = now();
	const result = await client.evaluate(request);
	const latencyMs = Math.max(0, now() - startedAt);
	if ('error' in result) {
		return inconclusive(
			metric,
			`The evaluation service could not be reached: ${result.error.message}`,
			{
				...record,
				latencyMs,
				outcome: result.error.kind
			}
		);
	}
	const reading = readEvalResponse(result.response, metric);
	const external: ExternalCallRecord = { ...record, latencyMs, outcome: reading.outcome };
	if (reading.outcome !== 'ok' || reading.score === undefined) {
		return inconclusive(metric, reading.explanation, external);
	}
	const score = normaliseScore(metric, reading.score, config.scale);
	const pass = score >= config.passMark;
	const scoreLine = `${METRIC_NAMES[metric].name}: ${reading.score} (${Math.round(score * 100)}% of the scale; the pass mark is ${Math.round(config.passMark * 100)}%).`;
	return {
		evaluatorId: evalIdFor(metric),
		verdict: pass ? 'pass' : 'fail',
		score,
		label: pass ? 'pass' : 'fail',
		explanation: reading.explanation ? `${scoreLine} ${reading.explanation}` : scoreLine,
		evidence: evidenceFor(lines),
		external
	};
}

/** The record an offline stand-in writes: no call, and the trace says so. */
export function offlineResult(metric: EvalMetric, config: unknown): EvaluationResult {
	const parsed = evalConfigSchema.safeParse(config);
	return inconclusive(metric, 'Offline: the evaluation service was not called — inconclusive.', {
		service: 'geap/evaluation',
		method: 'evaluateInstances',
		endpoint: parsed.success ? describeEvalEndpoint(parsed.data) : 'unset',
		policyRef: metric,
		latencyMs: 0,
		charsScreened: 0,
		outcome: 'offline'
	});
}

export function evalEvaluator(metric: EvalMetric): Evaluator {
	return {
		id: evalIdFor(metric),
		name: METRIC_NAMES[metric].name,
		description: METRIC_NAMES[metric].description,
		kind: 'hosted',
		configSchema: evalConfigSchema,
		credential: {
			id: ARMOR_CREDENTIAL_ID,
			name: 'Cloud Armour',
			kind: 'oauth-token',
			validate: validateArmourCredential
		},
		egress: [
			{
				host: '*-aiplatform.googleapis.com',
				purpose: 'evaluation',
				sends: ['trace', 'credential-header']
			}
		],
		evaluate: (input, deps) => evaluateWithService(metric, input, deps),
		createOffline: () => ({
			evaluate: (_input, deps) => Promise.resolve(offlineResult(metric, deps.config))
		})
	};
}

export const safetyEvaluator = evalEvaluator('safety');
export const fulfillmentEvaluator = evalEvaluator('fulfillment');
export const rubricEvaluator = evalEvaluator('rubric');
export const evalEvaluators: readonly Evaluator[] = EVAL_METRICS.map(evalEvaluator);
