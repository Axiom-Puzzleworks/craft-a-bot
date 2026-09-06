/**
 * The Lending Desk's testing surface — `@craftabot/pack-fs-lending/testing`
 * (WP63): the headless harness the pack's own suites use and, from stage B,
 * the scripted plans a harness or a campaign drives a bot along. Never
 * imported by the runtime.
 */
export {
	ADVERSARY_PLANS,
	RUN_THE_CHECK_FIRST,
	SCRIPTED_OPTIMAL,
	SUPPORTIVE_BUT_FIRM,
	adversaryPlanFor,
	planFor,
	type Plan,
	type PlanStep
} from './plans.js';
export {
	LENDING_ACTIONS,
	LENDING_SENSES,
	buildRegistry,
	buildSpec,
	runToCompletion,
	type RunOptions,
	type RunResult,
	type SpecOverrides
} from './harness.js';
