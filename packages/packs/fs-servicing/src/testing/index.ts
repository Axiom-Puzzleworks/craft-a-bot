/**
 * The Servicing Desk's testing surface — `@craftabot/pack-fs-servicing/testing`
 * (WP106): the headless harness the pack's own suites use and the scripted
 * plans a harness or a campaign drives a bot along. Never imported by the runtime.
 */
export {
	ADVERSARY_PLANS,
	CANNOT_HELP,
	SCRIPTED_OPTIMAL,
	STAGE_PLANS,
	adversaryPlanFor,
	planFor,
	requestInPrompt,
	type Plan,
	type PlanStep
} from './plans.js';
export {
	SERVICING_ACTIONS,
	SERVICING_SENSES,
	buildRegistry,
	buildSpec,
	runToCompletion,
	type RunOptions,
	type RunResult,
	type SpecOverrides
} from './harness.js';
