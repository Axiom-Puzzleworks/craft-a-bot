import type {
	BotCapabilities,
	EngineEvent,
	EvaluationRecord,
	RunRecord,
	RunSummary,
	ToolDefinition,
	WorldDefinition
} from '@craftabot/core';
import { offers } from '@craftabot/core';
import {
	campaignEvidenceFor,
	type CampaignEvidence,
	type CampaignReportLike
} from './campaign-evidence.js';
import { incidentsFromSummaries } from './incidents.js';
import { summariesOf } from './summary.js';

/**
 * **The safety-case worksheet** (`19-…` #28, WP34 stage C): a "why is my
 * agent safe?" argument, in UK AISI's own three-argument shape (§6.6) —
 * *inability* (it cannot cause this harm), *control* (something stops it
 * even though it could), *trustworthiness* (it has behaved) — auto-
 * assembled from evidence this app already has, never invented.
 *
 * **Inability** compares the full, irreversible-tier catalogue (every world
 * action and tool carrying `riskTier: 'irreversible'`, `14-…` §4.5) against
 * what this build actually reaches (`BotCapabilities`, the same machinery
 * the leaflet reads a bot through). What is not reached is a real inability
 * claim; what *is* reached is named too, in `reach`, rather than hidden —
 * a safety case that only shows absence of danger is not honest, and the
 * things a bot can reach are exactly what `guardrails` needs to be seen
 * against.
 *
 * **Control** is `capabilities.guardrailIds` verbatim — every rule this
 * build's fitted bricks actually install, the same list `contributeGuardrails`
 * feeds the session.
 *
 * **Trustworthiness** is run history, scoped to this one bot: the incident
 * log's own derivation, reused rather than reimplemented, over only this
 * agent's runs. No eval-matrix figure — nothing here ties a stored eval run
 * back to one bot yet, and a worksheet that invented that link would be
 * worse than one that left it out.
 *
 * **Hosted screening** (`25-ARMOUR-BRICK.md` §11 Stage E) is `control`'s own
 * specific case for a hosted guardrail: `guardrails` already lists
 * `geap/armor:*` ids verbatim like any other rule, but a fired hosted check
 * is real, countable evidence a local rule's own presence in that list
 * cannot show — `guardrail.external` only exists on the trace when the guard
 * actually ran. `undefined` when the Armour Brick is not fitted at all, the
 * same "absence is a fact worth stating plainly" discipline `inability`
 * already holds to; `{ fired, decisions }` otherwise, read as "hosted
 * content screening ran on `fired` of `decisions` decisions" (`25-…` §5's
 * own UX trajectory wording) — `decisions` counts every real decision this
 * bot's stored runs made, `fired` counts how many of those were actually
 * sent to Model Armor's `sanitizeModelResponse` (the `pre-act` hook,
 * `25-…` §4.5 — screening observations/results is a different question this
 * one figure does not answer).
 *
 * Since WP36 stage C every count here is read from the runs' `RunSummary`
 * rows; `safetyCaseFor` over events is kept as a wrapper that summarises first.
 */

export interface SafetyCase {
	agentId: string;
	agentName: string;
	goalCardId: string;
	/** What this build genuinely cannot do, and why. */
	inability: string[];
	/** Irreversible capability this build CAN reach — named, not hidden. */
	reach: string[];
	/** Every guardrail id this build's fitted bricks actually install. */
	guardrails: readonly string[];
	trustworthiness: {
		runs: number;
		finishedRuns: number;
		/** `undefined` when nothing has finished yet — never 0, which would claim a rate. */
		successRate: number | undefined;
		incidentRuns: number;
	};
	/** `undefined` when no `geap/armor` guardrail is fitted at all. */
	hostedScreening: { fired: number; decisions: number } | undefined;
	/**
	 * Every host pattern any of this bot's runs was allowed to call (WP41,
	 * `26-…` §6.6) — one control row each. Empty when no run has recorded
	 * its egress yet; `noNetworkRuns` counts the runs that allowed none.
	 */
	egress: { hosts: string[]; recordedRuns: number; noNetworkRuns: number };
	/**
	 * **Evaluation evidence** (WP49, `37-…` §4.2): every evaluator that has
	 * judged one of this bot's runs, with its verdicts counted as stored —
	 * the figure `17-…` §4.9 withheld until something tied an evaluation to
	 * a bot. `EvaluationRecord.runId` is that tie. Busiest evaluator first.
	 */
	evaluations: EvaluationEvidence[];
	/** **Campaign results** (WP49): every stored report in which a build was this bot, with the gates that applied to it. */
	campaigns: CampaignEvidence[];
}

export interface EvaluationEvidence {
	evaluatorId: string;
	pass: number;
	fail: number;
	inconclusive: number;
	/** Records that carried no verdict at all (a score-only evaluator). */
	noVerdict: number;
	/** Over the records that carried a score; `undefined` when none did — never 0. */
	meanScore: number | undefined;
}

