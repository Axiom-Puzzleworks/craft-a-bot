import type {
	ActionCall,
	Executor,
	JsonSchema,
	Reader,
	ReaderExecutor,
	RuleFn,
	StageSpec,
	WorkflowConfig,
	WorkflowSpec,
	WorldState
} from '@craftabot/core';
import { hostedReader } from '@craftabot/governance';
import {
	CATEGORIES,
	CATEGORY_READER_ID,
	SUPPORT_NEEDS,
	SUPPORT_NEED_READER_ID,
	servicingDecisionKind,
	servicingWorkflow,
	type Category,
	type ServicingDeskState,
	type SupportNeed
} from '@craftabot/pack-fs-servicing';
import { JEV_LINE_ID, JEV_OPERATION, TYPESAFE_CREDENTIAL_ID, TYPESAFE_HOST } from '../jev/line.js';
import {
	CATEGORY_QUESTION,
	CATEGORY_QUESTION_V2,
	JEV_MODEL,
	NEED_QUESTION,
	NEED_QUESTION_V2,
	SPARK_35B_MODEL,
	SPARK_CLASSIFIER_LINE,
	SPARK_MODEL,
	STEER_QUESTION,
	type QuestionsVersion,
	type ServicingQuestionId
} from './questions.js';

/**
 * **The servicing journey with a pluggable reader** (`98-JEV.md` §8; on the
 * reader contract since WP120, `104-READERS.md` §10.4): the Servicing Desk's
 * journey, rebuilt from `fs-servicing`'s own stages and rules, with the two
 * judgments that read the caller's words — the classification, and the
 * support need recorded — each made by a `reader` stage and committed by the
 * next:
 *
 * 1. **the reader**, with its gate. The bank's regex (`fs-servicing`'s rule
 *    readers), Jev over its line, the DGX Spark over its classifier line, or
 *    the keyword stand-in behind the LLM contract. At or above the gate's
 *    threshold — and, on the v2 questions, with no steer — the answer stands;
 *    below it, **a person** answers instead. The scripted person answers from
 *    truth: a reviewer who is always right, so the gated configurations
 *    measure the human load a threshold costs and the accuracy it buys at
 *    best. It is not a claim about real reviewers.
 * 2. **the commit** performs what was decided — the reader's answer or the
 *    person's — on the desk.
 *
 * Everything else — identify, verify, the four-eyes confirmation, the act,
 * the closure, the handoffs — is `fs-servicing`'s, by its own rules. The
 * Servicing Desk's workflow is untouched, and nothing in the bank imports
 * this file: the experiment is an addition you install (`craftabot.config.mjs`).
 */
export const SERVICING_JEV_WORKFLOW_ID = 'typesafe/servicing-jev';
/** The same journey over the harder v2 corpus: one workflow per corpus, so an experiment names its data by the workflow it runs. */
export const SERVICING_JEV_V2_WORKFLOW_ID = 'typesafe/servicing-jev-v2';
/** Over the held-out v3 corpus. */
export const SERVICING_JEV_V3_WORKFLOW_ID = 'typesafe/servicing-jev-v3';

/** The thresholds the gates are built at — TypeSafe's own examples' bands (`98-…` §2), fixed before any run. */
export const GATE_THRESHOLDS = [0.6, 0.8, 0.9] as const;
/** P(the caller steers the label) at or above which a gate hands the call to a person (`98-…` §11): the runtime's own. */
export const STEER_THRESHOLD = 0.5;

/** The question sets a corpus's `seenBy` names (WP119, `105-CORPORA.md` §5). */
export const QUESTION_SETS: Readonly<Record<QuestionsVersion, string>> = {
	1: 'typesafe/questions/servicing-q1',
	2: 'typesafe/questions/servicing-q2'
};

// ── The readers ────────────────────────────────────────────────────────

export const JEV_READER_ID = 'typesafe/reader/jev';
export const SPARK_122B_READER_ID = 'typesafe/reader/spark-122b';
export const SPARK_35B_READER_ID = 'typesafe/reader/spark-35b';

/** Exactly the arguments the line stages were recorded with: the caller's words as the state, the version's questions, the model pinned. */
const wireRequest = (model: string) => (subject: unknown, questions: Record<string, unknown>) => ({
	model,
	state: { utterance: String(subject) },
	questions
});

