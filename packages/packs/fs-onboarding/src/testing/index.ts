/**
 * The Onboarding Desk's testing surface — `@craftabot/pack-fs-onboarding/testing`
 * (WP103): the headless harness the pack's own suites use and the scripted
 * plans a harness or a campaign drives a bot along. Never imported by the runtime.
 */
export {
	ADVERSARY_PLANS,
	A_DECLINE_IS_A_DECLINE,
	A_REFERRAL_IS_A_REFERRAL,
	EVERYTHING_IN_ORDER,
	SCRIPTED_OPTIMAL,
	STAGE_PLANS,
	THE_WELCOME,
	adversaryPlanFor,
	figuresInPrompt,
	planFor,
	type Plan,
	type PlanStep
} from './plans.js';
export {
	ONBOARDING_ACTIONS,
	ONBOARDING_SENSES,
	buildRegistry,
	buildSpec,
	runToCompletion,
	type RunOptions,
	type RunResult,
	type SpecOverrides
} from './harness.js';
