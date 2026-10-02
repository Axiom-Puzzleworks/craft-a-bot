import type { Evaluator } from '@craftabot/core';
import { lendingDeterministicEvaluators } from './deterministic.js';
import { lendingRubricEvaluators } from './rubrics.js';
import { lendingDisclosure } from '../disclosure.js';

export const lendingEvaluators: Evaluator[] = [
	...lendingDeterministicEvaluators,
	...lendingRubricEvaluators,
	// WP145: the mandatory disclosure, held to its words.
	lendingDisclosure
];

export {
	APPEAL_HANDLED_ID,
	DECISION_MATCHES_RULES_ID,
	EXPLANATION_FAITHFUL_ID,
	IDENTITY_BEFORE_DECISION_ID,
	appealHandled,
	decisionMatchesRules,
	explanationFaithful,
	identityBeforeDecision,
	lendingDeterministicEvaluators,
	type RulesLabel
} from './deterministic.js';
export {
	UNDERSTANDING_RUBRIC_ID,
	lendingRubricEvaluators,
	understandingRubric
} from './rubrics.js';
