import type { BoundaryMap } from '@craftabot/governance/reports';
import type { BoundaryLayout } from './boundary-layout.js';

/**
 * **The Boundary's list twin** (WP110, `97-ACCESS.md` §1; tenet 29): the
 * same facts as the drawing, as rows — one per outside node, per ring
 * element (the safety bricks, the egress gate, the person, the rules), per
 * inside occupant and per workflow stage — folded from the very layout the
 * drawing reads, so the test can hold them equal. Every row has an id the
 * drawing's focus stop names (`aria-labelledby`), and a sentence a reader
 * hears in its place.
 */
export type BoundaryTwinKind = 'outside' | 'ring' | 'inside' | 'stage';

export interface BoundaryTwinRow {
	/** Stable, and the drawing's stop points at it: `outside:<edge>`, `ring:egress`, `stage:<workflowId>:<stageId>`. */
	id: string;
	kind: BoundaryTwinKind;
	/** The row's head: the node's kind, `egress`, the stage's name. */
	label: string;
	/** The rest of the row: hosts, sends, credential; the mode; the executor and status. */
	detail: string;
	/** A stop the keyboard reaches on the drawing: every outside node and every stage. */
	stop: boolean;
	lit?: boolean | undefined;
	flagged?: boolean | undefined;
	edge?: string | undefined;
	workflowId?: string | undefined;
	stageId?: string | undefined;
}

const hostsOf = (hosts: readonly string[]): string =>
	hosts.length === 0 ? 'local' : hosts.join(', ');

export function boundaryTwin(layout: BoundaryLayout, map: BoundaryMap): BoundaryTwinRow[] {
	const rows: BoundaryTwinRow[] = [];
	for (const node of layout.outside) {
		const parts = [`${node.entry.name} — ${hostsOf(node.entry.hosts)}`];
		if (node.entry.sends.length > 0) parts.push(`sends ${node.entry.sends.join(', ')}`);
		if (node.entry.credential) parts.push(`credential ${node.entry.credential}`);
		if (node.flagged) parts.push('reached a host the run never declared');
		if (node.lit) parts.push('lit');
		rows.push({
			id: `outside:${node.edge}`,
			kind: 'outside',
			label: node.entry.kind,
			detail: parts.join(' · '),
			stop: true,
			lit: node.lit,
			flagged: node.flagged,
			edge: node.edge
		});
	}
	// Keyed by position: a stack may fit the same kind twice (two Monitor Judges with different rubrics).
	for (const [index, brick] of map.boundary.safetyStack.entries()) {
		rows.push({
			id: `ring:safety:${index}:${brick.kindId}`,
			kind: 'ring',
			label: 'safety',
			detail: brick.name,
			stop: false
		});
	}
	rows.push({
		id: 'ring:human',
		kind: 'ring',
		label: 'human',
		detail: `approval ${map.boundary.approval.mode}${map.boundary.approval.autonomy ? ` (${map.boundary.approval.autonomy})` : ''} · ${map.human.approvals} crossed`,
		stop: false
	});
	rows.push({
		id: 'ring:egress',
		kind: 'ring',
		label: 'egress',
		detail: `${map.boundary.egress.mode ?? 'not yet named'} · ${map.boundary.egress.hosts.join(', ') || 'no hosts'}`,
		stop: false
	});
	rows.push({
		id: 'ring:rules',
		kind: 'ring',
		label: 'rules',
		detail: map.boundary.guardrailIds.join(', ') || 'none',
		stop: false
	});
	if (map.inside.world) {
		rows.push({
			id: 'inside:world',
			kind: 'inside',
			label: map.inside.world.view === 'desk' ? 'desk' : 'room',
			detail: map.inside.world.name,
			stop: false
		});
	}
	for (const counterpart of layout.counterparts) {
		rows.push({
			id: `inside:counterpart:${counterpart.agentId}`,
			kind: 'inside',
			label: 'counterpart',
			detail: counterpart.name,
			stop: false
		});
	}
	const workflowName = new Map(
		(map.workflows ?? []).map((workflow) => [workflow.id, workflow.name])
	);
	for (const stage of layout.stages) {
		rows.push({
			id: `stage:${stage.workflowId}:${stage.stageId}`,
			kind: 'stage',
			label: stage.name,
			detail: `${workflowName.get(stage.workflowId) ?? stage.workflowId} · ${stage.executor}${stage.status ? ` · ${stage.status}` : ''}`,
			stop: true,
			lit: stage.status !== undefined,
			workflowId: stage.workflowId,
			stageId: stage.stageId
		});
	}
	return rows;
}

/** What a reader hears at a stop: the row, as one sentence. */
export function twinSentence(row: BoundaryTwinRow): string {
	return `${row.label}: ${row.detail}.`;
}

/** The drawing's stops, in the order the keyboard walks them: the outside nodes around the ring, then the stages ring by ring. */
export function twinStops(rows: readonly BoundaryTwinRow[]): BoundaryTwinRow[] {
	return rows.filter((row) => row.stop);
}
