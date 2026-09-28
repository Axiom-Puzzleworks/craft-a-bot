import type {
	ActionCall,
	Executor,
	JsonSchema,
	RuleFn,
	StageSpec,
	WorkflowConfig,
	WorkflowSpec,
	WorldState
} from '@craftabot/core';
import {
	CATEGORIES,
	SUPPORT_NEEDS,
	classificationOf,
	needIn,
	servicingDecisionKind,
	servicingWorkflow,
	type Category,
	type ServicingDeskState,
	type SupportNeed
} from '@craftabot/pack-fs-servicing';
import { JEV_LINE_ID, JEV_OPERATION } from '../jev/line.js';
import type { JevChoiceAnswer, JevResponse } from '../jev/types.js';
import {
	SPARK_CLASSIFIER_LINE,
	servicingJevRequest,
	servicingSparkRequest,
	type QuestionsVersion,
	type ServicingQuestionId
} from './questions.js';

/**
 * **The servicing journey with a pluggable reader** (`98-JEV.md` §8): the
 * Servicing Desk's journey, rebuilt from `fs-servicing`'s own stages and
 * rules, with the two judgments that read the caller's words — the
 * classification, and the support need recorded — each split into three:
 *
 * 1. **a reader.** The bank's regex rule (`classificationOf`, `needIn`), or Jev
 *    over the line. Both answer in Jev's shape: the regex as a choice at
 *    confidence 1, which is what a rule claims.
 * 2. **a gate.** It acts on the reader's answer at or above a confidence
 *    threshold, and otherwise hands the item to a person. `gate-off` always
 *    acts.
 * 3. **a person's review.** A `human` stage whose scripted reviewer answers
 *    from truth. This models a reviewer who is always right, so the gated
 *    configurations measure the human load a threshold costs and the
 *    accuracy it buys at best. It is not a claim about real reviewers.
 *
 * Everything else — identify, verify, the four-eyes confirmation, the act,
 * the closure, the handoffs — is `fs-servicing`'s, by its own rules. The
 * Servicing Desk's workflow is untouched, and nothing in the bank imports
 * this file: the experiment is an addition you install
 * (`craftabot.config.mjs`), not a change to the design.
 */
export const SERVICING_JEV_WORKFLOW_ID = 'typesafe/servicing-jev';
/** The same journey over the harder v2 corpus (`corpus-v2.ts`): one workflow per corpus, so an experiment names its data by the workflow it runs. */
export const SERVICING_JEV_V2_WORKFLOW_ID = 'typesafe/servicing-jev-v2';
/** Over the held-out v3 corpus (`corpus-v3.ts`). */
export const SERVICING_JEV_V3_WORKFLOW_ID = 'typesafe/servicing-jev-v3';

/** The thresholds the gates are built at — TypeSafe's own examples' bands (`98-…` §2), fixed before any run. */
export const GATE_THRESHOLDS = [0.6, 0.8, 0.9] as const;

const desk = (state: WorldState): ServicingDeskState => state as ServicingDeskState;
const call = (name: string, args: unknown = {}): ActionCall => ({ name, arguments: args });
const rule = (id: string): Executor => ({ kind: 'rule', rule: id });
const subjectOf = (state: WorldState): string => desk(state).extra.servicing.request.subject;
const factsOf = (truth: unknown): Record<string, unknown> =>
	((truth as { facts?: Record<string, unknown> } | undefined)?.facts ?? {}) as Record<
		string,
		unknown
	>;

// ── Readers ────────────────────────────────────────────────────────────

/** A rule's answer in Jev's shape: all the probability on its one pick. */
function asAnswer(question: ServicingQuestionId, choice: string, options: readonly string[]) {
	const response: JevResponse = {
		model: 'regex',
		answers: {
			[question]: {
				type: 'choice',
				choice,
				confidence: 1,
				probabilities: Object.fromEntries(
					options.map((option) => [option, option === choice ? 1 : 0])
				)
			}
		},
		usage: { input_tokens: 0, output_tokens: 0 }
	};
	return response;
}

