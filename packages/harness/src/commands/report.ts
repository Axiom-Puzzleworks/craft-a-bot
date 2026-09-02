import { capabilitiesOf, type PackRegistry, type Storage } from '@craftabot/core';
import {
	autonomyTelemetryFromSummaries,
	ensureRunSummaries,
	guardrailMixFromSummaries,
	incidentsFromSummaries,
	safetyCaseFromSummaries,
	telemetryByCard,
	telemetryByCartridge,
	type AutonomyTelemetry,
	type CartridgeTelemetry,
	type GoalCardTelemetry,
	type GuardrailMixEntry,
	type Incident,
	type SafetyCase
} from '@craftabot/governance/reports';

/**
 * `craftabot report` (WP37 stage C, `26-…` §6.8/§6.14): the governance
 * artefacts the Workshop's Incidents, Telemetry and Safety Case screens
 * render, produced from a run store by the same folds — one summary row per
 * run, folded and written back where a run has none. The DoD's sentence is
 * that `--safety-case` emits the JSON `/workshop/safety-case` renders for
 * the same bot, and it does so by calling the same function on the same
 * inputs, not by reimplementing it.
 */

export interface TelemetryReport {
	byCard: GoalCardTelemetry[];
	byCartridge: CartridgeTelemetry[];
	guardrailMix: GuardrailMixEntry[];
	autonomy: AutonomyTelemetry;
}

export async function reportIncidents(storage: Storage): Promise<Incident[]> {
	const runs = await storage.listRuns();
	return incidentsFromSummaries(runs, await ensureRunSummaries(storage, runs));
}

export async function reportTelemetry(storage: Storage): Promise<TelemetryReport> {
	const runs = await storage.listRuns();
	const summaries = await ensureRunSummaries(storage, runs);
	return {
		byCard: telemetryByCard(runs),
		byCartridge: telemetryByCartridge(runs),
		guardrailMix: guardrailMixFromSummaries(summaries.values()),
		autonomy: autonomyTelemetryFromSummaries(runs, summaries.values())
	};
}

/**
 * The safety case for one bot — or, when `agentId` is omitted and the store
 * holds exactly one bot, for that bot; anything else is asked for by id.
 */
export async function reportSafetyCase(
	storage: Storage,
	registry: PackRegistry,
	agentId?: string
): Promise<SafetyCase> {
	const agents = await storage.listAgents();
	const record =
		agentId === undefined
			? agents.length === 1
				? agents[0]
				: undefined
			: agents.find((agent) => agent.id === agentId);
	if (!record) {
		const known = agents.map((agent) => `${agent.id} (${agent.spec.name})`).join(', ');
		throw new Error(
			agentId === undefined
				? `which bot? the store holds ${agents.length}: ${known || 'none'} — pass --agent <id>`
				: `no bot '${agentId}' in the store${known ? ` — it holds: ${known}` : ''}`
		);
	}

	const mine = (await storage.listRuns()).filter((run) => run.agentId === record.id);
	const summaries = await ensureRunSummaries(storage, mine);
	return safetyCaseFromSummaries(
		{ id: record.id, name: record.spec.name, goalCardId: record.spec.goalCardId },
		capabilitiesOf(record.spec, registry),
		registry.getWorld(registry.getGoalCard(record.spec.goalCardId)?.worldId ?? ''),
		registry.listTools(),
		mine,
		summaries
	);
}
