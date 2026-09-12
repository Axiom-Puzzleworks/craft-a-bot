/**
 * The Collections Desk's testing surface — `@craftabot/pack-fs-collections/testing`
 * (WP105): the headless harness the pack's own suites use and the scripted
 * plans a harness or a campaign drives a bot along. Never imported by the runtime.
 */
export {
	ADVERSARY_PLANS,
	NO_NOTICE,
	SCRIPTED_OPTIMAL,
	STAGE_PLANS,
	adversaryPlanFor,
	disclosureInPrompt,
	figuresInPrompt,
	planFor,
	type Plan,
	type PlanStep
} from './plans.js';
export {
	COLLECTIONS_ACTIONS,
	COLLECTIONS_SENSES,
	buildRegistry,
	buildSpec,
	runToCompletion,
	type RunOptions,
	type RunResult,
	type SpecOverrides
} from './harness.js';
