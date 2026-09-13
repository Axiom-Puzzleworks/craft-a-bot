import type { JourneyLayout, JourneyNode, StageRecord } from '@craftabot/core';
import { EXECUTOR_WORD } from '$lib/workshop/pipeline.js';

/**
 * **The Journey Canvas's list twin** (WP100, `87-JOURNEY-CANVAS.md` §6;
 * tenet 29): two tables from the same `JourneyLayout` the canvas draws —
 * one row per stage in journey order, one row per edge — so a reader who
 * cannot see the picture has every fact it carries, and a test can hold
 * the two equal. Pure; `JourneyList.svelte` renders it, and the canvas
 * reads each node's row as its accessible name.
 */
export interface JourneyStageRow {
	stageId: string;
	name: string;
	lane: string;
	executor: string;
	irreversible: boolean;
	obligations: string[];
	/** The points on this node, as `kind` words. */
	guards: string[];
	/** The run's status when lit; absent on an unlit journey or a stage the run never reached. */
	status?: StageRecord['status'] | undefined;
	/** `componentId: verdict` (or `guardrailId: verdict`) per boundary verdict, when lit. */
	verdicts: string[];
	/** The edge the run took out of this stage, as its label or its target. */
	took?: string | undefined;
}

export interface JourneyEdgeRow {
	id: string;
	from: string;
	to: string;
	label: string;
	kind: 'enumerated' | 'case' | 'observed';
	taken: boolean;
}

export interface JourneyTwin {
	stages: JourneyStageRow[];
	edges: JourneyEdgeRow[];
}

export const LANE_WORD: Record<JourneyNode['lane'], string> = {
	counterpart: 'the customer',
	assistant: 'the assistant',
	colleague: 'a colleague',
	rules: 'the rules',
	systems: 'the systems'
};

export const targetWord = (to: JourneyLayout['edges'][number]['to']): string =>
	typeof to === 'string' ? to : 'end' in to ? 'end' : `hand off to ${to.handoff}`;

export function journeyTwin(
	layout: JourneyLayout,
	run?: Pick<{ stages: readonly StageRecord[] }, 'stages'>
): JourneyTwin {
	const statusOf = new Map(run?.stages.map((record) => [record.stageId, record.status]) ?? []);
	const kindOf = new Map(layout.points.map((point) => [point.id, point.kind]));
	const stages = layout.nodes.map((node) => {
		const verdicts = (layout.lit?.verdicts ?? [])
			.filter((verdict) => verdict.pointId.startsWith(`boundary:${node.stageId}:`))
			.map((verdict) => `${verdict.componentId ?? verdict.guardrailId}: ${verdict.verdict}`);
		const takenEdge = layout.edges.find((edge) => edge.from === node.stageId && edge.taken);
		const status = statusOf.get(node.stageId);
		return {
			stageId: node.stageId,
			name: node.name,
			lane: LANE_WORD[node.lane],
			executor: EXECUTOR_WORD[node.executor],
			irreversible: node.irreversible,
			obligations: [...node.obligations],
			guards: node.guards.map((id) => kindOf.get(id) ?? id),
			...(status !== undefined ? { status } : {}),
			verdicts,
			...(takenEdge
				? { took: takenEdge.label === '' ? targetWord(takenEdge.to) : takenEdge.label }
				: {})
		};
	});
	const edges = layout.edges.map((edge) => ({
		id: edge.id,
		from: edge.from,
		to: targetWord(edge.to),
		label: edge.label,
		kind: edge.kind,
		taken: edge.taken === true
	}));
	return { stages, edges };
}

/** A node's row read as one sentence — the canvas's accessible name for it (§5.1). */
export function stageSentence(row: JourneyStageRow): string {
	const parts = [`${row.name} — ${row.lane}, ${row.executor}`];
	if (row.irreversible) parts.push('irreversible');
	if (row.obligations.length > 0) parts.push(row.obligations.join(', '));
	if (row.guards.length > 0) parts.push(`guards ${row.guards.join(', ')}`);
	if (row.status) parts.push(row.status);
	if (row.verdicts.length > 0) parts.push(row.verdicts.join('; '));
	if (row.took) parts.push(`took ${row.took}`);
	return parts.join('; ');
}
