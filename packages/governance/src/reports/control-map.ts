import type { ControlMap, ControlMapRow } from '@craftabot/core';
import { ACTION_BLOCKLIST_ID } from '../guardrails/action-blocklist.js';
import { APPROVAL_MODE_ID } from '../guardrails/approval-mode.js';
import { NO_REPETITION_ID } from '../guardrails/no-repetition.js';
import { STEP_BUDGET_ID } from '../guardrails/step-budget.js';
import { TOKEN_BUDGET_ID } from '../guardrails/token-budget.js';
import { TOOL_BLOCKLIST_ID } from '../guardrails/tool-blocklist.js';

/**
 * **The generic control map** (WP67, `53-ASSURANCE-PACK.md` §4.1; `41-…`
 * §6.7): the frameworks a UK firm with EU customers is audited against
 * beside the UK rows the bank and the desks ship — NIST AI RMF, the EU AI
 * Act, ISO/IEC 42001 and OWASP's agentic top ten — one row per clause, its
 * evidence the mechanisms `docs/governance-mapping.md` already lists under
 * that clause. Every row is a claim of *relevance* a compliance reader
 * edits; none is a claim of compliance (`08-…` §6's posture). `governance`
 * is not a pack, so a host registers this map under a synthetic manifest
 * (`GENERIC_CONTROL_MAP_MANIFEST`), the way the Workshop registers `local`.
 *
 * Every row ships `unreviewed` until a compliance reader has read it; the
 * assurance pack counts them.
 */
/** The generic map's id, under the synthetic `governance` manifest a host registers. */
export const GENERIC_CONTROL_MAP_ID = 'governance/control-map';

/** The guardrail ids `governance` installs itself — what a `guardrail` evidence id may name beside a registered service. */
export const GOVERNANCE_GUARDRAIL_IDS: readonly string[] = [
	STEP_BUDGET_ID,
	TOKEN_BUDGET_ID,
	ACTION_BLOCKLIST_ID,
	TOOL_BLOCKLIST_ID,
	NO_REPETITION_ID,
	APPROVAL_MODE_ID
];

const row = (
	framework: string,
	ref: string,
	title: string,
	obligation: string,
	evidence: ControlMapRow['evidence'],
	tags: string[]
): ControlMapRow => ({ framework, ref, title, obligation, evidence, tags, status: 'unreviewed' });

const trace = (id: string, note?: string) => ({
	kind: 'trace-guarantee' as const,
	id,
	...(note ? { note } : {})
});
const guardrail = (id: string) => ({ kind: 'guardrail' as const, id });
const artefact = (id: string, note?: string) => ({
	kind: 'artefact' as const,
	id,
	...(note ? { note } : {})
});
const gate = (id: string) => ({ kind: 'gate' as const, id });