const jevReader: Reader = hostedReader({
	id: JEV_READER_ID,
	name: 'Jev (TypeSafe)',
	description:
		'TypeSafe’s System One over the Jev line: calibrated probabilities from a model trained for them. Recorded; harness-only.',
	lineId: JEV_LINE_ID,
	operation: JEV_OPERATION,
	request: wireRequest(JEV_MODEL),
	egress: [
		{
			host: TYPESAFE_HOST,
			purpose: 'typed judgments over the caller’s words (Jev)',
			sends: ['observation', 'credential-header']
		}
	],
	credential: {
		id: TYPESAFE_CREDENTIAL_ID,
		name: 'TypeSafe API key',
		kind: 'bearer-token',
		keysUrl: 'https://console.typesafe.ai/keys'
	}
});

const sparkReader = (id: string, name: string, model: string): Reader =>
	hostedReader({
		id,
		name,
		description: `The builder’s DGX Spark (${model}) over its classifier line: a generative model’s first-token probabilities folded onto the options (\`99-DGX-SPARK.md\` §6). Recorded; needs the DGX Spark pack.`,
		lineId: SPARK_CLASSIFIER_LINE,
		operation: 'system-one',
		request: wireRequest(model),
		// The line declares its four hosts; the reader asks through it.
		egress: []
	});

export const TYPESAFE_READERS: Reader[] = [
	jevReader,
	sparkReader(SPARK_122B_READER_ID, 'DGX Spark, 122B', SPARK_MODEL),
	sparkReader(SPARK_35B_READER_ID, 'DGX Spark, 35B', SPARK_35B_MODEL)
];

// ── The judgments ──────────────────────────────────────────────────────

const desk = (state: WorldState): ServicingDeskState => state as ServicingDeskState;
const call = (name: string, args: unknown = {}): ActionCall => ({ name, arguments: args });
const rule = (id: string): Executor => ({ kind: 'rule', rule: id });
const subjectOf = (_input: unknown, state: WorldState): string =>
	desk(state).extra.servicing.request.subject;
const factsOf = (truth: unknown): Record<string, unknown> =>
	((truth as { facts?: Record<string, unknown> } | undefined)?.facts ?? {}) as Record<
		string,
		unknown
	>;

const optionsFor = (question: ServicingQuestionId): string[] => [
	...(question === 'category' ? CATEGORIES : SUPPORT_NEEDS)
];
const truthKey = {
	category: ['category', 'category-'],
	need: ['discloses', 'discloses-']
} as const;
const labelled = (question: ServicingQuestionId, truth: unknown): string | undefined => {
	const [key, prefix] = truthKey[question];
	const value = String(factsOf(truth)[key] ?? '').replace(prefix, '');
	return optionsFor(question).includes(value) ? value : undefined;
};

/** The questions a version asks at a judgment; v2's request carries the steer beside it. */
function questionsFor(question: ServicingQuestionId, version: QuestionsVersion) {
	if (version === 1)
		return question === 'category' ? { category: CATEGORY_QUESTION } : { need: NEED_QUESTION };
	return question === 'category'
		? { category: CATEGORY_QUESTION_V2, steer: STEER_QUESTION }
		: { need: NEED_QUESTION_V2 };
}

/** Who reads, with which questions, gated where: one configuration's executor at one judgment. */
export function readerExecutor(
	readerId: string,
	question: ServicingQuestionId,
	version: QuestionsVersion,
	threshold: number | 'off'
): ReaderExecutor {
	const options = optionsFor(question);
	const questions = questionsFor(question, version);
	return {
		kind: 'reader',
		readerId,
		questionSet: QUESTION_SETS[version],
		subject: subjectOf,
		questions: () => questions,
		output: (answers) => {
			const answer = answers[question];
			return { [question]: answer?.type === 'choice' ? answer.choice : undefined };
		},
		...(threshold === 'off'
			? {}
			: {
					gate: {
						threshold,
						else: {
							kind: 'human' as const,
							prompt: `The reader was not sure enough. Which ${question === 'category' ? 'request' : 'support need'} is this?`,
							options
						},
						...('steer' in questions ? { steer: 'steer' } : {})
					}
				})
	};
}

const JUDGMENT_OUTPUT: JsonSchema = { type: 'object' };

// ── The rules ──────────────────────────────────────────────────────────

