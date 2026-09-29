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
}

/** A number a calibration table holds: the table's id, the row's id, the key in its distribution. */
export interface CalibrationRef {
	table: string;
	row: string;
	key: string;
}
