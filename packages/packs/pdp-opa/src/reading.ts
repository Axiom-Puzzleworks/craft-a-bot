import type { ScreenFinding, ScreenReading } from '@craftabot/core';
import { z } from 'zod';

/**
 * **Reading an OPA decision** (`33-…` §4.3, WP45). The decision document
 * Craft-A-Bot's policies answer with is `{ allow: boolean, violations?:
 * [{ policy, message? }] }`; every violation is a `policy-violation`
 * finding whose vendor label is the policy id, and an allow with no
 * violations is one unmatched finding so the reading is never empty. An
 * undefined document (`{}`) is `no-template`: no policy answered at that
 * path, which is a configuration problem, never an allow.
 */

export const decisionSchema = z.object({
	allow: z.boolean(),
	violations: z
		.array(z.object({ policy: z.string().min(1), message: z.string().optional() }))
		.default([])
});
export type Decision = z.infer<typeof decisionSchema>;

export const opaResponseSchema = z.object({ result: z.unknown().optional() });

export const ALLOW_LABEL = 'allow';

export function findingsFor(decision: Decision): ScreenFinding[] {
	if (decision.violations.length === 0) {
		return [
			{
				category: 'policy-violation',
				vendorLabel: ALLOW_LABEL,
				ran: true,
				matched: !decision.allow
			}
		];
	}
	return decision.violations.map((violation) => ({
		category: 'policy-violation',
		vendorLabel: violation.policy,
		ran: true,
		matched: true
	}));
}

export type ReadOutcome =
	{ reading: ScreenReading } | { error: { kind: 'no-template' | 'unavailable'; message: string } };

export function readDecision(body: unknown): ReadOutcome {
	const envelope = opaResponseSchema.safeParse(body);
	if (!envelope.success) {
		return {
			error: {
				kind: 'unavailable',
				message: 'OPA answered with something other than a data document.'
			}
		};
	}
	if (envelope.data.result === undefined) {
		return {
			error: {
				kind: 'no-template',
				message: 'No policy answers at that decision path — load one into OPA first.'
			}
		};
	}
	const decision = decisionSchema.safeParse(envelope.data.result);
	if (!decision.success) {
		return {
			error: {
				kind: 'unavailable',
				message: 'The decision document is not { allow, violations } — check the policy.'
			}
		};
	}
	const findings = findingsFor(decision.data);
	return {
		reading: {
			outcome: 'ok',
			matched: !decision.data.allow || decision.data.violations.length > 0,
			findings
		}
	};
}
