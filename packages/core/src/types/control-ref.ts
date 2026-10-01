/**
 * **A control reference** (WP132, `110-CONTROL-SUITE-PLAN.md` §4.1): one
 * thing in the product that constrains, measures or records a bot's
 * behaviour, named as `{kind}:{id}` so every place that cites a control —
 * the catalogue's `implementedBy`, the Control Inventory's rows — cites the
 * same key and a check can resolve it. Before the second edition the
 * catalogue named its implementations in prose; a reference either resolves
 * or is refused.
 *
 * - `component`, `policy-card`, `evaluator`, `reader`, `scenario`, `stack`,
 *   `brick-kind`, `error-model`, `reviewer-model` — registered content, resolved
 *   against the registry.
 * - `guardrail` — a guardrail id a host installs itself (`governance`'s
 *   `safety/…`, the Connector's `connector/tool-blocklist`), resolved
 *   against the ids the host hands in.
 * - `ceiling` — a decision right's ceiling, `{domainId}#{kind}`; `knob` — a
 *   knob a world declares, `{worldId}#{knob}`. Resolved against the
 *   registry's domains and worlds.
 * - `gate` — a campaign gate kind (`CONTROL_GATE_KINDS`).
 * - `trace-guarantee` — an event type the trace can carry (`EVENT_TYPES`).
 * - `artefact` — one the assurance pack contains (`CONTROL_ARTEFACT_IDS`).
 * - `mechanism` — the engine's, the workflow's, the Gate's or a fold's fixed
 *   behaviour: observable and testable, never fitted. Declared in
 *   `governance`'s `CONTROL_MECHANISMS`, with where it lives.
 */
export const CONTROL_REF_KINDS = [
	'component',
	'guardrail',
	'policy-card',
	'evaluator',
	'reader',
	'scenario',
	'stack',
	'brick-kind',
	'error-model',
	'reviewer-model',
	'ceiling',
	'knob',
	'gate',
	'trace-guarantee',
	'artefact',
	'mechanism'
] as const;
export type ControlRefKind = (typeof CONTROL_REF_KINDS)[number];

/** `{kind}:{id}`; the id is everything after the first colon. */
export type ControlRef = `${ControlRefKind}:${string}`;

export const CONTROL_REF_PATTERN = new RegExp(`^(${CONTROL_REF_KINDS.join('|')}):\\S+$`);

/** A reference split into its kind and id, or `undefined` when it is not one. */
export function parseControlRef(ref: string): { kind: ControlRefKind; id: string } | undefined {
	if (!CONTROL_REF_PATTERN.test(ref)) return undefined;
	const at = ref.indexOf(':');
	return { kind: ref.slice(0, at) as ControlRefKind, id: ref.slice(at + 1) };
}

/** `{kind}:{id}`. */
export function controlRef(kind: ControlRefKind, id: string): ControlRef {
	return `${kind}:${id}`;
}
