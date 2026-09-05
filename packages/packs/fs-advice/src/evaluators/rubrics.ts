import type { EvaluationResult, Evaluator } from '@craftabot/core';
import { judgeWithRubric } from '@craftabot/pack-evaluators';
import { adviceStrings } from '../strings.js';

/**
 * **The four rubric evaluators** (WP60 stage C, `49-FS-ADVICE.md` §4.6), one
 * per Consumer Duty outcome: `evals/judge/rubric`'s own judge with a fixed
 * rubric, under an id of its own — a campaign keys verdicts by evaluator
 * id, so four configs of one judge would collide. `model` kind, offline →
 * inconclusive, as the judge itself.
 */
export type ConsumerDutyOutcome = 'understanding' | 'support' | 'products-services' | 'price-value';

const RUBRIC: Record<ConsumerDutyOutcome, string> = {
	understanding: adviceStrings.rubrics.understanding,
	support: adviceStrings.rubrics.support,
	'products-services': adviceStrings.rubrics.productsServices,
	'price-value': adviceStrings.rubrics.priceValue
};

const NAME: Record<ConsumerDutyOutcome, string> = {
	understanding: 'Consumer understanding',
	support: 'Consumer support',
	'products-services': 'Products and services',
	'price-value': 'Price and value'
};

const TAG: Record<ConsumerDutyOutcome, string> = {
	understanding: 'fca:cd:understanding',
	support: 'fca:cd:support',
	'products-services': 'fca:cd:products-services',
	'price-value': 'fca:cd:price-value'
};

export const rubricEvaluatorId = (outcome: ConsumerDutyOutcome): string =>
	`fs-advice/rubric/${outcome}`;

function rubricEvaluator(outcome: ConsumerDutyOutcome): Evaluator {
	const id = rubricEvaluatorId(outcome);
	const offline = (): EvaluationResult => ({
		evaluatorId: id,
		verdict: 'inconclusive',
		label: 'inconclusive',
		explanation: 'Offline: this rubric asks a model, and none was asked — inconclusive.',
		evidence: []
	});
	return {
		id,
		name: `${NAME[outcome]} (rubric)`,
		description: `A model judges the transcript against the ${NAME[outcome].toLowerCase()} outcome of the Consumer Duty (${TAG[outcome]}).`,
		kind: 'model',
		evaluate: async (input, deps) => {
			const verdict = await judgeWithRubric(input, {
				...deps,
				config: { rubric: RUBRIC[outcome] }
			});
			return { ...verdict, evaluatorId: id };
		},
		createOffline: () => ({ evaluate: () => Promise.resolve(offline()) })
	};
}

export const CONSUMER_DUTY_OUTCOMES: readonly ConsumerDutyOutcome[] = [
	'understanding',
	'support',
	'products-services',
	'price-value'
];

export const adviceRubricEvaluators: Evaluator[] = CONSUMER_DUTY_OUTCOMES.map(rubricEvaluator);
