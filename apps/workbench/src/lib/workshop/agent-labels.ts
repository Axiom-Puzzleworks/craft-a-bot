import type { AgentRecord } from '@craftabot/core';

/**
 * **Telling two bots apart in a picker** (UX-21, `docs/manual/UX-AND-GAPS.md`,
 * 2026-09-07). Every Workshop picker — Assurance, the Safety case, Guards'
 * *Fit into*, Campaigns' build adder — listed bots by name alone, and two
 * bots called *My Very First Agent* were indistinguishable in all of them.
 *
 * The label stays the name while names are unique, so nothing a screenshot
 * holds moves; only a name shared with another bot on the shelf earns the
 * first six characters of its id beside it. Deterministic: the same shelf
 * gives the same labels in the same order.
 */
export function agentOptionLabel(agent: AgentRecord, agents: readonly AgentRecord[]): string {
	const shared = agents.some(
		(other) => other.id !== agent.id && other.spec.name === agent.spec.name
	);
	return shared ? `${agent.spec.name} · ${agent.id.slice(0, 6)}` : agent.spec.name;
}

/**
 * The bot a screen should open on when nobody has chosen one (UX-20): the
 * one most recently run, else the one most recently touched. `undefined` for
 * an empty shelf — the screen then says so rather than guessing.
 */
export function mostRecentAgent(agents: readonly AgentRecord[]): AgentRecord | undefined {
	if (agents.length === 0) return undefined;
	const byRecency = [...agents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	return byRecency.find((agent) => agent.lastRunId !== undefined) ?? byRecency[0];
}