/** What was decided — the reader's answer, or a person's — performed on the desk. */
const RULES: Record<string, RuleFn> = {
	...(servicingWorkflow.rules ?? {}),
	'commit-category': (input) => {
		const decided = input as { category?: Category; decision?: Category };
		const category = decided.decision ?? decided.category ?? 'disclosure';
		return { output: { category }, call: call('classify', { category }) };
	},
	'commit-need': (input, state) => {
		const decided = input as { need?: SupportNeed; decision?: SupportNeed };
		const need = decided.decision ?? decided.need ?? 'none';
		return {
			output: { need },
			call: call('record-support-need', { need, words: subjectOf(input, state) })
		};
	}
};

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

/** The reader and its commit for one judgment, named after the stage it replaces. */
function judgment(
	question: ServicingQuestionId,
	replaces: StageSpec,
	after: StageSpec['next']
): StageSpec[] {
	const options = optionsFor(question);
	const id = replaces.id;
	return [
		{
			id,
			name: `${replaces.name} — read`,
			...(replaces.obligations ? { obligations: replaces.obligations } : {}),
			input: { type: 'object' },
			output: JUDGMENT_OUTPUT,
			// The bank's regex by default; a configuration swaps the reader.
			executor: readerExecutor(
				question === 'category' ? CATEGORY_READER_ID : SUPPORT_NEED_READER_ID,
				question,
				1,
				'off'
			),
			// The person the gate hands an unsure call to answers from truth: always right (see the header).
			suggest: (_input, _state, truth) => labelled(question, truth),
			answerKey: (truth) => {
				const label = labelled(question, truth);
				return label ? { [question]: label } : undefined;
			},
			mayGoTo: [`${id}-commit`],
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

/** Who reads, and with which questions: the configurations' names, as the experiments name them. */
type ReaderName =
	'regex' | 'jev' | 'jev-q2' | 'spark' | 'spark-q2' | 'spark35' | 'spark35-q2' | 'llm-mock';

const READER_IDS: Record<string, { category: string; need: string }> = {
	regex: { category: CATEGORY_READER_ID, need: SUPPORT_NEED_READER_ID },
	jev: { category: JEV_READER_ID, need: JEV_READER_ID },
	spark: { category: SPARK_122B_READER_ID, need: SPARK_122B_READER_ID },
	spark35: { category: SPARK_35B_READER_ID, need: SPARK_35B_READER_ID },
	// The keyword stand-in behind the LLM contract (`@craftabot/pack-readers-llm`, installed with this pack).
	'llm-mock': { category: 'readers-llm/reader/mock', need: 'readers-llm/reader/mock' }
};

function configuration(reader: ReaderName, threshold: number | 'off'): WorkflowConfig {
	const version: QuestionsVersion = reader.endsWith('-q2') ? 2 : 1;
	const ids = READER_IDS[reader.replace(/-q2$/, '')]!;
	return {
		executors: {
			classify: readerExecutor(ids.category, 'category', version, threshold),
			record: readerExecutor(ids.need, 'need', version, threshold)
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
		(['spark', 'spark-q2', 'spark35', 'spark35-q2'] as const).flatMap((reader) => [
			[reader, configuration(reader, 'off')],
			...GATE_THRESHOLDS.map((threshold) => [
				`${reader}-gate-${threshold.toFixed(2)}`,
				configuration(reader, threshold)
			])
		])
	),
	/** The keyword stand-in behind the LLM reader's contract (WP120): the path, not a model. */
	'llm-mock': configuration('llm-mock', 'off'),
	'llm-mock-gate-0.80': configuration('llm-mock', 0.8)
};

/** The decision a stage made, for the ceilings: the record's commit answers for the servicing `record` stage; a reading decides nothing. */
function decisionKind(stageId: string, output: unknown): string | undefined {
	if (stageId === 'record' || stageId === 'classify') return undefined;
	if (stageId === 'record-commit') return servicingDecisionKind('record', output);
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
		'The servicing journey with its two readings of the caller’s words — the request and the support need — made by a reader: the bank’s regex, Jev, the DGX Spark or the LLM contract’s stand-in, with a confidence gate to a person.',
	stages: SERVICING_JEV_STAGES,
	first: 'request',
	rules: RULES,
	configurations: SERVICING_JEV_CONFIGURATIONS,
	decisionKindOf: decisionKind,
	...(book ? { book } : {})
});
