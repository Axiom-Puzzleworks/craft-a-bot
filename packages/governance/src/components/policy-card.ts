import { z } from 'zod';
import { pointHook, stampComponent, type GuardrailComponent } from '@craftabot/core';
import { compilePolicyCard } from '../policy-compiler.js';

/**
 * **The `policy-card` adapter** (WP94, `85-COMPONENTS.md` §5): a card by id,
 * compiled by `compilePolicyCard` exactly as the Safety brick compiles the
 * cards it names — one component, the card as its config, so a stack can
 * carry a card beside a service and the register can join on it.
 */
export const POLICY_CARD_COMPONENT_ID = 'governance/policy-card';
export const policyCardComponentSchema = z.object({ cardId: z.string().min(1) });

export const policyCardComponent: GuardrailComponent<z.infer<typeof policyCardComponentSchema>> = {
	id: POLICY_CARD_COMPONENT_ID,
	name: 'Policy card',
	description:
		'A rule written as data — what may be proposed, said or read — compiled to a guardrail on the hooks it names.',
	technique: 'policy-as-code',
	points: ['pre-think', 'pre-act', 'post-act'],
	verdicts: ['allow', 'block-action', 'stop-run'],
	cost: { class: 'free', latency: 'none' },
	configSchema: policyCardComponentSchema,
	explain: (config) => `Enforces the policy card ${config.cardId}.`,
	compile: (config, deps, point) => {
		const card = deps.getPolicyCard(config.cardId);
		if (!card) throw new Error(`no policy card '${config.cardId}' is registered`);
		// The card's rules on this point's hook alone (`85-…` §4); a card with rules on three hooks is fitted three times.
		const hook = pointHook(point);
		const compiled = compilePolicyCard(card);
		return stampComponent(
			hook ? compiled.filter((guardrail) => guardrail.hooks.includes(hook)) : compiled,
			POLICY_CARD_COMPONENT_ID,
			point
		);
	}
};
