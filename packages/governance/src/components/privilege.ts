import { z } from 'zod';
import { stampComponent, type GuardrailComponent } from '@craftabot/core';
import { createPrivilegeScopesGuardrail } from '../guardrails/privilege-scopes.js';

/**
 * **Least-privilege scopes** (WP142, `110-CONTROL-SUITE-PLAN.md` §10): a bot
 * started with a minimal grant over the calls the component governs. A call
 * outside it is refused, or paused for a person as an elevation — recorded
 * as `elevation.requested` and `elevation.resolved` beside the approval pair,
 * and, once granted, granted for the rest of the run. The Connector's scopes
 * are the refuse-mode instance (`connector/tool-blocklist`).
 */
const FREE = { class: 'free', latency: 'none' } as const;

/** The privilege-scopes component’s id (WP142). */
export const PRIVILEGE_SCOPES_COMPONENT_ID = 'governance/privilege-scopes';

/** The privilege-scopes component's config. */
export const privilegeScopesSchema = z.object({
	/** The calls governed, by id or name: `fs-bank/connector_crm_close-account`, `send_email`. */
	governed: z.array(z.string().min(1)).min(1),
	/** The governed calls the bot starts with; none by default. */
	granted: z.array(z.string().min(1)).default([]),
	/** `ask` pauses for a person to grant the scope; `refuse` blocks the step. */
	onElevation: z.enum(['ask', 'refuse']).default('ask')
});

/** Least privilege with recorded elevation, at `pre-act` (WP142). */
export const privilegeScopesComponent: GuardrailComponent<z.input<typeof privilegeScopesSchema>> = {
	id: PRIVILEGE_SCOPES_COMPONENT_ID,
	name: 'Least-privilege scopes',
	description:
		'Starts the bot with a minimal grant over the calls it governs; a call outside it is refused, or paused for a person to grant, and every elevation is on the trace.',
	technique: 'privilege-scopes',
	points: ['pre-act'],
	verdicts: ['allow', 'block-action', 'pause'],
	cost: FREE,
	configSchema: privilegeScopesSchema,
	explain: (config) => {
		const { governed, granted, onElevation } = privilegeScopesSchema.parse(config);
		const start = granted.length === 0 ? 'none of them granted' : `granted ${granted.join(', ')}`;
		return `Governs ${governed.join(', ')}, ${start}; anything else ${onElevation === 'ask' ? 'waits for a person to grant it' : 'is refused'}.`;
	},
	compile: (config, _deps, point) => {
		const { governed, granted, onElevation } = privilegeScopesSchema.parse(config);
		return stampComponent(
			[
				createPrivilegeScopesGuardrail({
					id: PRIVILEGE_SCOPES_COMPONENT_ID,
					name: 'Least-privilege scopes',
					description: `Governs ${governed.length} call(s), ${granted.length} granted at the start.`,
					governed,
					granted,
					onElevation
				})
			],
			PRIVILEGE_SCOPES_COMPONENT_ID,
			point
		);
	}
};