/** The generic rows — NIST AI RMF, the EU AI Act, ISO/IEC 42001, OWASP ASI — every one `unreviewed`, none a claim of compliance. */
export const genericControlMap: ControlMap = {
	id: GENERIC_CONTROL_MAP_ID,
	title: 'Generic frameworks',
	description:
		'NIST AI RMF, the EU AI Act, ISO/IEC 42001 and OWASP ASI — the clauses the shipped mechanisms can be described under. Relevance, not compliance.',
	rows: [
		row(
			'NIST AI RMF 1.0',
			'govern-1.2',
			'Govern 1.2 — policies for AI risk',
			'Rules about what an agent may do are written down as data and enforced at runtime.',
			[guardrail(ACTION_BLOCKLIST_ID), guardrail(TOOL_BLOCKLIST_ID), trace('guardrail.checked')],
			['pra:ss1-23:governance']
		),
		row(
			'NIST AI RMF 1.0',
			'govern-1.5',
			'Govern 1.5 — accountability through records',
			'Every prompt, decision, action and check is on a digest-covered trace.',
			[trace('decision'), trace('action.performed'), artefact('trace-bundle')],
			['pra:ss1-23:governance']
		),
		row(
			'NIST AI RMF 1.0',
			'map-5.1',
			'Map 5.1 — likelihood and magnitude of impacts',
			'Irreversible capability is named per build, never hidden.',
			[artefact('safety-case', 'the reach section'), artefact('agent-card')],
			['pra:ss1-23:identification']
		),
		row(
			'NIST AI RMF 1.0',
			'measure-2.3',
			'Measure 2.3 — performance measured',
			'Campaigns with gates are the test evidence; no-regression gates are change control.',
			[artefact('campaign-report'), gate('no-regression'), gate('evaluator-pass-rate')],
			['pra:ss1-23:development']
		),
		row(
			'NIST AI RMF 1.0',
			'measure-2.4',
			'Measure 2.4 — monitoring in deployment',
			'A daily series over runs, evaluations and campaigns with drift flagged.',
			[artefact('drift-series'), artefact('incident-log')],
			['pra:ss1-23:validation']
		),
		row(
			'NIST AI RMF 1.0',
			'measure-2.7',
			'Measure 2.7 — security and resilience',
			'Untrusted input is screened, egress is declared or refused, adversarial scenarios are run.',
			[trace('guardrail.external'), { kind: 'egress', id: 'none' }, gate('outcome-rate')],
			['pra:ss1-23:mitigants']
		),
		row(
			'NIST AI RMF 1.0',
			'manage-2.4',
			'Manage 2.4 — mechanisms to supersede or disengage',
			'A budget, a blocklist, a loop-breaker, an approval gate and a stop.',
			[
				guardrail(STEP_BUDGET_ID),
				guardrail(TOKEN_BUDGET_ID),
				guardrail(NO_REPETITION_ID),
				guardrail(APPROVAL_MODE_ID),
				trace('run.finished', 'STOPPED_BY_USER')
			],
			['pra:ss1-23:mitigants']
		),
		row(
			'EU AI Act',
			'art-9',
			'Article 9 — risk management',
			'Risks identified per build and mitigated by the safety stack; tested by campaigns.',
			[artefact('safety-case'), artefact('campaign-report'), guardrail(ACTION_BLOCKLIST_ID)],
			['pra:ss1-23:mitigants']
		),
		row(
			'EU AI Act',
			'art-12',
			'Article 12 — record-keeping',
			'Automatic logging of every event, exportable with a digest.',
			[trace('prompt.composed'), trace('action.performed'), artefact('trace-bundle')],
			['pra:ss1-23:governance']
		),
		row(
			'EU AI Act',
			'art-14',
			'Article 14 — human oversight',
			'A person can pause, approve, refuse and stop; the record says when they did.',
			[
				guardrail(APPROVAL_MODE_ID),
				trace('approval.requested'),
				trace('approval.resolved'),
				{ kind: 'principal', id: 'approval.resolved.by' }
			],
			['pra:ss1-23:governance']
		),
		row(
			'EU AI Act',
			'art-15',
			'Article 15 — accuracy, robustness, cybersecurity',
			'Deterministic replay, budgets, screened inputs, declared egress.',
			[guardrail(STEP_BUDGET_ID), trace('guardrail.external'), { kind: 'egress', id: 'declared' }],
			['pra:ss1-23:mitigants']
		),
		row(
			'EU AI Act',
			'art-72',
			'Article 72 — post-market monitoring',
			'The drift series and the incident log over stored runs.',
			[artefact('drift-series'), artefact('incident-log')],
			['pra:ss1-23:validation']
		),
		row(
			'ISO/IEC 42001:2023',
			'clause-6.1',
			'6.1 — risk assessment',
			'Risk-tiered actions; the safety case names inability and reach.',
			[artefact('safety-case'), guardrail(APPROVAL_MODE_ID)],
			['pra:ss1-23:identification']
		),
		row(
			'ISO/IEC 42001:2023',
			'a.6.2.4',
			'A.6.2.4 — verification and validation',
			'Campaigns, gates and evaluators over every stored run.',
			[artefact('campaign-report'), gate('evaluator-pass-rate'), gate('parity')],
			['pra:ss1-23:validation']
		),
		row(
			'ISO/IEC 42001:2023',
			'a.6.2.8',
			'A.6.2.8 — event logging',
			'Typed events, a digest, exportable traces and bundles.',
			[trace('guardrail.checked'), artefact('trace-bundle')],
			['pra:ss1-23:governance']
		),
		row(
			'ISO/IEC 42001:2023',
			'a.9.2',
			'A.9.2 — human oversight measures',
			'The approval gate, the autonomy dial, the stop.',
			[guardrail(APPROVAL_MODE_ID), trace('approval.requested')],
			['pra:ss1-23:governance']
		),
		row(
			'OWASP Top 10 for Agentic Applications',
			'asi01',
			'ASI01 — agent goal hijack',
			'Injection scenarios in every deck; input screening at pre-think.',
			[trace('guardrail.external'), gate('outcome-rate')],
			['ASI01']
		),
		row(
			'OWASP Top 10 for Agentic Applications',
			'asi02',
			'ASI02 — tool misuse and exploitation',
			'Tool and action blocklists; policy cards over arguments; poisoned-line scenarios.',
			[guardrail(TOOL_BLOCKLIST_ID), guardrail(ACTION_BLOCKLIST_ID), trace('tool.executed')],
			['ASI02']
		),
		row(
			'OWASP Top 10 for Agentic Applications',
			'asi05',
			'ASI05 — unexpected code execution',
			'Declared egress and a no-network mode; nothing runs that was not declared.',
			[
				{ kind: 'egress', id: 'declared' },
				{ kind: 'egress', id: 'none' }
			],
			['ASI05']
		),
		row(
			'OWASP Top 10 for Agentic Applications',
			'asi06',
			'ASI06 — memory and context poisoning',
			'Notebook writes carry provenance on the trace.',
			[trace('memory.updated')],
			['ASI06']
		),
		row(
			'OWASP Top 10 for Agentic Applications',
			'asi09',
			'ASI09 — human-agent trust exploitation',
			'Approvals are recorded; a person sees what was proposed before it runs.',
			[trace('approval.requested'), guardrail(APPROVAL_MODE_ID)],
			['ASI09']
		),
		row(
			'OWASP Top 10 for Agentic Applications',
			'asi10',
			'ASI10 — rogue agents',
			'Budgets, the loop-breaker and the stop bound every run.',
			[guardrail(STEP_BUDGET_ID), guardrail(NO_REPETITION_ID), trace('run.finished')],
			['ASI10']
		)
	]
};

/** The synthetic manifest a host registers the generic map under (`53-…` §4.1). */
export const GENERIC_CONTROL_MAP_MANIFEST = {
	id: 'governance',
	name: 'Governance (generic control map)',
	version: '1.0.0',
	requiresCore: '>=1.0.0',
	controlMaps: [genericControlMap]
} as const;