function evaluationEvidenceFor(
	runs: readonly RunRecord[],
	evaluations: readonly EvaluationRecord[]
): EvaluationEvidence[] {
	const mine = new Set(runs.map((run) => run.id));
	const rows = new Map<string, EvaluationEvidence & { scored: number; scoreTotal: number }>();
	for (const record of evaluations) {
		if (!mine.has(record.runId)) continue;
		let row = rows.get(record.evaluatorId);
		if (!row) {
			row = {
				evaluatorId: record.evaluatorId,
				pass: 0,
				fail: 0,
				inconclusive: 0,
				noVerdict: 0,
				meanScore: undefined,
				scored: 0,
				scoreTotal: 0
			};
			rows.set(record.evaluatorId, row);
		}
		const verdict = record.result.verdict;
		if (verdict === undefined) row.noVerdict += 1;
		else row[verdict] += 1;
		if (record.result.score !== undefined) {
			row.scored += 1;
			row.scoreTotal += record.result.score;
		}
	}
	return [...rows.values()]
		.map(({ scored, scoreTotal, ...row }) => ({
			...row,
			meanScore: scored === 0 ? undefined : scoreTotal / scored
		}))
		.sort(
			(a, b) =>
				b.pass +
					b.fail +
					b.inconclusive +
					b.noVerdict -
					(a.pass + a.fail + a.inconclusive + a.noVerdict) ||
				a.evaluatorId.localeCompare(b.evaluatorId)
		);
}

export function safetyCaseFromSummaries(
	agent: { id: string; name: string; goalCardId: string },
	capabilities: BotCapabilities,
	world: WorldDefinition | undefined,
	tools: readonly ToolDefinition[],
	runs: readonly RunRecord[],
	summaries: ReadonlyMap<string, RunSummary>,
	evaluations: readonly EvaluationRecord[] = [],
	campaigns: readonly CampaignReportLike[] = []
): SafetyCase {
	const inability: string[] = [];
	const reach: string[] = [];

	const irreversibleActions = (world?.actions ?? []).filter(
		(action) => action.riskTier === 'irreversible'
	);
	for (const action of irreversibleActions) {
		if (offers(capabilities.actionIds, action.id)) {
			reach.push(`Can ${action.name.toLowerCase()} — an irreversible world action.`);
		} else {
			inability.push(`Cannot ${action.name.toLowerCase()} — not an action this build enables.`);
		}
	}
	if (irreversibleActions.length === 0 && world) {
		inability.push(`${world.name}'s own world offers no irreversible action at all.`);
	}

	const irreversibleTools = tools.filter((tool) => tool.riskTier === 'irreversible');
	for (const tool of irreversibleTools) {
		if (offers(capabilities.toolIds, tool.id)) {
			reach.push(`Can use ${tool.name} — an irreversible tool.`);
		} else {
			inability.push(`Cannot use ${tool.name} — not a tool this build's fitted bricks reach.`);
		}
	}

	const finished = runs.filter((run) => run.outcome !== 'IN_PROGRESS');
	const succeeded = finished.filter((run) => run.outcome === 'SUCCESS');
	const incidents = incidentsFromSummaries(runs, summaries);

	const armourFitted = capabilities.guardrailIds.some((id) => id.startsWith('geap/armor:'));
	let decisions = 0;
	let fired = 0;
	const hosts = new Set<string>();
	let recordedRuns = 0;
	let noNetworkRuns = 0;
	for (const run of runs) {
		const egress = summaries.get(run.id)?.egress;
		if (!egress) continue;
		recordedRuns += 1;
		if (egress.mode === 'none') noNetworkRuns += 1;
		for (const host of egress.hosts) hosts.add(host);
	}
	if (armourFitted) {
		for (const run of runs) {
			const summary = summaries.get(run.id);
			if (!summary) continue;
			decisions += summary.decisions;
			fired += summary.hostedPreActScreens;
		}
	}

	return {
		agentId: agent.id,
		agentName: agent.name,
		goalCardId: agent.goalCardId,
		inability,
		reach,
		guardrails: capabilities.guardrailIds,
		trustworthiness: {
			runs: runs.length,
			finishedRuns: finished.length,
			successRate: finished.length === 0 ? undefined : succeeded.length / finished.length,
			incidentRuns: incidents.length
		},
		hostedScreening: armourFitted ? { fired, decisions } : undefined,
		egress: { hosts: [...hosts].sort(), recordedRuns, noNetworkRuns },
		evaluations: evaluationEvidenceFor(runs, evaluations),
		campaigns: campaignEvidenceFor(agent.id, campaigns)
	};
}

/** The pre-summary signature, kept: summarise the events, then assemble. */
export function safetyCaseFor(
	agent: { id: string; name: string; goalCardId: string },
	capabilities: BotCapabilities,
	world: WorldDefinition | undefined,
	tools: readonly ToolDefinition[],
	runs: readonly RunRecord[],
	eventsByRun: ReadonlyMap<string, readonly EngineEvent[]>,
	evaluations: readonly EvaluationRecord[] = [],
	campaigns: readonly CampaignReportLike[] = []
): SafetyCase {
	return safetyCaseFromSummaries(
		agent,
		capabilities,
		world,
		tools,
		runs,
		summariesOf(runs, eventsByRun),
		evaluations,
		campaigns
	);
}
