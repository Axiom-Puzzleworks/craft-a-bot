import type { SafetyTally } from '@craftabot/governance/reports';

/**
 * **What the Safety Brick has been doing** (`16-…` §2.1).
 *
 * The *count* — `safetyTally` — moved to `@craftabot/governance/reports` in
 * WP36 stage B, because it is a governance fact a headless host reports too.
 * The *words* stay here: they are Kit copy, written to be read aloud by a
 * five-year-old, and belong to the toy rather than to the export.
 */
export { safetyTally, type SafetyTally } from '@craftabot/governance/reports';

/**
 * The ticker's words.
 *
 * Says nothing at all before the first check: a run that has not started has no
 * safety story, and "0 checks, 0 saves" reads like the brick is broken rather
 * than idle. Singulars are spelled out because a five-year-old reads this
 * aloud.
 */
export function safetyWords(tally: SafetyTally): string | undefined {
	if (tally.checks === 0) return undefined;

	const checks = tally.checks === 1 ? '1 check' : `${tally.checks} checks`;
	if (tally.saves === 0) return `${checks}, nothing to stop`;

	const saves = tally.saves === 1 ? '1 save' : `${tally.saves} saves`;
	return `${checks}, ${saves}`;
}

/**
 * The line for a run in which a hosted guard could not check (UX-1): said
 * beside the ticker rather than folded into it, because "1 save" for an
 * outage is the one thing the ticker must never say.
 */
export function failedClosedWords(tally: SafetyTally): string | undefined {
	if (tally.failedClosed === 0) return undefined;
	return tally.failedClosed === 1
		? '1 check could not run'
		: `${tally.failedClosed} checks could not run`;
}