/** Jev over the line: the caller's words, the frozen questions of a version — the same arguments the recording made. */
export const jevReader = (
	question: ServicingQuestionId,
	version: QuestionsVersion = 1
): Executor => ({
	kind: 'line',
	lineId: JEV_LINE_ID,
	operation: JEV_OPERATION,
	arguments: (_input, state) => servicingJevRequest(question, subjectOf(state), version)
});

/**
 * The Spark over its classifier line (`@craftabot/pack-dgx-spark`): the same
 * questions and the same answer shape as Jev, from a local LLM. The line is
 * content from another pack, named here by id alone, so it must be installed
 * (the harness's default packs carry it) for these configurations to run.
 */
export const sparkReader = (
	question: ServicingQuestionId,
	version: QuestionsVersion = 1
): Executor => ({
	kind: 'line',
	lineId: SPARK_CLASSIFIER_LINE,
	operation: 'system-one',
	arguments: (_input, state) => servicingSparkRequest(question, subjectOf(state), version)
});

const READER_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['model', 'answers'],
	properties: { model: { type: 'string' }, answers: { type: 'object' } }
};

// ── Gates ──────────────────────────────────────────────────────────────

export const gateRuleId = (question: ServicingQuestionId, threshold: number | 'off') =>
	`gate-${question}-${threshold === 'off' ? 'off' : threshold.toFixed(2)}`;

function answerIn(input: unknown, question: ServicingQuestionId): JevChoiceAnswer | undefined {
	const answer = (input as Partial<JevResponse> | undefined)?.answers?.[question];
	return answer?.type === 'choice' ? answer : undefined;
}

/** P(the caller steers the label) at or above which a gate hands the call to a person (`98-…` §11): the even split, fixed in advance. */
export const STEER_THRESHOLD = 0.5;

function steerIn(input: unknown): number | undefined {
	const answer = (input as Partial<JevResponse> | undefined)?.answers?.['steer'];
	return answer?.type === 'noul' ? answer.noul : undefined;
}

/**
 * The gate: act on the reader's answer when its confidence clears the
 * threshold, else route to a person. An answer outside the desk's own
 * options, or none at all, always goes to a person. A gate, but not
 * `gate-off`, also sends to a person a call whose reader says the caller
 * steered the label (the v2 questions' `steer`). v1's answers carry no
 * steer, so they gate exactly as before.
 */
function gate(question: ServicingQuestionId, threshold: number): RuleFn {
	const options: readonly string[] = question === 'category' ? CATEGORIES : SUPPORT_NEEDS;
	return (input, state) => {
		const answer = answerIn(input, question);
		const picked = answer && options.includes(answer.choice) ? answer.choice : undefined;
		const confidence = answer?.confidence ?? 0;
		const steer = steerIn(input);
		const steered = threshold > 0 && steer !== undefined && steer >= STEER_THRESHOLD;
		if (picked === undefined || confidence < threshold || steered) {
			return {
				output: {
					route: 'person',
					...(picked ? { [question]: picked } : {}),
					confidence,
					...(steer !== undefined ? { steer } : {})
				}
			};
		}
		return {
			output: {
				route: 'auto',
				[question]: picked,
				confidence,
				...(steer !== undefined ? { steer } : {})
			},
			call:
				question === 'category'
					? call('classify', { category: picked })
					: call('record-support-need', { need: picked, words: subjectOf(state) })
		};
	};
}

const GATE_OUTPUT = (question: ServicingQuestionId): JsonSchema => ({
	type: 'object',
	required: ['route'],
	properties: {
		route: { enum: ['auto', 'person'] },
		[question]: { enum: [...(question === 'category' ? CATEGORIES : SUPPORT_NEEDS)] },
		confidence: { type: 'number' },
		steer: { type: 'number' }
	}
});

// ── The rules ──────────────────────────────────────────────────────────

