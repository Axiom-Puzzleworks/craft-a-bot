import type {
	ExperimentResult,
	RunRecord,
	StoredCampaignReport,
	StoredWorkflowRun
} from '@craftabot/core';

/**
 * **Linked from** (WP109, `96-CONTROL-ROOM-V3.md` §2.4; `83-…` §6.7.1's
 * cross-links): what links to an artefact, folded from the store's own
 * lists — a run's campaign cell, workflow stage and forks; a campaign
 * report's experiments and the workflow runs it sourced; a workflow run's
 * handoffs and forks; a stack's reports and experiments. Pure; every
 * artefact page calls it with what it already loads, and renders the
 * result with every id a link (`LinkedFrom.svelte`).
 */
export type ArtefactKind =
	'run' | 'campaign-report' | 'workflow-run' | 'experiment-result' | 'stack';

export interface Referrer {
	kind: ArtefactKind;
	id: string;
	title: string;
	/** A path without the base. */
	href: string;
	/** How it links: `cell seed 3, build bot-a`, `stage decision`, `handoff from`, `forked at tick 4`. */
	via: string;
}

export interface ReferrerStore {
	runs?: readonly RunRecord[] | undefined;
	reports?: readonly StoredCampaignReport[] | undefined;
	workflowRuns?: readonly StoredWorkflowRun[] | undefined;
	experiments?: readonly ExperimentResult[] | undefined;
}

interface ReportCell {
	runId?: string;
	seed?: number;
	build?: string;
	guard?: string;
	brain?: string;
}
interface ReportBody {
	cells?: ReportCell[];
	guards?: { id?: string; stack?: string }[];
	builds?: { id?: string; stack?: string }[];
}

const cellsOf = (report: StoredCampaignReport): ReportCell[] =>
	((report.report as ReportBody).cells ?? []).filter((cell) => typeof cell === 'object');

export function referrersOf(
	target: { kind: ArtefactKind; id: string },
	store: ReferrerStore
): Referrer[] {
	const out: Referrer[] = [];
	const reports = store.reports ?? [];
	const workflowRuns = store.workflowRuns ?? [];
	const experiments = store.experiments ?? [];
	const runs = store.runs ?? [];

	switch (target.kind) {
		case 'run': {
			for (const report of reports) {
				for (const cell of cellsOf(report)) {
					if (cell.runId !== target.id) continue;
					out.push({
						kind: 'campaign-report',
						id: report.id,
						title: report.title,
						href: `/workshop/campaigns?report=${encodeURIComponent(report.id)}`,
						via: `cell${cell.seed !== undefined ? ` seed ${cell.seed}` : ''}${cell.build ? `, build ${cell.build}` : ''}${cell.guard ? `, guard ${cell.guard}` : ''}`
					});
				}
			}
			for (const stored of workflowRuns) {
				const stage = stored.run.stages.find((record) => record.runId === target.id);
				if (stage || stored.run.runIds.includes(target.id)) {
					out.push({
						kind: 'workflow-run',
						id: stored.run.id,
						title: stored.run.workflowId,
						href: `/workshop/workflows/${stored.run.id}`,
						via: stage ? `stage ${stage.stageId}` : 'an agent run of the journey'
					});
				}
			}
			for (const run of runs) {
				const fork = run.forkedFrom;
				if (fork?.runId === target.id) {
					out.push({
						kind: 'run',
						id: run.id,
						title: `${run.agentName} — ${run.goalCardId}`,
						href: `/workshop/runs/${run.id}`,
						via: `forked at tick ${fork.tick}`
					});
				}
			}
			for (const result of experiments) {
				const effect = result.effects.find((entry) => entry.runIds.includes(target.id));
				if (effect) {
					out.push({
						kind: 'experiment-result',
						id: result.id,
						title: result.title,
						href: `/workshop/experiments?result=${encodeURIComponent(result.id)}`,
						via: `effect ${effect.metricId}`
					});
				}
			}
			break;
		}
		case 'campaign-report': {
			for (const result of experiments) {
				const effect = result.effects.find((entry) => entry.reportIds.includes(target.id));
				if (effect) {
					out.push({
						kind: 'experiment-result',
						id: result.id,
						title: result.title,
						href: `/workshop/experiments?result=${encodeURIComponent(result.id)}`,
						via: `effect ${effect.metricId}`
					});
				}
			}
			for (const stored of workflowRuns) {
				if (stored.source?.kind === 'campaign' && stored.source.id === target.id) {
					out.push({
						kind: 'workflow-run',
						id: stored.run.id,
						title: stored.run.workflowId,
						href: `/workshop/workflows/${stored.run.id}`,
						via: `sourced by the campaign${stored.source.build ? `, build ${stored.source.build}` : ''}`
					});
				}
			}
			break;
		}
		case 'workflow-run': {
			for (const stored of workflowRuns) {
				for (const link of stored.run.handoffs ?? []) {
					if (link.runId === target.id) {
						out.push({
							kind: 'workflow-run',
							id: stored.run.id,
							title: stored.run.workflowId,
							href: `/workshop/workflows/${stored.run.id}`,
							via: `handed off from ${link.workflowId}, item ${link.itemId}`
						});
					}
				}
				if (stored.forkedFrom?.runId === target.id) {
					out.push({
						kind: 'workflow-run',
						id: stored.run.id,
						title: stored.run.workflowId,
						href: `/workshop/workflows/${stored.run.id}`,
						via: `forked at stage ${stored.forkedFrom.stageId}`
					});
				}
			}
			break;
		}
		case 'stack': {
			for (const report of reports) {
				const body = report.report as ReportBody;
				const guard = (body.guards ?? []).find((entry) => entry.stack === target.id);
				if (guard) {
					out.push({
						kind: 'campaign-report',
						id: report.id,
						title: report.title,
						href: `/workshop/campaigns?report=${encodeURIComponent(report.id)}`,
						via: `guard ${guard.id ?? target.id}`
					});
				}
			}
			break;
		}
		case 'experiment-result':
			break;
	}
	return out;
}
