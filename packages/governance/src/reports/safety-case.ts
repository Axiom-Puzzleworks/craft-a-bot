import type { EngineEvent, RunRecord, ToolDefinition, WorldDefinition } from '@craftabot/core';
import { offers, type BotCapabilities } from '@craftabot/core';
import { incidentsFrom } from './incidents.js';

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
 * **Trustworthiness** is run history, scoped to this one bot: `incidents.ts`'s
 * own derivation, reused rather than reimplemented, over only this agent's
 * runs. No eval-matrix figure — nothing here ties a stored eval run back to
 * one bot yet, and a worksheet that invented that link would be worse than
 * one that left it out.
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
}

export function safetyCaseFor(
	agent: { id: string; name: string; goalCardId: string },
	capabilities: BotCapabilities,
	world: WorldDefinition | undefined,
	tools: readonly ToolDefinition[],
	runs: readonly RunRecord[],
	eventsByRun: ReadonlyMap<string, readonly EngineEvent[]>
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
	const incidents = incidentsFrom(runs, eventsByRun);

	const armourFitted = capabilities.guardrailIds.some((id) => id.startsWith('geap/armor:'));
	let decisions = 0;
	let fired = 0;
	if (armourFitted) {
		for (const run of runs) {
			for (const event of eventsByRun.get(run.id) ?? []) {
				if (event.type === 'decision' && event.payload.call !== null) decisions += 1;
				if (event.type === 'guardrail.external' && event.payload.hook === 'pre-act') fired += 1;
			}
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
		hostedScreening: armourFitted ? { fired, decisions } : undefined
	};
}