const RULES: Record<string, RuleFn> = {
	...(servicingWorkflow.rules ?? {}),
	'regex-category': (_input, state) => ({
		output: asAnswer('category', classificationOf(subjectOf(state)), CATEGORIES)
	}),
	'regex-need': (_input, state) => ({
		output: asAnswer('need', needIn(subjectOf(state)), SUPPORT_NEEDS)
	}),
	'commit-category': (input) => {
		const category = (input as { decision?: Category }).decision ?? 'disclosure';
		return { output: { category }, call: call('classify', { category }) };
	},
	'commit-need': (input, state) => {
		const need = (input as { decision?: SupportNeed }).decision ?? 'none';
		return {
			output: { need },
			call: call('record-support-need', { need, words: subjectOf(state) })
		};
	}
};
for (const question of ['category', 'need'] as const) {
	RULES[gateRuleId(question, 'off')] = gate(question, 0);
	for (const threshold of GATE_THRESHOLDS)
		RULES[gateRuleId(question, threshold)] = gate(question, threshold);
}

// ── The stages ─────────────────────────────────────────────────────────

const servicingStage = (id: string): StageSpec => {
	const stage = servicingWorkflow.stages.find((candidate) => candidate.id === id);
	if (!stage) throw new Error(`fs-servicing has no stage '${id}'`);
	return stage;
};

/** A servicing stage on its own rule rather than the agent — no brain runs in this journey. */
const byRule = (id: string, ruleId = `${id}-v1`): StageSpec => ({
	...servicingStage(id),
	executor: rule(ruleId)
});

const classify = servicingStage('classify');
const record = servicingStage('record');

/** Reader, gate, review and commit for one judgment, named after the stage it replaces. */
function judgment(
	question: ServicingQuestionId,
	replaces: StageSpec,
	after: StageSpec['next']
): StageSpec[] {
	const options = [...(question === 'category' ? CATEGORIES : SUPPORT_NEEDS)];
	const truthKey = question === 'category' ? 'category' : 'discloses';
	const truthPrefix = question === 'category' ? 'category-' : 'discloses-';
	const id = replaces.id;
	return [
		{
			id,
			name: `${replaces.name} — read`,
			...(replaces.obligations ? { obligations: replaces.obligations } : {}),
			input: { type: 'object' },
			output: READER_OUTPUT,
			executor: rule(`regex-${question}`),
			next: () => `${id}-gate`
		},
		{
			id: `${id}-gate`,
			name: `${replaces.name} — gate`,
			input: READER_OUTPUT,
			output: GATE_OUTPUT(question),
			executor: rule(gateRuleId(question, 'off')),
			next: (out, state, input) =>
				(out as { route?: string }).route === 'person' ? `${id}-review` : after(out, state, input)
		},
		{
			id: `${id}-review`,
			name: `${replaces.name} — a person reviews`,
			input: GATE_OUTPUT(question),
			output: {
				type: 'object',
				required: ['decision'],
				properties: { decision: { enum: options } }
			},
			executor: {
				kind: 'human',
				prompt: `The reader was not sure enough. Which ${question === 'category' ? 'request' : 'support need'} is this?`,
				options
			},
			// The scripted reviewer answers from truth: a person who is always right (see the header).
			suggest: (_input, _state, truth) => {
				const labelled = String(factsOf(truth)[truthKey] ?? '').replace(truthPrefix, '');
				return options.includes(labelled as never) ? labelled : undefined;
			},
			next: () => `${id}-commit`
		},
		{
			id: `${id}-commit`,
			name: `${replaces.name} — commit`,
			input: { type: 'object' },
			output:
				question === 'category'
					? { type: 'object', required: ['category'], properties: { category: { enum: options } } }
					: { type: 'object', required: ['need'], properties: { need: { enum: options } } },
			executor: rule(`commit-${question}`),
			next: after
		}
	];
}

