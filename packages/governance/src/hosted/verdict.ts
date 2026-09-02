import type { GuardrailHook, GuardrailVerdict, ScreenFinding, ScreenResult } from '@craftabot/core';
import type { Disposition, HostedScreenConfig } from './config.js';
import type { HostedStrings, MatchedFinding } from './strings.js';

/**
 * **`verdictForReading`** — the pure mapping from a service's result to a
 * `GuardrailVerdict` (`29-GUARD-SHELL.md` §4.4; `25-…` §4.4's table with the
 * vendor removed). No I/O, no `Guardrail` shape here; `verdict.test.ts`
 * table-tests it over hook × dial × category × confidence × outcome × clamp
 * × failure with a test-only service, once, for every vendor.
 */

/** Ordered least to most severe. */
const SEVERITY: readonly Disposition[] = ['off', 'note', 'block', 'ask', 'stop'];
const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 } as const;

function hookDial(hook: GuardrailHook, screening: HostedScreenConfig): Disposition {
	if (hook === 'pre-think') return screening.screenObservation;
	if (hook === 'post-act') return screening.screenResult;
	return screening.screenDecision;
}

/** `pre-think`/`post-act` cannot pause or block one action — only note or stop the whole run (`25-…` §4.3). */
export function clampForHook(disposition: Disposition, hook: GuardrailHook): Disposition {
	if (hook === 'pre-act') return disposition;
	return disposition === 'block' || disposition === 'ask' ? 'stop' : disposition;
}

function effectiveDisposition(
	finding: ScreenFinding,
	hook: GuardrailHook,
	screening: HostedScreenConfig
): Disposition {
	const override = screening.perCategory[finding.category];
	const dial =
		override !== undefined && override !== 'inherit' ? override : hookDial(hook, screening);
	return clampForHook(dial, hook);
}

function confidentEnough(finding: ScreenFinding, screening: HostedScreenConfig): boolean {
	if (finding.confidence === undefined) return true;
	return CONFIDENCE_RANK[finding.confidence] >= CONFIDENCE_RANK[screening.minConfidence];
}

function verdictForUnreachable(reason: string, screening: HostedScreenConfig): GuardrailVerdict {
	return screening.onFailure === 'stop-run'
		? { allow: false, reason, disposition: 'stop-run' }
		: { allow: true, note: reason };
}

function matched(finding: ScreenFinding): MatchedFinding {
	return {
		category: finding.category,
		vendorLabel: finding.vendorLabel,
		...(finding.confidence !== undefined ? { confidence: finding.confidence } : {}),
		...(finding.vendorConfidence !== undefined
			? { vendorConfidence: finding.vendorConfidence }
			: {})
	};
}

export function verdictForReading(
	result: ScreenResult,
	hook: GuardrailHook,
	screening: HostedScreenConfig,
	alwaysStop: readonly string[],
	strings: HostedStrings
): GuardrailVerdict {
	if ('error' in result)
		return verdictForUnreachable(strings.transport(result.error.kind), screening);

	const { reading } = result;

	// Never dialable (`29-…` §8 D-c): a match on one of these stops the run before any dial is read.
	const undialable = reading.findings.filter(
		(finding) => finding.matched && alwaysStop.includes(finding.vendorLabel)
	);
	if (undialable.length > 0) {
		return {
			allow: false,
			reason: strings.match(undialable.map(matched)),
			disposition: 'stop-run'
		};
	}

	const fired = reading.findings
		.filter((finding) => finding.matched && confidentEnough(finding, screening))
		.map((finding) => ({ finding, disposition: effectiveDisposition(finding, hook, screening) }))
		.filter((entry) => entry.disposition !== 'off');

	if (fired.length === 0) {
		return reading.outcome === 'ok'
			? { allow: true, note: strings.allClear }
			: verdictForUnreachable(strings.didNotFinish, screening);
	}

	const strictest = fired.reduce<Disposition>(
		(worst, entry) =>
			SEVERITY.indexOf(entry.disposition) > SEVERITY.indexOf(worst) ? entry.disposition : worst,
		'off'
	);
	const reason = strings.match(fired.map((entry) => matched(entry.finding)));

	if (strictest === 'note') return { allow: true, note: reason };
	if (strictest === 'block') return { allow: false, reason, disposition: 'block-action' };
	if (strictest === 'ask') return { pause: true, reason };
	return { allow: false, reason, disposition: 'stop-run' };
}
