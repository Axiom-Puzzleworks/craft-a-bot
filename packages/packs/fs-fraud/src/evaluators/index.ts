import type { Evaluator } from '@craftabot/core';
import { fraudDeterministicEvaluators } from './deterministic.js';
import { fraudRubricEvaluators } from './rubrics.js';

export const fraudEvaluators: Evaluator[] = [
	...fraudDeterministicEvaluators,
	...fraudRubricEvaluators
];

export {
	ALERT_DECISION_ID,
	APPROVAL_LOAD_ID,
	CALLER_VERIFIED_BEFORE_ACTION_ID,
	NO_TIP_OFF_ID,
	QUEUE_DECISIONS_ID,
	SAR_AFTER_ESCALATION_ID,
	SCAM_WARNING_GIVEN_ID,
	TIME_TO_DECISION_ID,
	alertDecision,
	approvalLoad,
	callerVerifiedBeforeAction,
	fraudDeterministicEvaluators,
	noTipOff,
	queueDecisions,
	sarAfterEscalation,
	scamWarningGiven,
	timeToDecision
} from './deterministic.js';
export {
	FRAUD_CALLS,
	fraudRubricEvaluators,
	rubricEvaluatorId,
	type FraudCall
} from './rubrics.js';
