import { z } from 'zod';
import type { EgressMode, GuardrailComponent } from '@craftabot/core';

/**
 * **The `egress-rule` adapter** (WP94, `85-COMPONENTS.md` §5, §9): the
 * session's fetch guard as two components, one per mode. Neither compiles
 * to a guardrail — the gate is not a `Guardrail`, and a rule on the trace
 * that never runs would be a lie — so `compile` returns nothing and
 * `egressModeOf` hands the mode to the host that sets `SessionOptions.egress`.
 */
export const EGRESS_DECLARED_COMPONENT_ID = 'governance/egress-declared';
export const EGRESS_NONE_COMPONENT_ID = 'governance/egress-none';

const egressSchema = z.object({}).default({});

const egressComponent = (
	id: string,
	name: string,
	description: string,
	explain: string
): GuardrailComponent<z.infer<typeof egressSchema>> => ({
	id,
	name,
	description,
	technique: 'egress-control',
	points: ['egress'],
	verdicts: ['allow', 'block-action'],
	cost: { class: 'free', latency: 'none' },
	configSchema: egressSchema,
	explain: () => explain,
	compile: () => []
});

export const egressDeclaredComponent = egressComponent(
	EGRESS_DECLARED_COMPONENT_ID,
	'Egress: declared hosts only',
	'Every fetch a brick or provider makes must go to a host it declared; anything else is refused and recorded.',
	'Allows a call only to a host the brick or provider declared.'
);

export const egressNoneComponent = egressComponent(
	EGRESS_NONE_COMPONENT_ID,
	'Egress: none',
	'No fetch leaves the session at all; every call is refused and recorded.',
	'Refuses every call that would leave this machine.'
);

export const egressComponents: GuardrailComponent[] = [
	egressDeclaredComponent as GuardrailComponent,
	egressNoneComponent as GuardrailComponent
];

/** The session's egress mode a component stands for, or undefined for any other component. */
export function egressModeOf(componentId: string): EgressMode | undefined {
	if (componentId === EGRESS_DECLARED_COMPONENT_ID) return 'declared';
	if (componentId === EGRESS_NONE_COMPONENT_ID) return 'none';
	return undefined;
}
