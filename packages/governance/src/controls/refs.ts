import {
	CONTROL_ARTEFACT_IDS,
	CONTROL_GATE_KINDS,
	EVENT_TYPES,
	parseControlRef,
	type PackRegistry
} from '@craftabot/core';
import { GOVERNANCE_GUARDRAIL_IDS } from '../reports/control-map.js';
import { getControlMechanism } from './mechanisms.js';

/** What `resolveControlRef` looks things up in: the registry's getters for registered content. */
export type ControlRefRegistry = Pick<
	PackRegistry,
	| 'getGuardrailComponent'
	| 'getPolicyCard'
	| 'getEvaluator'
	| 'getReader'
	| 'getScenario'
	| 'getStack'
	| 'getBrickKind'
	| 'getErrorModel'
	| 'getReviewerModel'
>;

/** What `resolveControlRef` is told beside the registry. */
export interface ControlRefOptions {
	/** Guardrail ids the host installs beside `governance`'s own (`GOVERNANCE_GUARDRAIL_IDS`, always known). */
	knownGuardrails?: readonly string[];
}

const ARTEFACTS = new Set<string>(CONTROL_ARTEFACT_IDS);
const GATES = new Set<string>(CONTROL_GATE_KINDS);
const EVENTS = new Set<string>(EVENT_TYPES);

/**
 * **`resolveControlRef`** (WP132, `110-CONTROL-SUITE-PLAN.md` §4.1): why a
 * control reference does not resolve, or `undefined` when it does.
 * Registered kinds resolve against the registry; `guardrail` against
 * `governance`'s ids and the host's; `gate`, `trace-guarantee` and
 * `artefact` against `core`'s closed lists; `mechanism` against
 * `CONTROL_MECHANISMS`.
 */
export function resolveControlRef(
	ref: string,
	registry: ControlRefRegistry,
	options: ControlRefOptions = {}
): string | undefined {
	const parsed = parseControlRef(ref);
	if (!parsed) return `"${ref}" is not a control reference ({kind}:{id})`;
	const { kind, id } = parsed;
	const missing = (what: string) => `${kind} "${id}" ${what}`;
	switch (kind) {
		case 'component':
			return registry.getGuardrailComponent(id)
				? undefined
				: missing('is not a registered component');
		case 'policy-card':
			return registry.getPolicyCard(id) ? undefined : missing('is not a registered policy card');
		case 'evaluator':
			return registry.getEvaluator(id) ? undefined : missing('is not a registered evaluator');
		case 'reader':
			return registry.getReader(id) ? undefined : missing('is not a registered reader');
		case 'scenario':
			return registry.getScenario(id) ? undefined : missing('is not a registered scenario');
		case 'stack':
			return registry.getStack(id) ? undefined : missing('is not a registered stack');
		case 'brick-kind':
			return registry.getBrickKind(id) ? undefined : missing('is not a registered brick kind');
		case 'error-model':
			return registry.getErrorModel(id) ? undefined : missing('is not a registered error model');
		case 'reviewer-model':
			return registry.getReviewerModel(id)
				? undefined
				: missing('is not a registered reviewer model');
		case 'guardrail':
			return GOVERNANCE_GUARDRAIL_IDS.includes(id) || options.knownGuardrails?.includes(id)
				? undefined
				: missing('is not a guardrail id governance or the host installs');
		case 'gate':
			return GATES.has(id) ? undefined : missing('is not a campaign gate kind');
		case 'trace-guarantee':
			return EVENTS.has(id) ? undefined : missing('is not an event type the trace can carry');
		case 'artefact':
			return ARTEFACTS.has(id)
				? undefined
				: missing('is not an artefact the assurance pack contains');
		case 'mechanism':
			return getControlMechanism(id) ? undefined : missing('is not a declared mechanism');
	}
}

/** The kinds a package below the packs cannot resolve without the host's registry — a governance-only test filters these. */
export const REGISTERED_REF_KINDS = [
	'component',
	'policy-card',
	'evaluator',
	'reader',
	'scenario',
	'stack',
	'brick-kind',
	'error-model',
	'reviewer-model'
] as const;
