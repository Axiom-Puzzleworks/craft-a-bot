/**
 * `@craftabot/evals` — the behavioural eval harness (`13-…` §8).
 *
 * The instrument the manual trials were approximating: run the matrix, score
 * the traces, diff against a baseline, print a scorecard. Node-only tooling —
 * nothing in the app imports it at runtime, though `17-…` §4.4's Eval Matrix
 * will render the records it produces, which is why the data model lives here
 * rather than in a script.
 */
export {
	DEFAULT_NAMING_MISS_PATTERN,
	scoreRun,
	type LoopScore,
	type MetricsOptions,
	type RunMetrics
} from './metrics.js';
