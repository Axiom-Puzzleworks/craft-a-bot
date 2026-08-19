/**
 * **The starter pack's testing surface** — `@craftabot/pack-starter/testing`.
 *
 * Mirrors `@craftabot/core/testing`: things that exist to *exercise* the pack
 * rather than to ship inside it, kept off the main entry point so nothing in
 * the app can reach them by accident.
 *
 * It exists because WP19's eval harness runs the real session over the real
 * Playroom, and everything it needs to do that was already written — the
 * headless harness for the L3 suites, and the scripted-optimal plan for every
 * goal card. Re-implementing either in `@craftabot/evals` would have given the
 * matrix a solvability floor that nothing had proved.
 */
export {
	buildRegistry,
	buildSpec,
	runGroupToCompletion,
	runToCompletion
} from '../session/harness.js';
export type {
	GroupMemberOptions,
	GroupRunOptions,
	GroupRunResult,
	RunOptions,
	RunResult,
	SpecOverrides
} from '../session/harness.js';
export {
	PLAN_TOOLS,
	SCRIPTED_OPTIMAL,
	TIDY_TOGETHER_SEAT_A,
	TIDY_TOGETHER_SEAT_B,
	planFor
} from '../session/plans.js';
export type { Plan, PlanStep } from '../session/plans.js';
