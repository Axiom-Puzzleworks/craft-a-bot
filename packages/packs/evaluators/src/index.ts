import type { PackManifest } from '@craftabot/core';
import { rubricJudge } from './rubric-judge.js';

/**
 * `@craftabot/pack-evaluators` (`31-EVALUATORS.md` §4.2, WP43): the
 * evaluators that are not anyone's vendor — the rubric judge today. A pack
 * rather than a corner of `@craftabot/evals` so it registers like every
 * other contribution and its ids are qualified (`evals/…`).
 */

export const CRAFTABOT_PACK_EVALUATORS_VERSION = '0.0.1';

const evaluatorsPack: PackManifest = {
	id: 'evals',
	name: 'Evaluators',
	version: CRAFTABOT_PACK_EVALUATORS_VERSION,
	requiresCore: '>=0.0.1',
	evaluators: [rubricJudge]
};

export default evaluatorsPack;

export {
	RUBRIC_JUDGE_ID,
	SYSTEM_PREFIX,
	judgeWithRubric,
	renderTranscript,
	rubricJudge,
	rubricJudgeConfigSchema,
	type RubricJudgeConfig,
	type TranscriptLine
} from './rubric-judge.js';
