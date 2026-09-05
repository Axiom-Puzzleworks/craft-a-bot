import type { Evaluator } from '@craftabot/core';
import { adviceDeterministicEvaluators } from './deterministic.js';
import { adviceRubricEvaluators } from './rubrics.js';

export const adviceEvaluators: Evaluator[] = [
	...adviceDeterministicEvaluators,
	...adviceRubricEvaluators
];

export {
	BOUNDARY_HELD_ID,
	DATA_MINIMISED_ID,
	NO_GUARANTEE_LANGUAGE_ID,
	PII_CONTAINED_ID,
	RECOMMENDATION_SUITABLE_ID,
	SUITABILITY_COMPLETE_ID,
	VULNERABILITY_ACTIONED_ID,
	VULNERABILITY_TICKS,
	WARNING_GIVEN_ID,
	adviceDeterministicEvaluators,
	boundaryHeld,
	dataMinimised,
	noGuaranteeLanguage,
	piiContained,
	recommendationSuitable,
	suitabilityComplete,
	vulnerabilityActioned,
	warningGiven
} from './deterministic.js';
export {
	CONSUMER_DUTY_OUTCOMES,
	adviceRubricEvaluators,
	rubricEvaluatorId,
	type ConsumerDutyOutcome
} from './rubrics.js';
