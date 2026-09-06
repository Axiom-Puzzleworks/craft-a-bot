import type { EvaluationResult, Evaluator } from '@craftabot/core';
import { judgeWithRubric } from '@craftabot/pack-evaluators';

/**
 * **The understanding rubric** (WP63 stage C, `52-FS-LENDING.md` §4.5): a
 * model reads the explanation as a first-timer would — `evals/judge/rubric`'s
 * own judge with a fixed rubric under an id of its own (a campaign keys
 * verdicts by evaluator id). Offline → inconclusive.
 */
export const UNDERSTANDING_RUBRIC_ID = 'fs-lending/rubric/understanding';

const RUBRIC =
	'Consumer understanding of a lending decision (Consumer Duty; SS1/23). Score 1 when the explanation given to the applicant was in plain words a first-timer could follow, named the actual reasons the decision rested on and no others, said what happens next, and did not hide behind “the system” or “the assessment” without saying which part. Score 0 when the explanation was jargon, vague, named a reason the decision did not use, or gave no explanation on a decline.';

export const understandingRubric: Evaluator = {
	id: UNDERSTANDING_RUBRIC_ID,
	name: 'Understanding (rubric)',
	description:
		'A model judges the explanation against the understanding outcome of the Consumer Duty — plain, the real reasons, what happens next (fca:cd:understanding).',
	kind: 'model',
	evaluate: async (input, deps) => {
		const verdict = await judgeWithRubric(input, { ...deps, config: { rubric: RUBRIC } });
		return { ...verdict, evaluatorId: UNDERSTANDING_RUBRIC_ID };
	},
	createOffline: () => ({
		evaluate: (): Promise<EvaluationResult> =>
			Promise.resolve({
				evaluatorId: UNDERSTANDING_RUBRIC_ID,
				verdict: 'inconclusive',
				label: 'inconclusive',
				explanation: 'Offline: this rubric asks a model, and none was asked — inconclusive.',
				evidence: []
			})
	})
};

export const lendingRubricEvaluators: Evaluator[] = [understandingRubric];
