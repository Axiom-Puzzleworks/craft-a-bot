/**
 * The Fraud Desk's testing surface — `@craftabot/pack-fs-fraud/testing`
 * (WP62): the scripted plans a harness or a campaign drives a bot along,
 * and the headless harness the pack's own suites use. Never imported by
 * the runtime.
 */
export {
	ADVERSARY_PLANS,
	ASK_TO_VERIFY,
	PLAIN_WARNING,
	REFUSE_THE_CALLER,
	SCRIPTED_OPTIMAL,
	adversaryPlanFor,
	planFor,
	type Plan,
	type PlanStep
} from './plans.js';
export {
	FRAUD_ACTIONS,
	FRAUD_SENSES,
	buildRegistry,
	buildSpec,
	runToCompletion,
	type RunOptions,
	type RunResult,
	type SpecOverrides
} from './harness.js';
