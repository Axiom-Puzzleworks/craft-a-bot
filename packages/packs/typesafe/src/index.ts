import type { PackManifest } from '@craftabot/core';
import { jevLine } from './jev/line.js';
import { corpusBook } from './servicing/book.js';
import { SERVICING_CORPUS_V2 } from './servicing/corpus-v2.js';
import { servicingJevEvaluators } from './servicing/evaluators.js';
import { SERVICING_JEV_V2_WORKFLOW_ID, servicingJevWorkflow } from './servicing/workflow.js';

/**
 * **TypeSafe (Jev), as an optional experiment pack** (`98-JEV.md`). It holds:
 * - the Jev service line, recorded and harness-only;
 * - the servicing journey with a pluggable reader;
 * - the labelled corpus as its book;
 * - two evaluators.
 *
 * The pack is **not** in the harness's default list, the Workshop's or any
 * edition's. It is installed by `craftabot.config.mjs` beside this
 * package, so running without it is running Craft A Bot as it was.
 */
export const TYPESAFE_PACK_ID = 'typesafe';

export const typesafePack: PackManifest = {
	id: TYPESAFE_PACK_ID,
	name: 'TypeSafe Jev (experiment)',
	version: '0.1.0',
	requiresCore: '>=1.0.0',
	requiresPacks: { 'fs-bank': '^1.0.0', 'fs-servicing': '^1.0.0' },
	serviceLines: [jevLine],
	workflows: [
		servicingJevWorkflow(corpusBook),
		servicingJevWorkflow((request) => corpusBook(request, SERVICING_CORPUS_V2), {
			id: SERVICING_JEV_V2_WORKFLOW_ID,
			corpus: 'v2'
		})
	],
	evaluators: servicingJevEvaluators
};

export default typesafePack;

export {
	JEV_LINE_ID,
	JEV_OPERATION,
	TYPESAFE_CREDENTIAL_ID,
	TYPESAFE_HOST,
	callSystemOne,
	describeAnswers,
	jevLine
} from './jev/line.js';
export type * from './jev/types.js';
export { SERVICING_CORPUS, type CorpusRow, type Difficulty } from './servicing/corpus.js';
export { SERVICING_CORPUS_V2 } from './servicing/corpus-v2.js';
export {
	CATEGORY_QUESTION,
	JEV_MODEL,
	NEED_QUESTION,
	QUESTIONS_VERSION,
	servicingJevRequest
} from './servicing/questions.js';
export { corpusBook } from './servicing/book.js';
export {
	NEED_DETECTED_ID,
	NEED_MATCHES_LABEL_ID,
	needDetected,
	needMatchesLabel,
	servicingJevEvaluators
} from './servicing/evaluators.js';
export {
	GATE_THRESHOLDS,
	SERVICING_JEV_CONFIGURATIONS,
	SERVICING_JEV_STAGES,
	SERVICING_JEV_V2_WORKFLOW_ID,
	SERVICING_JEV_WORKFLOW_ID,
	gateRuleId,
	jevReader,
	servicingJevWorkflow
} from './servicing/workflow.js';
