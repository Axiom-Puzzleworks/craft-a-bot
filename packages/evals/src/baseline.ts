import type { EvalReport, EvalSummary } from './report.js';

/**
 * **Diffing a report against the stored baseline** (`13-…` §8).
 *
 * That section is precise about what the gate is for, and it is worth quoting
 * rather than paraphrasing: *"regressions fail the report, not the build (live
 * models drift — the gate is on our changes via scripted-noisy, the live
 * numbers are telemetry)."*
 *
 * So this compares a report to a baseline and says what moved. It does not
 * decide what to do about it. The scripted tiers are deterministic, so any
 * movement in them is a change **we** made — to the world's wording, the
 * prompt, the memory summary, a predicate — and that is exactly the signal the
 * harness exists to produce. A live column moving means the model had a
 * different afternoon.
 */

export interface Tolerances {
	/** Percentage points of success rate, as a fraction. */
	successRate: number;
	/** Turns of median. */
	medianTicks: number;
	/** Fraction of wasted turns. */
	wastedTickRatio: number;
	/** Turns of longest identical-call streak. */
	loopStreak: number;
}

/**
 * Small but not zero.
 *
 * Zero would be defensible for the scripted tiers — they are deterministic, so
 * an identical matrix really should produce identical numbers. It is rejected
 * because the first thing a zero-tolerance gate does is fire on a rounding
 * difference in a mean and teach everyone to ignore it. A gate people ignore is
 * worse than no gate.
 */
export const DEFAULT_TOLERANCES: Tolerances = {
	successRate: 0.05,
	medianTicks: 1,
	wastedTickRatio: 0.05,
	loopStreak: 1
};

export type MetricName = keyof Tolerances;

export interface Movement {
	goalCardId: string;
	brainId: string;
	metric: MetricName;
	baseline: number;
	current: number;
	/** Current minus baseline, in the metric's own units. */
	delta: number;
}

export type BaselineComparison =
	| {
			comparable: false;
			/** Why these two cannot honestly be compared. */
			reason: string;
	  }
	| {
			comparable: true;
			regressions: Movement[];
			improvements: Movement[];
			/** Squares present now and not in the baseline, and the other way round. */
			added: string[];
			removed: string[];
	  };

/**
 * Which direction is bad, per metric. Written down rather than inferred,
 * because "higher is worse" is true of three of these four and getting the
 * exception wrong would report every improvement as a regression.
 */
const WORSE_WHEN_HIGHER: Record<MetricName, boolean> = {
	successRate: false,
	medianTicks: true,
	wastedTickRatio: true,
	loopStreak: true
};

const valueOf = (summary: EvalSummary, metric: MetricName): number => {
	switch (metric) {
		case 'successRate':
			return summary.successRate;
		case 'medianTicks':
			return summary.medianTicks;
		case 'wastedTickRatio':
			return summary.meanWastedTickRatio;
		case 'loopStreak':
			return summary.medianLoopStreak;
	}
};

const squareOf = (summary: EvalSummary) => `${summary.goalCardId} × ${summary.brainId}`;

export function compareToBaseline(
	current: EvalReport,
	baseline: EvalReport,
	tolerances: Partial<Tolerances> = {}
): BaselineComparison {
	/*
	 * **Refusing to compare is a feature.** A 20-seed report against a 5-seed
	 * baseline is not a regression, it is a different question — and noise rates
	 * are the instrument itself, so a report taken at different settings is
	 * measuring something else entirely. Answering anyway would produce a number
	 * that looks exactly like a real regression.
	 */
	const mismatch = incomparable(current, baseline);
	if (mismatch) return { comparable: false, reason: mismatch };

	const limits = { ...DEFAULT_TOLERANCES, ...tolerances };
	const before = new Map(baseline.summaries.map((s) => [squareOf(s), s]));
	const after = new Map(current.summaries.map((s) => [squareOf(s), s]));

	const regressions: Movement[] = [];
	const improvements: Movement[] = [];

	for (const [square, now] of after) {
		const then = before.get(square);
		if (!then) continue;

		for (const metric of Object.keys(limits) as MetricName[]) {
			const baselineValue = valueOf(then, metric);
			const currentValue = valueOf(now, metric);
			const delta = currentValue - baselineValue;
			if (Math.abs(delta) <= limits[metric]) continue;

			const worse = WORSE_WHEN_HIGHER[metric] ? delta > 0 : delta < 0;
			const movement: Movement = {
				goalCardId: now.goalCardId,
				brainId: now.brainId,
				metric,
				baseline: baselineValue,
				current: currentValue,
				delta
			};
			(worse ? regressions : improvements).push(movement);
		}
	}

	return {
		comparable: true,
		regressions,
		improvements,
		added: [...after.keys()].filter((square) => !before.has(square)),
		removed: [...before.keys()].filter((square) => !after.has(square))
	};
}

function incomparable(current: EvalReport, baseline: EvalReport): string | undefined {
	if (current.schemaVersion !== baseline.schemaVersion) {
		return `baseline is schema v${baseline.schemaVersion}, this report is v${current.schemaVersion}`;
	}
	if (current.matrix.seeds.length !== baseline.matrix.seeds.length) {
		return `baseline ran ${baseline.matrix.seeds.length} seeds, this report ran ${current.matrix.seeds.length}`;
	}
	const before = baseline.matrix.noise;
	const now = current.matrix.noise;
	if (
		before.misname !== now.misname ||
		before.wastedMove !== now.wastedMove ||
		before.prematureCelebrate !== now.prematureCelebrate
	) {
		return 'baseline was recorded at different noise rates — the instrument changed, so the measurements are not comparable';
	}
	return undefined;
}
