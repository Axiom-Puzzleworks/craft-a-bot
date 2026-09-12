/**
 * **`@craftabot/metrics`** (WP76, `68-METRICS.md`; `64-TARGET-DESIGN-V5.md`
 * §6.4, tenet 20): fairness, drift, human load, the intervals and the
 * tests — each defined once, each validated by a hand case, a planted
 * effect and a null (`./validation`), each read by every consumer: the
 * gates (WP82), the report, the Monitor (WP84), the register (WP90).
 * Pure functions over plain arrays; `core` types only; browser- and
 * Node-safe.
 */
export {
	betaInc,
	betaQuantile,
	erfc,
	logChoose,
	logGamma,
	normalCdf,
	normalQuantile,
	tCdf,
	tQuantile
} from './normal.js';
export {
	clopperPearson,
	logRatio,
	meanInterval,
	newcombe,
	summarise,
	welch,
	wilson,
	zFor,
	type Interval,
	type Summary
} from './intervals.js';
export {
	fisherExact,
	kolmogorovQ,
	ksTwoSample,
	signTest,
	twoProportionZ,
	type TestResult
} from './tests.js';
export {
	FAIRNESS_METRIC_IDS,
	conditionalParity,
	counterfactualFlip,
	demographicParity,
	disparateImpact,
	equalOpportunity,
	equalisedOdds,
	fairnessMetric,
	matchedPairDiscordance,
	predictiveParity,
	rateWithBand,
	ruleAgreement,
	type DecidedCase,
	type Decision,
	type FairnessMetricId,
	type FairnessOptions,
	type FairnessResult,
	type FlipCase
} from './fairness.js';
export {
	agreementDrift,
	fairnessDrift,
	ksDrift,
	outcomeMixDistance,
	pageHinkley,
	psiCategorical,
	psiNumeric,
	totalVariationDistance,
	type DifferenceResult,
	type KsResult,
	type MixResult,
	type PageHinkleyResult,
	type PsiResult
} from './drift.js';
export {
	ceilingBreachRate,
	humanLoadAtVolume,
	minutesPerCase,
	oversightCost,
	touchesPerCase,
	unattendedRate,
	type AutonomyLevel,
	type LoadOptions,
	type LoadResult,
	type Touch,
	type TouchedCase
} from './human-load.js';
export { gaussian, mulberry32 } from './random.js';
export {
	confusionRates,
	type ConfusionCounts,
	type ConfusionRate,
	type ConfusionRates
} from './confusion.js';
