/**
 * **The control map** (WP67, `53-ASSURANCE-PACK.md` §4.1; `41-…` §6.7): rows
 * of *relevance* — "this obligation is evidenced by these ids" — shipped as
 * content by a pack (`PackManifest.controlMaps`) or by a host on
 * `governance`'s behalf. A row is a claim a compliance reader edits; none is
 * a claim of compliance. Every evidence id must resolve — a registered
 * policy card, evaluator or guardrail, a campaign gate kind, an event type
 * the trace always carries, an egress mode, the principal record, or one of
 * the artefacts the assurance pack itself contains — and
 * `@craftabot/pack-testkit`'s `checkControlMap` refuses a dangling one.
 *
 * Declared in `core` rather than `governance` because the manifest names it
 * and `core` cannot import a package above it (`53-…` §2 item 1). The type
 * began life in `@craftabot/pack-fs-bank` (WP59) and moved here unchanged
 * but for `status` and `note`.
 */
export type ControlEvidenceKind =
	| 'guardrail'
	| 'policy-card'
	| 'evaluator'
	| 'gate'
	| 'trace-guarantee'
	| 'egress'
	| 'principal'
	| 'artefact';

export interface ControlEvidence {
	kind: ControlEvidenceKind;
	id: string;
	note?: string;
}

/**
 * `unreviewed`: no compliance reader has read the row yet — it ships, and the
 * pack counts it (`42-…` §5 rule 3). `pending`: the content the row would
 * cite is a later WP's; the row carries no evidence and the pack renders it
 * as pending, never as evidenced. Absent means reviewed.
 */
export type ControlRowStatus = 'unreviewed' | 'pending';

export interface ControlMapRow {
	framework: string;
	/** Unique within its map. */
	ref: string;
	title: string;
	obligation: string;
	evidence: ControlEvidence[];
	/** The obligation or threat tags this row groups. */
	tags: string[];
	status?: ControlRowStatus;
	/** Why a row is pending or what a reader should know; free text. */
	note?: string;
}

export interface ControlMap {
	/** Qualified, like every content id: `{packId}/{localId}`. */
	id: string;
	title: string;
	description: string;
	rows: ControlMapRow[];
}

/** The artefacts an `artefact` evidence id may name — the things the assurance pack itself contains. */
export const CONTROL_ARTEFACT_IDS = [
	'agent-card',
	'kit-file-requires',
	'campaign-report',
	'drift-series',
	'incident-log',
	'safety-case',
	'trace-bundle',
	'assurance-pack'
] as const;
export type ControlArtefactId = (typeof CONTROL_ARTEFACT_IDS)[number];

/** The campaign gate kinds a `gate` evidence id may name (`@craftabot/evals`' schema, listed here so `core` need not import it). */
export const CONTROL_GATE_KINDS = [
	'outcome-rate',
	'evaluator-pass-rate',
	'assertion-pass-rate',
	'metric',
	'no-regression',
	'derived-metric',
	'label-rate',
	'parity'
] as const;

/** The egress modes an `egress` evidence id may name (WP41). */
export const CONTROL_EGRESS_IDS = ['declared', 'none'] as const;

/** The principal records a `principal` evidence id may name (WP65 — resolves by name now; the pack says "not recorded" until then). */
export const CONTROL_PRINCIPAL_IDS = [
	'run.started.principal',
	'approval.resolved.by',
	'action.performed.attestation'
] as const;
