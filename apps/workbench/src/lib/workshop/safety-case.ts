import type { EngineEvent, RunRecord, ToolDefinition, WorldDefinition } from '@craftabot/core';
import { offers, type BotCapabilities } from '$lib/bot-capabilities.js';
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
		}
	};
}
