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
export {
	DEFAULT_NOISE,
	scriptedNoisy,
	scriptedOptimal,
	type NoiseRates,
	type NoisyOptions,
	type ScriptedTier
} from './brains.js';
export {
	EVAL_REPORT_SCHEMA_VERSION,
	evalReportSchema,
	parseEvalReport,
	summarise,
	type EvalCell,
	type EvalReport,
	type EvalSummary,
	type EvalTier
} from './report.js';
export {
	matrixSize,
	runMatrix,
	type MatrixBrain,
	type MatrixConfig,
	type MatrixSpec,
	type RunMatrixOptions
} from './runner.js';
export {
	compareToBaseline,
	DEFAULT_TOLERANCES,
	type BaselineComparison,
	type MetricName,
	type Movement,
	type Tolerances
} from './baseline.js';
export { renderScorecard } from './scorecard.js';
export {
	BASELINE_SEEDS,
	EXPECTED_BANDS,
	EXPERT_MATRIX,
	LIVE_BASELINE,
	SCRIPTED_MATRIX,
	STANDARD_CARDS
} from './matrices.js';
