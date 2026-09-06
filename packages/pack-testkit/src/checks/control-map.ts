import {
	CONTROL_ARTEFACT_IDS,
	CONTROL_EGRESS_IDS,
	CONTROL_GATE_KINDS,
	CONTROL_PRINCIPAL_IDS,
	EVENT_TYPES,
	type ControlMap,
	type PackRegistry
} from '@craftabot/core';
import type { ConformanceIssue } from '../types.js';

/**
 * **`checkControlMap`** (WP67, `53-ASSURANCE-PACK.md` §4.1): every row of a
 * control map is a claim of relevance, and every claim must point at
 * something that exists. A `policy-card`, `evaluator` or `guardrail` id
 * resolves against the registry (a guardrail also against the host's own
 * ids — `governance`'s `safety/…`, handed in as `knownGuardrails`); a `gate`
 * is one of the campaign gate kinds; a `trace-guarantee` is an event type
 * the trace can carry; an `egress` is a mode; a `principal` is one of the
 * records WP65 writes; an `artefact` is one the assurance pack contains. A
 * pending row carries no evidence; every other row carries at least one.
 * Refs are unique within a map; tags come from the vocabularies the caller
 * lists. Nothing here judges the wording — a compliance reader does.
 */
export interface ControlMapCheckOptions {
	/** Guardrail ids the host installs itself (`governance`'s), beside the registry's services. */
	knownGuardrails?: readonly string[];
	/** The obligation and threat vocabularies a tag must come from; absent means tags are not checked. */
	knownTags?: readonly string[];
	/**
	 * Whether `checkManifest` resolves the manifest's maps against the pack and
	 * its companions (default true). A map that spans packs — the bank's, which
	 * cites the three desks' evaluators — is resolved by the host that installs
	 * them all instead, and says so here.
	 */
	resolve?: boolean;
}

export function checkControlMap(
	map: ControlMap,
	registry: PackRegistry,
	options: ControlMapCheckOptions = {}
): ConformanceIssue[] {
	const issues: ConformanceIssue[] = [];
	const guardrails = new Set(options.knownGuardrails ?? []);
	const tags = options.knownTags === undefined ? undefined : new Set(options.knownTags);
	const artefacts = new Set<string>(CONTROL_ARTEFACT_IDS);
	const gates = new Set<string>(CONTROL_GATE_KINDS);
	const egress = new Set<string>(CONTROL_EGRESS_IDS);
	const principals = new Set<string>(CONTROL_PRINCIPAL_IDS);
	const events = new Set<string>(EVENT_TYPES);

	if (map.rows.length === 0)
		issues.push({ check: 'control-map.rows', message: `map "${map.id}" has no rows` });

	const refs = new Set<string>();
	for (const row of map.rows) {
		const where = `map "${map.id}" row "${row.ref}"`;
		if (refs.has(row.ref))
			issues.push({ check: 'control-map.ref-unique', message: `${where}: duplicate ref` });
		refs.add(row.ref);
		if (row.status === 'pending') {
			if (row.evidence.length > 0)
				issues.push({
					check: 'control-map.pending-has-no-evidence',
					message: `${where}: a pending row carries no evidence (it names its WP in \`note\` instead)`
				});
			if (!row.note)
				issues.push({
					check: 'control-map.pending-names-its-wp',
					message: `${where}: a pending row says in \`note\` what it waits for`
				});
		} else if (row.evidence.length === 0) {
			issues.push({
				check: 'control-map.row-has-evidence',
				message: `${where}: a row that is not pending cites at least one piece of evidence`
			});
		}
		for (const item of row.evidence) {
			const dangling = (why: string) =>
				issues.push({
					check: 'control-map.evidence-resolves',
					message: `${where}: ${item.kind} "${item.id}" ${why}`
				});
			switch (item.kind) {
				case 'policy-card':
					if (!registry.getPolicyCard(item.id)) dangling('is not a registered policy card');
					break;
				case 'evaluator':
					if (!registry.getEvaluator(item.id)) dangling('is not a registered evaluator');
					break;
				case 'guardrail':
					if (!registry.getGuardrailService(item.id) && !guardrails.has(item.id))
						dangling('is neither a registered guardrail service nor a known guardrail id');
					break;
				case 'gate':
					if (!gates.has(item.id))
						dangling(`is not a campaign gate kind (${[...gates].join(', ')})`);
					break;
				case 'trace-guarantee':
					if (!events.has(item.id)) dangling('is not an event type the trace can carry');
					break;
				case 'egress':
					if (!egress.has(item.id)) dangling('is not an egress mode (declared, none)');
					break;
				case 'principal':
					if (!principals.has(item.id))
						dangling(`is not a principal record (${[...principals].join(', ')})`);
					break;
				case 'artefact':
					if (!artefacts.has(item.id))
						dangling(
							`is not an artefact the assurance pack contains (${[...artefacts].join(', ')})`
						);
					break;
				default:
					dangling(`has an unknown evidence kind "${String((item as { kind: unknown }).kind)}"`);
			}
		}
		if (tags) {
			for (const tag of row.tags)
				if (!tags.has(tag))
					issues.push({
						check: 'control-map.tags-known',
						message: `${where}: tag "${tag}" is not in the obligation or threat vocabulary`
					});
		}
	}
	return issues;
}
