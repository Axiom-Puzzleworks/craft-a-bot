import type { VerdictFinding } from '../schemas/shared.js';
import type {
	ExternalCallRecord,
	Guardrail,
	GuardrailContext,
	GuardrailHook,
	GuardrailVerdict
} from '../types/guardrail.js';

/**
 * The guardrail chain (08-GOVERNANCE-GUARDRAILS.md §2). Two rules matter:
 *
 *  - **First non-allow wins** — evaluation stops at the first guardrail that
 *    denies or pauses.
 *  - **Every check is reported, pass or fail.** The trace has to show
 *    governance *working*, not merely governance *intervening*; a run where
 *    nothing was blocked should still prove the rules ran.
 */

export type ChainOutcome = {
	verdict: GuardrailVerdict;
	/** The guardrail that produced a non-allow verdict, if any. */
	guardrail?: Guardrail;
	/**
	 * The first `redact` allow on the chain (WP96, `85-…` §4): the text the
	 * outgoing call should carry instead, and who said so. Later redactors
	 * see the original and are recorded on their own `guardrail.checked`;
	 * the first wins, as the first non-allow does.
	 */
	redaction?: { guardrailId: string; redactedText: string; finding?: VerdictFinding };
	/** The first `mark` allow on the chain (WP124, `106-…` §8.1): who marked what came back, and any replacement. */
	mark?: { guardrailId: string; source: string; replacement?: string };
};

const ALLOW: GuardrailVerdict = { allow: true };

export function isAllowed(verdict: GuardrailVerdict): boolean {
	return 'allow' in verdict && verdict.allow;
}

export function isPause(
	verdict: GuardrailVerdict
): verdict is Extract<GuardrailVerdict, { pause: true }> {
	return 'pause' in verdict;
}

export async function runGuardrailChain(
	guardrails: readonly Guardrail[],
	hook: GuardrailHook,
	context: GuardrailContext,
	onChecked: (
		guardrail: Guardrail,
		verdict: GuardrailVerdict,
		external?: ExternalCallRecord
	) => void
): Promise<ChainOutcome> {
	let redaction: ChainOutcome['redaction'];
	let mark: ChainOutcome['mark'];
	for (const guardrail of guardrails) {
		if (!guardrail.hooks.includes(hook)) continue;

		// `checkWithRecord` (`25-…` §4.7) is preferred when a guardrail offers
		// it; every rule that only implements `check` runs exactly as before.
		const { verdict, external } = guardrail.checkWithRecord
			? await guardrail.checkWithRecord(context)
			: { verdict: await guardrail.check(context), external: undefined };
		onChecked(guardrail, verdict, external);

		if (!isAllowed(verdict)) {
			return {
				verdict,
				guardrail,
				...(redaction ? { redaction } : {}),
				...(mark ? { mark } : {})
			};
		}
		if (mark === undefined && 'allow' in verdict && verdict.allow && verdict.mark) {
			mark = {
				guardrailId: guardrail.id,
				source: verdict.mark.source,
				...(verdict.mark.replacement !== undefined ? { replacement: verdict.mark.replacement } : {})
			};
		}
		if (
			redaction === undefined &&
			'allow' in verdict &&
			verdict.allow &&
			verdict.verdictKind === 'redact' &&
			verdict.redactedText !== undefined
		) {
			redaction = {
				guardrailId: guardrail.id,
				redactedText: verdict.redactedText,
				...(verdict.finding ? { finding: verdict.finding } : {})
			};
		}
	}
	return { verdict: ALLOW, ...(redaction ? { redaction } : {}), ...(mark ? { mark } : {}) };
}
