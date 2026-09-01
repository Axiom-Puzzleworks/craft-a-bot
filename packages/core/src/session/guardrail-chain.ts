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
};

const ALLOW: GuardrailVerdict = { allow: true };

export function isAllowed(verdict: GuardrailVerdict): boolean {
	return 'allow' in verdict && verdict.allow;
}

export function isPause(verdict: GuardrailVerdict): verdict is { pause: true; reason: string } {
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
	for (const guardrail of guardrails) {
		if (!guardrail.hooks.includes(hook)) continue;

		// `checkWithRecord` (`25-…` §4.7) is preferred when a guardrail offers
		// it; every rule that only implements `check` runs exactly as before.
		const { verdict, external } = guardrail.checkWithRecord
			? await guardrail.checkWithRecord(context)
			: { verdict: await guardrail.check(context), external: undefined };
		onChecked(guardrail, verdict, external);

		if (!isAllowed(verdict)) {
			return { verdict, guardrail };
		}
	}
	return { verdict: ALLOW };
}
