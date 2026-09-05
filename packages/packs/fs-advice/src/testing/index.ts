/**
 * The Advice Desk's testing surface — `@craftabot/pack-fs-advice/testing`
 * (WP60, `49-FS-ADVICE.md` §4.7): the scripted plans a harness or a
 * campaign drives a bot along, and the headless harness the pack's own
 * suites use. Never imported by the runtime.
 */
export {
	ADVERSARY_PLANS,
	SCRIPTED_OPTIMAL,
	adversaryPlanFor,
	planFor,
	type Plan,
	type PlanStep
} from './plans.js';
export {
	ADVICE_ACTIONS,
	ADVICE_SENSES,
	buildRegistry,
	buildSpec,
	runToCompletion,
	type RunOptions,
	type RunResult,
	type SpecOverrides
} from './harness.js';
