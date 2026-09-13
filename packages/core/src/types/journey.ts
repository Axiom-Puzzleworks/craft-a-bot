import type { PointKind } from './guardrail-component.js';

/**
 * **The Journey Canvas's layout** (WP100, `87-JOURNEY-CANVAS.md` §3;
 * `83-…` §6.1, decision D12): a journey as a drawing, in data. The fold
 * lives in `@craftabot/workflow` (`journeyLayout`); the type lives here so
 * a package that cannot import the fold — the assurance pack in
 * `governance` — can carry one. No pixels, no colours: a grid of lanes and
 * columns, the edges between stages, the points where a component decides,
 * and — over a run — what was lit.
 */
export type JourneyLaneId = 'counterpart' | 'assistant' | 'colleague' | 'rules' | 'systems';

export interface JourneyLane {
	id: JourneyLaneId;
	label: string;
}

export interface JourneyNode {
	stageId: string;
	name: string;
	lane: JourneyLaneId;
	/** The column, from 0, in journey order. */
	x: number;
	/** The lane's index among the lanes drawn. */
	y: number;
	executor: 'rule' | 'agent' | 'human' | 'line';
	irreversible: boolean;
	obligations: string[];
	/** The ids of this node's points, loop hooks first. */
	guards: string[];
}

export type JourneyEdgeTarget = string | { end: true } | { handoff: string };

export interface JourneyEdge {
	id: string;
	from: string;
	to: JourneyEdgeTarget;
	/** The outcomes that take this edge, joined by ` / `; empty for the one unlabelled outcome; *depends on the case* for a `case` edge; *taken* for an `observed` one. */
	label: string;
	/** `enumerated` from the output's outcomes; `case` when `next` reads the case; `observed` when only the run showed it. */
	kind: 'enumerated' | 'case' | 'observed';
	taken?: boolean;
}

export interface JourneyPoint {
	id: string;
	kind: PointKind;
	/** The stage the point sits on, or the journey-wide place. */
	at: string | 'group' | 'egress';
	components: string[];
}

export interface JourneyVerdict {
	pointId: string;
	guardrailId: string;
	componentId?: string;
	verdict: string;
	tick: number;
}

export interface JourneyLit {
	/** The stage records' ids, in order. */
	path: string[];
	/** The ids of the edges between consecutive stages of the path. */
	edges: string[];
	verdicts: JourneyVerdict[];
}

export interface JourneyLayout {
	schemaVersion: 1;
	workflowId: string;
	name: string;
	lanes: JourneyLane[];
	nodes: JourneyNode[];
	edges: JourneyEdge[];
	points: JourneyPoint[];
	lit?: JourneyLit;
}
