/**
 * The Disputes Desk's testing surface — `@craftabot/pack-fs-disputes/testing`
 * (WP104): the headless harness the pack's own suites use and the scripted
 * plans a harness or a campaign drives a bot along. Never imported by the runtime.
 */
export {
	ADVERSARY_PLANS,
	SCRIPTED_OPTIMAL,
	STAGE_PLANS,
	adversaryPlanFor,
	figuresInPrompt,
	planFor,
	type Plan,
	type PlanStep
} from './plans.js';
export {
	DISPUTES_ACTIONS,
	DISPUTES_SENSES,
	buildRegistry,
	buildSpec,
	runToCompletion,
	type RunOptions,
	type RunResult,
	type SpecOverrides
} from './harness.js';
