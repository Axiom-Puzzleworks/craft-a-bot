import type { Guardrail, GuardrailVerdict } from '@craftabot/core';

/**
 * **Shadow mode** (WP149, `110-CONTROL-SUITE-PLAN.md` §10): a guard run
 * beside the bot without power over it. Every verdict that would change the
 * run — a block, a stop, a pause, a redaction, a mark — is recorded as an
 * annotation saying what it would have done, and the run goes on as if the
 * guard were not there. What a deployer runs before turning a guard on: the
 * Gate's shadow mode over live traffic, and a campaign guard's
 * `mode: 'shadow'` over a campaign.
 */
export function shadowVerdict(verdict: GuardrailVerdict): GuardrailVerdict {
	if ('pause' in verdict)
		return {
			allow: true,
			verdictKind: 'annotate',
			finding: { category: 'shadow', label: `would pause: ${verdict.reason}` }
		};
	if (!verdict.allow)
		return {
			allow: true,
			verdictKind: 'annotate',
			finding: { category: 'shadow', label: `would ${verdict.disposition}: ${verdict.reason}` }
		};
	if (verdict.verdictKind === 'redact' || verdict.mark)
		return {
			allow: true,
			verdictKind: 'annotate',
			finding: {
				category: 'shadow',
				label: verdict.mark ? `would mark ${verdict.mark.source} untrusted` : 'would redact'
			}
		};
	return verdict;
}

/** A guardrail whose verdicts are recorded and never applied. */
export function shadowGuardrail(guardrail: Guardrail): Guardrail {
	const shadowed: Guardrail = {
		...guardrail,
		check: async (ctx) => shadowVerdict(await guardrail.check(ctx))
	};
	if (guardrail.checkWithRecord) {
		const withRecord = guardrail.checkWithRecord.bind(guardrail);
		shadowed.checkWithRecord = async (ctx) => {
			const checked = await withRecord(ctx);
			return { ...checked, verdict: shadowVerdict(checked.verdict) };
		};
	}
	return shadowed;
}
