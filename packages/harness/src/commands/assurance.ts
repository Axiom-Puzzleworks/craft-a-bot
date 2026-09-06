import type { PackRegistry, Storage } from '@craftabot/core';
import { parseCampaignReport } from '@craftabot/evals';
import {
	assurancePackFromStorage,
	renderAssurancePackHtml,
	renderAssurancePackMarkdown,
	type AssuranceCampaignReportLike,
	type AssurancePack
} from '@craftabot/governance/reports';

/**
 * `craftabot assurance` (WP67 stage C, `53-ASSURANCE-PACK.md` §4.3): the
 * assurance pack for one bot from a run store — the same fold
 * `/workshop/assurance` renders for the same bot, by calling the same
 * function on the same inputs (the WP37 equality pattern), with the JSON,
 * the markdown and the self-contained HTML written where the flags say.
 */
export interface AssuranceRenderings {
	pack: AssurancePack;
	markdown: string;
	html: string;
}

/** The bot to file: the one named, or the only one in the store; anything else is asked for by id. */
export async function resolveAgentId(storage: Storage, agentId?: string): Promise<string> {
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
	return record.id;
}

/** A stored report as the pack reads it, or nothing when this version cannot parse it. */
export function assuranceReportFrom(raw: unknown): AssuranceCampaignReportLike | undefined {
	try {
		return parseCampaignReport(raw) as unknown as AssuranceCampaignReportLike;
	} catch {
		return undefined;
	}
}

export async function reportAssurance(
	storage: Storage,
	registry: PackRegistry,
	agentId?: string,
	options: { now?: () => string } = {}
): Promise<AssuranceRenderings> {
	const id = await resolveAgentId(storage, agentId);
	const pack = await assurancePackFromStorage(id, storage, registry, {
		parseReport: assuranceReportFrom,
		...(options.now ? { now: options.now } : {})
	});
	return {
		pack,
		markdown: renderAssurancePackMarkdown(pack),
		html: renderAssurancePackHtml(pack)
	};
}
