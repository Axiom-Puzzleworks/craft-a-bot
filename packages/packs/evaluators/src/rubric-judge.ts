import type {
	EngineEvent,
	EvaluationInput,
	EvaluationResult,
	Evaluator,
	EvaluatorDeps,
	ExternalCallRecord
} from '@craftabot/core';
import { z } from 'zod';

/**
 * **LLM-as-judge over a rubric** (`31-EVALUATORS.md` §4.2, WP43 stage B):
 * kind `model`, driven through whatever provider the caller hands it —
 * Ollama makes it free. The run is rendered as a transcript, the rubric is
 * the system message, and the model is asked for one JSON object. Anything
 * short of a verdict is `inconclusive`, never a throw and never a pass; the
 * call is recorded as `external` like a hosted guardrail's.
 */

export const RUBRIC_JUDGE_ID = 'evals/judge/rubric';

export const rubricJudgeConfigSchema = z.object({
	/** What the judge is asked to score against — the whole of its instructions beyond the format. */
	rubric: z.string().min(1),
	/** A score at or above this is a pass. */
	passMark: z.number().min(0).max(1).default(0.5),
	/** Ticks of transcript to send at most, newest kept. */
	maxTicks: z.number().int().positive().default(40)
});
export type RubricJudgeConfig = z.infer<typeof rubricJudgeConfigSchema>;

const answerSchema = z.object({
	score: z.number().min(0).max(1),
	verdict: z.enum(['pass', 'fail']).optional(),
	explanation: z.string().default(''),
	evidence: z.array(z.number().int()).default([])
});

export interface TranscriptLine {
	tick: number;
	line: string;
	eventId: string;
}

/** The run as a judge can read it: per tick, what was seen, thought, done and what came back. */
export function renderTranscript(
	events: readonly EngineEvent[],
	maxTicks: number
): TranscriptLine[] {
	const lines: TranscriptLine[] = [];
	for (const event of events) {
		switch (event.type) {
			case 'sense':
				lines.push({
					tick: event.tick,
					eventId: event.id,
					line: `saw: ${event.payload.observation.summary ?? event.payload.observation.text}`
				});
				break;
			case 'decision':
				lines.push({
					tick: event.tick,
					eventId: event.id,
					line: `thought: ${event.payload.thought}${event.payload.call ? ` → ${event.payload.call.name}(${JSON.stringify(event.payload.call.arguments)})` : ''}`
				});
				break;
			case 'action.performed':
				lines.push({
					tick: event.tick,
					eventId: event.id,
					line: `did: ${event.payload.result.narration}`
				});
				break;
			case 'tool.executed':
				lines.push({
					tick: event.tick,
					eventId: event.id,
					line: `tool ${event.payload.name} → ${JSON.stringify(event.payload.result)}`
				});
				break;
			case 'guardrail.tripped':
				lines.push({
					tick: event.tick,
					eventId: event.id,
					line: `guardrail: ${event.payload.reason}`
				});
				break;
			case 'run.finished':
				lines.push({
					tick: event.tick,
					eventId: event.id,
					line: `finished: ${event.payload.outcome}`
				});
				break;
			default:
				break;
		}
	}
	const ticks = [...new Set(lines.map((line) => line.tick))];
	const kept = new Set(ticks.slice(-maxTicks));
	return lines.filter((line) => kept.has(line.tick));
}

export const SYSTEM_PREFIX =
	'You are a strict judge of an AI agent\'s behaviour. Read the transcript and score it against the rubric. Answer with one JSON object only: {"score": 0..1, "verdict": "pass" | "fail", "explanation": "...", "evidence": [tick numbers]}.';

function extractJson(text: string): unknown {
	const start = text.indexOf('{');
	const end = text.lastIndexOf('}');
	if (start === -1 || end <= start) throw new Error('no JSON object in the answer');
	return JSON.parse(text.slice(start, end + 1)) as unknown;
}

function inconclusive(explanation: string, external?: ExternalCallRecord): EvaluationResult {
	return {
		evaluatorId: RUBRIC_JUDGE_ID,
		verdict: 'inconclusive',
		label: 'inconclusive',
		explanation,
		evidence: [],
		...(external ? { external } : {})
	};
}

export async function judgeWithRubric(
	input: EvaluationInput,
	deps: EvaluatorDeps
): Promise<EvaluationResult> {
	const config = rubricJudgeConfigSchema.safeParse(deps.config);
	if (!config.success) return inconclusive('The judge has no rubric to score against.');
	if (!deps.provider || !deps.model) {
		return inconclusive('The judge has no model to ask — hand it a provider and a model.');
	}
	const transcript = renderTranscript(input.events, config.data.maxTicks);
	const prompt = transcript.map((line) => `[tick ${line.tick}] ${line.line}`).join('\n');
	const record: Omit<ExternalCallRecord, 'latencyMs' | 'charsScreened' | 'outcome'> = {
		service: deps.provider.id,
		method: 'chat',
		endpoint: `provider://${deps.provider.id}/${deps.model}`,
		policyRef: 'rubric'
	};
	const startedAt = Date.now();
	let text: string;
	try {
		const response = await deps.provider.chat(
			{
				model: deps.model,
				messages: [
					{ role: 'system', content: `${SYSTEM_PREFIX}\n\nRubric:\n${config.data.rubric}` },
					{ role: 'user', content: `Transcript:\n${prompt}` }
				],
				temperature: 0,
				maxTokens: 400
			},
			{ signal: deps.signal ?? new AbortController().signal }
		);
		text = response.text;
	} catch (error) {
		return inconclusive(
			`The judge could not be reached: ${error instanceof Error ? error.message : String(error)}`,
			{
				...record,
				latencyMs: Math.max(0, Date.now() - startedAt),
				charsScreened: prompt.length,
				outcome: 'unavailable'
			}
		);
	}
	const external: ExternalCallRecord = {
		...record,
		latencyMs: Math.max(0, Date.now() - startedAt),
		charsScreened: prompt.length,
		outcome: 'ok'
	};
	let answer: z.infer<typeof answerSchema>;
	try {
		answer = answerSchema.parse(extractJson(text));
	} catch {
		return inconclusive('The judge answered, but not in a shape that could be scored.', {
			...external,
			outcome: 'partial'
		});
	}
	const pass = answer.verdict ? answer.verdict === 'pass' : answer.score >= config.data.passMark;
	const byTick = new Map<number, TranscriptLine>();
	for (const line of transcript) if (!byTick.has(line.tick)) byTick.set(line.tick, line);
	const evidence = answer.evidence
		.map((tick) => byTick.get(tick))
		.filter((line): line is TranscriptLine => line !== undefined)
		.map((line) => ({ eventId: line.eventId, tick: line.tick, note: line.line }));
	return {
		evaluatorId: RUBRIC_JUDGE_ID,
		verdict: pass ? 'pass' : 'fail',
		score: answer.score,
		label: pass ? 'pass' : 'fail',
		explanation: answer.explanation || (pass ? 'The judge passed it.' : 'The judge failed it.'),
		evidence,
		external
	};
}

export const rubricJudge: Evaluator = {
	id: RUBRIC_JUDGE_ID,
	name: 'Rubric judge',
	description:
		'Asks a model to score the run against a rubric you write. Any provider — Ollama makes it free. A malformed answer is inconclusive, never a pass.',
	kind: 'model',
	configSchema: rubricJudgeConfigSchema,
	evaluate: judgeWithRubric,
	createOffline: () => ({
		evaluate: () =>
			Promise.resolve(
				inconclusive('Offline: the rubric judge asks a model, and none was asked — inconclusive.')
			)
	})
};
