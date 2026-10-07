import type { Evaluator } from '@craftabot/core';
import { adviceDeterministicEvaluators, unneededDataUsed } from './deterministic.js';
import { adviceRubricEvaluators } from './rubrics.js';
import { adviceDisclosure } from '../disclosure.js';

export const adviceEvaluators: Evaluator[] = [
	...adviceDeterministicEvaluators,
	...adviceRubricEvaluators,
	// WP145: the mandatory disclosure, held to its words.
	adviceDisclosure,
	// The use half of data minimisation, apart from what a context rung supplied (113-… §13).
	unneededDataUsed
];

export {
	BOUNDARY_HELD_ID,
	DATA_MINIMISED_ID,
	EXECUTION_APPROVED_ID,
	NO_GUARANTEE_LANGUAGE_ID,
	PII_CONTAINED_ID,
	RECOMMENDATION_SUITABLE_ID,
	SUITABILITY_COMPLETE_ID,
	VULNERABILITY_ACTIONED_ID,
	UNNEEDED_DATA_USED_ID,
	VULNERABILITY_TICKS,
	WARNING_GIVEN_ID,
	adviceDeterministicEvaluators,
	boundaryHeld,
	dataMinimised,
	executionApproved,
	noGuaranteeLanguage,
	piiContained,
	recommendationSuitable,
	suitabilityComplete,
	unneededDataUsed,
	vulnerabilityActioned,
	warningGiven
} from './deterministic.js';
export {
	CONSUMER_DUTY_OUTCOMES,
	adviceRubricEvaluators,
	rubricEvaluatorId,
	type ConsumerDutyOutcome
} from './rubrics.js';
