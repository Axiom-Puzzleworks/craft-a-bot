/**
 * **An error model** (WP115, `103-FALLIBLE-ACTORS.md` §5; `100-…` §6.1, D14):
 * how the fallible tier errs. A scripted brain plays the desk's plan exactly
 * and, at each decision the model names, is wrong with the probability a
 * calibration row gives — every row cited or stated, `review: 'pending'`,
 * never a literal in code. A pack ships its desk's models
 * (`PackManifest.errorModels`); a campaign brain names one
 * (`{ tier: 'fallible', errorModel }`). Every fault is planted on purpose and
 * says so on the trace (`decision.fault`).
 */
export interface ErrorModel {
	/** Qualified like every pack contribution: `fs-lending/error/decision`. */
	id: string;
	name: string;
	description: string;
	faults: DecisionFaultSpec[];
	/**
	 * **Habits** (plan 114 WP203): how a model fails other than by deciding wrongly — the things the live suites showed real models do.
	 * A habit is played by the scripted tier at the rate a calibration row gives (measured from the recordings, never assumed), so a
	 * control for a model's habit can be measured on the mock before the Sparks. Absent, the model plants decision faults only.
	 */
	habits?: HabitFault[];
}

/**
 * - `repeat`: the call just made is made again, identically (a model repeating a refused act, or a lookup it already has).
 * - `no-call`: a reply in prose where the desk needs a tool call (the 35B's habit on the conversational desks).
 */
export interface HabitFault {
	kind: 'repeat' | 'no-call';
	/** P(the habit shows on a turn): a calibration row's `distribution[key]`. */
	rate: CalibrationRef;
}

/**
 * One kind of decision the model corrupts. Two shapes:
 *
 * - **An argument** (`field` set): a call to `action` whose `arguments[field]`
 *   is one of `options` — the lending desk's `decide { outcome }`.
 * - **The action itself** (`field` absent): a call whose bare name is one of
 *   `options` — the fraud desk decides by calling `release`, `hold`,
 *   `freeze-account`… The call's pack prefix is kept.
 */
export interface DecisionFaultSpec {
	/** The bare action name to match when `field` is set; ignored otherwise. */
	action?: string;
	field?: string;
	/** The values the decision takes; a fault picks another of them. */
	options: string[];
	/** P(the decision is wrong): a calibration row's `distribution[key]`. */
	rate: CalibrationRef;
	/** Uniformly over the other options, or always toward one (when it is not already that). */
	direction: 'uniform' | { toward: string };
	/**
	 * How the rate varies with the case (WP170, `112-REAL-ENOUGH-PLAN.md` §5). Absent, the rate
	 * is uniform — the same for every case, as a coin is. A model errs by who the case is about,
	 * how near the rule's threshold it sits and what the other party said; `rate` stays the base
	 * every case without that information gets.
	 */
	shape?: FaultShape;
}

/**
 * **What a fault's rate depends on** (WP170): a stated shape, each number a calibration row,
 * every row an assumption until a live model is recorded and replaces it with what a model did.
 *
 * - `cohort`: the rate for each value of one cohort attribute (`ageBand`: `18-24` → a row's
 *   key); a value it does not name gets the base rate.
 * - `difficulty`: the rate rises from the base to `peak` as a case's numeric `fact` nears any
 *   of `thresholds` (the rule's own), reaching `peak` at the threshold and the base at
 *   `width` or more away.
 * - `steer`: the rate when the last thing the other party said matches `pattern` (a
 *   case-insensitive regular expression over the prompt's last message).
 */
export type FaultShape =
	| { kind: 'cohort'; attribute: string; rates: Record<string, CalibrationRef> }
	| {
			kind: 'difficulty';
			fact: string;
			thresholds: number[];
			width: number;
			peak: CalibrationRef;
	  }
	| { kind: 'steer'; pattern: string; rate: CalibrationRef };

/** A number a calibration table holds: the table's id, the row's id, the key in its distribution. */
export interface CalibrationRef {
	table: string;
	row: string;
	key: string;
}