export const SERVICING_JEV_STAGES: StageSpec[] = [
	byRule('request'),
	byRule('identify'),
	...judgment('category', classify, () => 'verify'),
	byRule('verify'),
	servicingStage('confirm'),
	byRule('act'),
	...judgment('need', record, record.next),
	byRule('close', 'act-v1')
];

// ── The configurations ─────────────────────────────────────────────────

/** The one thing each configuration varies: who reads (and with which questions), and where the gate sits. */
type ReaderId = 'regex' | 'jev' | 'jev-q2' | 'spark' | 'spark-q2';

function reads(reader: ReaderId, question: ServicingQuestionId): Executor {
	if (reader === 'regex') return rule(question === 'category' ? 'regex-category' : 'regex-need');
	const version: QuestionsVersion = reader.endsWith('-q2') ? 2 : 1;
	return reader.startsWith('spark') ? sparkReader(question, version) : jevReader(question, version);
}

function configuration(reader: ReaderId, threshold: number | 'off'): WorkflowConfig {
	return {
		executors: {
			classify: reads(reader, 'category'),
			record: reads(reader, 'need'),
			'classify-gate': rule(gateRuleId('category', threshold)),
			'record-gate': rule(gateRuleId('need', threshold))
		}
	};
}

export const SERVICING_JEV_CONFIGURATIONS: Record<string, WorkflowConfig> = {
	/** The control: the bank's regex reads, and acts on every answer. */
	regex: configuration('regex', 'off'),
	/** Jev reads, and the desk acts on every answer. */
	jev: configuration('jev', 'off'),
	...Object.fromEntries(
		GATE_THRESHOLDS.map((threshold) => [
			`jev-gate-${threshold.toFixed(2)}`,
			configuration('jev', threshold)
		])
	),
	/** Jev with the v2 questions (the guide's rules in the criteria, and the steer), acting on every answer. */
	'jev-q2': configuration('jev-q2', 'off'),
	/** The v2 questions gated: below the threshold, or a steer, goes to a person. */
	...Object.fromEntries(
		GATE_THRESHOLDS.map((threshold) => [
			`jev-q2-gate-${threshold.toFixed(2)}`,
			configuration('jev-q2', threshold)
		])
	),
	/** The local LLM on the DGX Sparks (`99-DGX-SPARK.md` §6), on the same questions, gated or not. */
	...Object.fromEntries(
		(['spark', 'spark-q2'] as const).flatMap((reader) => [
			[reader, configuration(reader, 'off')],
			...GATE_THRESHOLDS.map((threshold) => [
				`${reader}-gate-${threshold.toFixed(2)}`,
				configuration(reader, threshold)
			])
		])
	)
};

/** The decision a stage made, for the ceilings: the record's gate and commit answer for the servicing `record` stage; a hand to a person decides nothing. */
function decisionKind(stageId: string, output: unknown): string | undefined {
	if (stageId === 'record' || stageId === 'classify') return undefined;
	if (stageId === 'record-gate' || stageId === 'record-commit') {
		if ((output as { route?: string } | undefined)?.route === 'person') return undefined;
		return servicingDecisionKind('record', output);
	}
	return servicingDecisionKind(stageId, output);
}

export const servicingJevWorkflow = (
	book: WorkflowSpec['book'],
	options: { id?: string; corpus?: string } = {}
): WorkflowSpec => ({
	...servicingWorkflow,
	id: options.id ?? SERVICING_JEV_WORKFLOW_ID,
	name: `Servicing, with a pluggable reader (Jev experiment${options.corpus ? `, ${options.corpus}` : ''})`,
	purpose:
		'The servicing journey with its two readings of the caller’s words — the request and the support need — made pluggable: the bank’s regex or Jev, with a confidence gate to a person.',
	stages: SERVICING_JEV_STAGES,
	first: 'request',
	rules: RULES,
	configurations: SERVICING_JEV_CONFIGURATIONS,
	decisionKindOf: decisionKind,
	...(book ? { book } : {})
});
