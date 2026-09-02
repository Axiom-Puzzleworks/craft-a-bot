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
	scriptedAdversary,
	scriptedNoisy,
	scriptedOptimal,
	type NoiseRates,
	type NoisyOptions,
	type ScriptedTier
} from './brains.js';
/** Campaigns (WP38, `28-CAMPAIGNS.md`): scenarios × builds × guards × brains × seeds, with gates. */
export {
	CAMPAIGN_REPORT_SCHEMA_VERSION,
	CAMPAIGN_SCHEMA_VERSION,
	campaignCells,
	campaignReportSchema,
	campaignSchema,
	describeRequirement,
	evaluateGate,
	gateSchema,
	metricNameSchema,
	metricValue,
	parseCampaign,
	parseCampaignReport,
	runCampaign,
	specFor,
	type Campaign,
	type CampaignBrain,
	type CampaignBuild,
	type CampaignCell,
	type CampaignCellSpec,
	type CampaignGuard,
	type CampaignReport,
	type CampaignScenario,
	type Gate,
	type GateRequire,
	type GateVerdict,
	type GateWhere,
	type MetricName as CampaignMetricName,
	type RunCampaignOptions
} from './campaign.js';
export {
	NEVER_GIVES_THE_BALL_AWAY,
	NEVER_SAYS_THE_CODE,
	NEVER_SENDS_THE_ALERT,
	guard,
	injectionBaseline
} from './baseline-campaign.js';
export { renderCampaignScorecard } from './campaign-scorecard.js';
export { renderJUnit } from './campaign-junit.js';
export { renderSarif, type SarifLog, type SarifOptions } from './campaign-sarif.js';
export { selectCells } from './campaign.js';
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
	type CellTrace,
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
/** The corpus importer (`32-SCENARIOS.md` §4.5, WP44): JSONL rows become scenarios over one base card, in a scenario pack file. */
export {
	DEFAULT_CORPUS_DELIVERY,
	corpusRowSchema,
	packFromScenarioFile,
	parseCorpusJsonl,
	scenarioPackFrom,
	scenariosFromCorpus,
	type CorpusDelivery,
	type CorpusImportOptions,
	type CorpusRow
} from './corpus.js';
/** Scenarios (`32-SCENARIOS.md` §4.4, WP44): a goal card plus what a test needs, run through an injected world. */
export {
	ScenarioRefusedError,
	injectedWorld,
	registryForScenario,
	runScenario,
	worldForScenario,
	type RunScenarioOptions,
	type ScenarioExpectationCheck,
	type ScenarioRun
} from './scenarios.js';
export {
	assertionEvaluator,
	completedCalls,
	evaluateCard,
	evaluationInputFor,
	evaluatorsOf,
	provisionalRun,
	renderCall,
	resolveEvaluator,
	type CompletedCall
} from './evaluators.js';
export {
	evaluateAssertion,
	runTestBench,
	type AssertionMatch,
	type AssertionResult
} from './assertions.js';
export {
	BASELINE_SEEDS,
	EXPECTED_BANDS,
	EXPERT_MATRIX,
	LIVE_BASELINE,
	SCRIPTED_MATRIX,
	STANDARD_CARDS
} from './matrices.js';
