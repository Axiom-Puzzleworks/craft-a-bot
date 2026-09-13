import type {
	Executor,
	JourneyEdge,
	JourneyEdgeTarget,
	JourneyLaneId,
	JourneyLayout,
	JourneyLit,
	JourneyNode,
	JourneyPoint,
	JsonSchema,
	PackRegistry,
	PointKind,
	Stack,
	StageSpec,
	WorkflowConfig,
	WorkflowRun,
	WorkflowSpec,
	WorldState
} from '@craftabot/core';

/**
 * **The Journey Canvas's layout** (WP100, `87-JOURNEY-CANVAS.md` §3;
 * `83-…` §6.1, decision D12): a journey as a drawing, in data — lanes by
 * effective executor, nodes on a grid in journey order, the edges `next`
 * admits for the outcomes the output schema names, the points where a
 * component decides, and what a run lit. Pure and byte-stable: the same
 * spec, configuration and run give the same layout on every platform.
 */
export interface JourneyLayoutOptions {
	/** Where the configuration's stacks are read from; without one only the stage's own guards and the loop's rings are drawn. */
	registry?: Pick<PackRegistry, 'getStack'>;
	/** Draw the counterpart lane even without a run that seats one (§3.1). */
	counterpart?: boolean;
}

const LANE_ORDER: readonly JourneyLaneId[] = [
	'counterpart',
	'assistant',
	'colleague',
	'rules',
	'systems'
];
const LANE_LABELS: Record<JourneyLaneId, string> = {
	counterpart: 'the customer',
	assistant: 'the assistant',
	colleague: 'a colleague',
	rules: 'the rules',
	systems: 'the systems'
};
const LOOP_HOOKS: readonly PointKind[] = ['pre-think', 'pre-act', 'post-act'];
export const CASE_LABEL = 'depends on the case';
export const TAKEN_LABEL = 'taken';
const HANDOFF_PREFIX = 'handoff:';

export function laneOf(kind: Executor['kind']): JourneyLaneId {
	switch (kind) {
		case 'rule':
			return 'rules';
		case 'agent':
			return 'assistant';
		case 'human':
			return 'colleague';
		case 'line':
			return 'systems';
	}
}

/** The outcomes a stage's output admits (§3.3): a person's options, the first enum property's values, or the one unlabelled outcome. */
export function outcomesOf(
	stage: Pick<StageSpec, 'output'>,
	executor: Executor
): Array<{ label: string; value: unknown }> {
	if (executor.kind === 'human') {
		return executor.options.map((option) => ({ label: option, value: { decision: option } }));
	}
	const properties = (stage.output as { properties?: Record<string, JsonSchema> }).properties ?? {};
	for (const [name, schema] of Object.entries(properties)) {
		const values = enumValuesOf(schema);
		// One admitted value (a `const`, a one-value enum) is not a choice: the edge goes unlabelled.
		if (values && values.length > 1)
			return values.map((value) => ({ label: String(value), value: { [name]: value } }));
		if (values) return [{ label: '', value: { [name]: values[0] } }];
	}
	return [{ label: '', value: {} }];
}

function enumValuesOf(schema: JsonSchema): unknown[] | undefined {
	const record = schema as { enum?: unknown[]; const?: unknown };
	if (Array.isArray(record.enum) && record.enum.length > 0) return record.enum;
	if ('const' in record) return [record.const];
	return undefined;
}

/** A state that refuses every read: a `next` that returns without touching it is a function of its outcome alone; one that reads it throws. */
const READS_NOTHING = (): never => {
	throw new Error('the journey layout has no case to read');
};
const FROZEN_STATE = new Proxy(
	{},
	{ get: READS_NOTHING, has: READS_NOTHING, ownKeys: READS_NOTHING }
) as unknown as WorldState;

function targetOf(value: unknown, stageIds: ReadonlySet<string>): JourneyEdgeTarget | undefined {
	// A handoff object (WP102): `next` built an item, which needs the case — so it is enumerable only when it did not read the state.
	if (value !== null && typeof value === 'object' && 'handoff' in value)
		return { handoff: String((value as { handoff: unknown }).handoff) };
	if (typeof value !== 'string') return undefined;
	if (value === 'end') return { end: true };
	if (value.startsWith(HANDOFF_PREFIX)) return { handoff: value.slice(HANDOFF_PREFIX.length) };
	if (stageIds.has(value)) return value;
	throw new Error(`"${value}" names no stage of the journey`);
}

const targetKey = (target: JourneyEdgeTarget): string =>
	typeof target === 'string' ? target : 'end' in target ? 'end' : `handoff:${target.handoff}`;

/** The edges out of one stage (§3.3): enumerated when every outcome's `next` answers without the case; one `case` edge otherwise. */
export function edgesOf(
	spec: Pick<WorkflowSpec, 'stages'>,
	stage: StageSpec,
	executor: Executor
): JourneyEdge[] {
	const stageIds = new Set(spec.stages.map((entry) => entry.id));
	const byTarget = new Map<string, { to: JourneyEdgeTarget; labels: string[] }>();
	let enumerable = true;
	for (const outcome of outcomesOf(stage, executor)) {
		let target: JourneyEdgeTarget | undefined;
		try {
			target = targetOf(stage.next(outcome.value, FROZEN_STATE, {}), stageIds);
		} catch (error) {
			if (error instanceof Error && /names no stage/.test(error.message)) throw error;
			target = undefined;
		}
		if (target === undefined) {
			enumerable = false;
			break;
		}
		const key = targetKey(target);
		const entry = byTarget.get(key) ?? { to: target, labels: [] };
		entry.labels.push(outcome.label);
		byTarget.set(key, entry);
	}
	if (!enumerable) {
		const index = spec.stages.findIndex((entry) => entry.id === stage.id);
		const following = spec.stages[index + 1];
		const to: JourneyEdgeTarget = following ? following.id : { end: true };
		return [
			{ id: `${stage.id}->${targetKey(to)}`, from: stage.id, to, label: CASE_LABEL, kind: 'case' }
		];
	}
	return [...byTarget.values()].map((entry) => ({
		id: `${stage.id}->${targetKey(entry.to)}`,
		from: stage.id,
		to: entry.to,
		label: entry.labels.filter((label) => label !== '').join(' / '),
		kind: 'enumerated' as const
	}));
}

function stacksFor(
	config: WorkflowConfig | undefined,
	stageId: string,
	registry: JourneyLayoutOptions['registry']
): Stack[] {
	if (!registry) return [];
	const ids = [config?.stack, config?.stageStacks?.[stageId]].filter(
		(id): id is string => id !== undefined
	);
	return ids.map((id) => {
		const stack = registry.getStack(id);
		if (!stack) throw new Error(`no stack '${id}' is registered`);
		return stack;
	});
}

const unique = (values: readonly string[]): string[] => [...new Set(values)];

/** The points of one stage (§3.4): the loop's rings on an assistant node; a boundary gate where a stage or a stack puts one. */
function pointsOf(stage: StageSpec, executor: Executor, stacks: readonly Stack[]): JourneyPoint[] {
	const points: JourneyPoint[] = [];
	if (executor.kind === 'agent') {
		for (const kind of LOOP_HOOKS) {
			points.push({
				id: `loop:${stage.id}:${kind}`,
				kind,
				at: stage.id,
				components: unique(
					stacks.flatMap((stack) =>
						stack.fit.filter((fit) => fit.point.kind === kind).map((fit) => fit.componentId)
					)
				)
			});
		}
	}
	for (const point of ['stage-in', 'stage-out'] as const) {
		const components = unique([
			...(point === 'stage-in' ? (stage.guards?.policyCards ?? []) : []),
			...(stage.guards?.components ?? [])
				.filter((component) => component.point === point)
				.map((component) => component.id),
			...stacks.flatMap((stack) =>
				stack.fit
					.filter(
						(fit) =>
							fit.point.kind === point && (fit.point.at === undefined || fit.point.at === stage.id)
					)
					.map((fit) => fit.componentId)
			)
		]);
		if (components.length > 0)
			points.push({ id: `boundary:${stage.id}:${point}`, kind: point, at: stage.id, components });
	}
	return points;
}

function journeyOrder(
	spec: WorkflowSpec,
	edgesByStage: ReadonlyMap<string, JourneyEdge[]>
): string[] {
	const order: string[] = [];
	const seen = new Set<string>();
	const queue = [spec.first];
	while (queue.length > 0) {
		const id = queue.shift() as string;
		if (seen.has(id)) continue;
		seen.add(id);
		order.push(id);
		for (const edge of edgesByStage.get(id) ?? []) {
			if (typeof edge.to === 'string' && !seen.has(edge.to)) queue.push(edge.to);
		}
	}
	for (const stage of spec.stages) if (!seen.has(stage.id)) order.push(stage.id);
	return order;
}

/** The layout (§3). Throws when a `next` names a stage that does not exist or a configuration names a stack the registry lacks. */
export function journeyLayout(
	spec: WorkflowSpec,
	config?: WorkflowConfig,
	run?: Pick<WorkflowRun, 'stages' | 'events'> & { handoff?: WorkflowRun['handoff'] },
	options: JourneyLayoutOptions = {}
): JourneyLayout {
	const recordOf = new Map(run?.stages.map((record) => [record.stageId, record]) ?? []);
	const executorOf = (stage: StageSpec): Executor => {
		const record = recordOf.get(stage.id)?.executor;
		if (record) return record as Executor;
		return config?.executors?.[stage.id] ?? stage.executor;
	};
	const edgesByStage = new Map(
		spec.stages.map((stage) => [stage.id, edgesOf(spec, stage, executorOf(stage))])
	);
	const order = journeyOrder(spec, edgesByStage);
	const stageById = new Map(spec.stages.map((stage) => [stage.id, stage]));

	const seated =
		options.counterpart === true ||
		(run?.events ?? []).some(
			(event) =>
				event.type === 'group.started' &&
				Object.values(event.payload.memberRoles ?? {}).includes('counterpart')
		);
	const lanesInUse = new Set<JourneyLaneId>(
		spec.stages.map((stage) => laneOf(executorOf(stage).kind))
	);
	if (seated) lanesInUse.add('counterpart');
	const lanes = LANE_ORDER.filter((id) => lanesInUse.has(id)).map((id) => ({
		id,
		label: LANE_LABELS[id]
	}));
	const laneIndex = new Map(lanes.map((lane, index) => [lane.id, index]));

	const points: JourneyPoint[] = [];
	const journeyStacks = stacksFor(config, '', options.registry);
	const nodes: JourneyNode[] = order.map((stageId, column) => {
		const stage = stageById.get(stageId) as StageSpec;
		const executor = executorOf(stage);
		const own = pointsOf(stage, executor, stacksFor(config, stage.id, options.registry));
		points.push(...own);
		const lane = laneOf(executor.kind);
		return {
			stageId,
			name: stage.name,
			lane,
			x: column,
			y: laneIndex.get(lane) as number,
			executor: executor.kind,
			irreversible: stage.irreversible === true,
			obligations: [...(stage.obligations ?? [])],
			guards: own.map((point) => point.id)
		};
	});
	const group = journeyStacks.find((stack) => stack.group);
	if (group?.group) {
		points.push({
			id: 'group',
			kind: 'group',
			at: 'group',
			components: unique(group.group.breakOn.map((entry) => `evaluator:${entry.evaluatorId}`))
		});
	}
	const egress = unique(
		journeyStacks.flatMap((stack) =>
			stack.fit.filter((fit) => fit.point.kind === 'egress').map((fit) => fit.componentId)
		)
	);
	if (egress.length > 0)
		points.push({ id: 'egress', kind: 'egress', at: 'egress', components: egress });

	const edges = order.flatMap((stageId) => edgesByStage.get(stageId) ?? []);
	const layout: JourneyLayout = {
		schemaVersion: 1,
		workflowId: spec.id,
		name: spec.name,
		lanes,
		nodes,
		edges,
		points
	};
	if (run) layout.lit = lightUp(layout, run);
	return layout;
}

/** The lit run (§3.5): the path, the edges between its stages (added as `observed` where the enumeration had none), the boundary verdicts on their points. */
function lightUp(
	layout: JourneyLayout,
	run: Pick<WorkflowRun, 'stages' | 'events'> & { handoff?: WorkflowRun['handoff'] }
): JourneyLit {
	const path = run.stages.map((record) => record.stageId);
	const litEdges: string[] = [];
	for (let index = 0; index < path.length; index += 1) {
		const from = path[index] as string;
		const next = path[index + 1];
		// The last stage's exit: the handoff the run made (WP102), else the end.
		const exit: JourneyEdgeTarget = run.handoff ? { handoff: run.handoff.to } : { end: true };
		const to: JourneyEdgeTarget = next === undefined ? exit : next;
		const id = `${from}->${targetKey(to)}`;
		let edge = layout.edges.find((entry) => entry.id === id);
		if (!edge) {
			edge = { id, from, to, label: TAKEN_LABEL, kind: 'observed' };
			layout.edges.push(edge);
		}
		edge.taken = true;
		litEdges.push(id);
	}
	const verdicts: JourneyLit['verdicts'] = run.stages.flatMap((record) =>
		(record.guards.verdicts ?? []).map((verdict) => ({
			pointId: `boundary:${record.stageId}:${verdict.point}`,
			guardrailId: verdict.guardrailId,
			...(verdict.componentId !== undefined ? { componentId: verdict.componentId } : {}),
			verdict: verdict.verdict,
			tick: record.endedTick
		}))
	);
	return { path, edges: litEdges, verdicts };
}

// ── The geometry (§4) ────────────────────────────────────────────────────

export const JOURNEY_METRICS = {
	marginLeft: 128,
	marginRight: 56,
	marginTop: 16,
	marginBottom: 16,
	laneHeight: 100,
	columnWidth: 150,
	nodeRadius: 22,
	pointRadius: 5,
	gate: 10
} as const;

export interface JourneyGeometry {
	width: number;
	height: number;
	lanes: Array<{
		id: JourneyLaneId;
		label: string;
		x: number;
		y: number;
		width: number;
		height: number;
	}>;
	nodes: Array<{
		stageId: string;
		cx: number;
		cy: number;
		r: number;
		labelX: number;
		labelY: number;
	}>;
	edges: Array<{
		id: string;
		path: string;
		label: string;
		labelX: number;
		labelY: number;
		anchor: 'start' | 'middle';
	}>;
	points: Array<{
		id: string;
		kind: PointKind;
		cx: number;
		cy: number;
		shape: 'ring' | 'gate' | 'bar';
		height: number;
	}>;
	end?: { x: number; y1: number; y2: number };
}

/** Where each thing sits on the page (§4): integer arithmetic over `JOURNEY_METRICS`, so the geometry is byte-stable. */
export function journeyGeometry(layout: JourneyLayout): JourneyGeometry {
	const m = JOURNEY_METRICS;
	const columns = layout.nodes.reduce((max, node) => Math.max(max, node.x + 1), 0);
	const hasEnd = layout.edges.some((edge) => typeof edge.to !== 'string' && 'end' in edge.to);
	const width = m.marginLeft + (columns + (hasEnd ? 1 : 0)) * m.columnWidth + m.marginRight;
	const height = m.marginTop + Math.max(layout.lanes.length, 1) * m.laneHeight + m.marginBottom;
	const laneY = (index: number) => m.marginTop + index * m.laneHeight;
	const lanes = layout.lanes.map((lane, index) => ({
		id: lane.id,
		label: lane.label,
		x: 0,
		y: laneY(index),
		width,
		height: m.laneHeight
	}));
	const centre = (node: JourneyNode) => ({
		cx: m.marginLeft + node.x * m.columnWidth + Math.floor(m.columnWidth / 2),
		cy: laneY(node.y) + Math.floor(m.laneHeight / 2)
	});
	const nodeAt = new Map(layout.nodes.map((node) => [node.stageId, node]));
	const nodes = layout.nodes.map((node) => {
		const { cx, cy } = centre(node);
		return {
			stageId: node.stageId,
			cx,
			cy,
			r: m.nodeRadius,
			labelX: cx,
			labelY: cy + m.nodeRadius + 14
		};
	});
	const end = hasEnd
		? {
				x: m.marginLeft + columns * m.columnWidth + Math.floor(m.columnWidth / 2),
				y1: m.marginTop + 8,
				y2: m.marginTop + Math.max(layout.lanes.length, 1) * m.laneHeight - 8
			}
		: undefined;
	const r = m.nodeRadius;
	const edges = layout.edges.map((edge) => {
		const from = nodeAt.get(edge.from) as JourneyNode;
		const s = centre(from);
		const gx = s.cx + Math.floor(m.columnWidth / 2);
		if (typeof edge.to !== 'string') {
			if ('end' in edge.to) {
				const endX = (end as { x: number }).x;
				const direct = from.x === columns - 1;
				const top = laneY(from.y) + 12;
				const path = direct
					? `M${s.cx + r} ${s.cy} H${endX - 4}`
					: `M${s.cx + r} ${s.cy} H${gx} V${top} H${endX - 4}`;
				return {
					id: edge.id,
					path,
					label: edge.label,
					labelX: direct ? Math.floor((s.cx + r + endX) / 2) : gx + 6,
					labelY: direct ? s.cy - 8 : top - 4,
					anchor: direct ? ('middle' as const) : ('start' as const)
				};
			}
			// A handoff: out of the page at the right, labelled with the journey it goes to.
			return {
				id: edge.id,
				path: `M${s.cx + r} ${s.cy} H${width - 8}`,
				label: edge.label === '' ? `to ${edge.to.handoff}` : `${edge.label} → ${edge.to.handoff}`,
				labelX: gx,
				labelY: s.cy - 8,
				anchor: 'start' as const
			};
		}
		const to = nodeAt.get(edge.to) as JourneyNode;
		const t = centre(to);
		if (to.x === from.x + 1) {
			const path =
				t.cy === s.cy
					? `M${s.cx + r} ${s.cy} H${t.cx - r}`
					: `M${s.cx + r} ${s.cy} H${gx} V${t.cy} H${t.cx - r}`;
			return {
				id: edge.id,
				path,
				label: edge.label,
				labelX: t.cy === s.cy ? Math.floor((s.cx + t.cx) / 2) : gx + 6,
				labelY: t.cy === s.cy ? s.cy - 8 : Math.floor((s.cy + t.cy) / 2) - 4,
				anchor: t.cy === s.cy ? ('middle' as const) : ('start' as const)
			};
		}
		if (to.x > from.x) {
			// A long edge runs along the top of the target's lane and drops into the node.
			const top = laneY(to.y) + 12;
			return {
				id: edge.id,
				path: `M${s.cx + r} ${s.cy} H${gx} V${top} H${t.cx} V${t.cy - r}`,
				label: edge.label,
				labelX: gx + 6,
				labelY: top - 4,
				anchor: 'start' as const
			};
		}
		// A return runs along the bottom of the source's lane and climbs into the target.
		const bottom = laneY(from.y) + m.laneHeight - 12;
		return {
			id: edge.id,
			path: `M${s.cx} ${s.cy + r} V${bottom} H${t.cx} V${t.cy + r}`,
			label: edge.label,
			labelX: Math.floor((s.cx + t.cx) / 2),
			labelY: bottom + 12,
			anchor: 'middle' as const
		};
	});
	const laneIndex = new Map(layout.lanes.map((lane, index) => [lane.id, index]));
	const points = layout.points.map((point) => {
		if (point.at === 'group') {
			const first = 0;
			const last = laneIndex.get('assistant') ?? 0;
			return {
				id: point.id,
				kind: point.kind,
				cx: m.marginLeft - 24,
				cy: laneY(first) + 8,
				shape: 'bar' as const,
				height: laneY(last) + m.laneHeight - 8 - (laneY(first) + 8)
			};
		}
		if (point.at === 'egress') {
			const index = laneIndex.get('systems') ?? Math.max(layout.lanes.length - 1, 0);
			return {
				id: point.id,
				kind: point.kind,
				cx: width - Math.floor(m.marginRight / 2),
				cy: laneY(index) + Math.floor(m.laneHeight / 2),
				shape: 'gate' as const,
				height: m.gate
			};
		}
		const node = nodeAt.get(point.at) as JourneyNode;
		const { cx, cy } = centre(node);
		if (point.kind === 'stage-in')
			return {
				id: point.id,
				kind: point.kind,
				cx: cx - r - 12,
				cy,
				shape: 'gate' as const,
				height: m.gate
			};
		if (point.kind === 'stage-out')
			return {
				id: point.id,
				kind: point.kind,
				cx: cx + r + 12,
				cy,
				shape: 'gate' as const,
				height: m.gate
			};
		const slot = LOOP_HOOKS.indexOf(point.kind);
		return {
			id: point.id,
			kind: point.kind,
			cx: cx + (slot - 1) * 14,
			cy: cy - r - 10,
			shape: 'ring' as const,
			height: m.pointRadius * 2
		};
	});
	return { width, height, lanes, nodes, edges, points, ...(end ? { end } : {}) };
}

// ── The SVG (§4) ─────────────────────────────────────────────────────────

const escapeXml = (text: string): string =>
	text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The sentence the drawing reads as (§4): every node with its lane, every edge with its label. */
export function journeySentence(layout: JourneyLayout): string {
	const nodes = layout.nodes.map((node) => `${node.name} (${LANE_LABELS[node.lane]})`).join(', ');
	const edges = layout.edges
		.map(
			(edge) =>
				`${edge.from} to ${targetKey(edge.to)}${edge.label === '' ? '' : ` on ${edge.label}`}${edge.taken ? ', taken' : ''}`
		)
		.join('; ');
	const lit = layout.lit ? ` The run took ${layout.lit.path.join(', ')}.` : '';
	return `${layout.name}: ${nodes}. Edges: ${edges || 'none'}.${lit}`;
}

/** One `<svg>` — monochrome, `currentColor`, class names only — the export, the pack and the manual share (§4). */
export function renderJourneySvg(layout: JourneyLayout): string {
	const g = journeyGeometry(layout);
	const litNodes = new Set(layout.lit?.path ?? []);
	const out: string[] = [];
	out.push(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${g.width} ${g.height}" width="${g.width}" height="${g.height}" role="img" aria-labelledby="journey-title" font-family="system-ui, sans-serif" font-size="11" fill="currentColor" stroke="currentColor">`
	);
	out.push(`<title id="journey-title">${escapeXml(journeySentence(layout))}</title>`);
	out.push(
		`<style>.lane{fill:none;stroke-opacity:.35}.lane-label{stroke:none;font-weight:700}.edge{fill:none;stroke-width:1.5}.edge--case{stroke-dasharray:4 3}.edge--taken{stroke-width:3}.edge-label{stroke:none}.node{fill:none;stroke-width:1.5}.node--lit{stroke-width:3}.node--irreversible{stroke-dasharray:2 2}.node-label{stroke:none;text-anchor:middle}.point{fill:none;stroke-width:1.5}.end{stroke-width:3}</style>`
	);
	for (const lane of g.lanes) {
		out.push(
			`<rect class="lane lane--${lane.id}" x="${lane.x}" y="${lane.y}" width="${lane.width}" height="${lane.height}"/>`
		);
		out.push(`<text class="lane-label" x="8" y="${lane.y + 16}">${escapeXml(lane.label)}</text>`);
	}
	for (const edge of g.edges) {
		const kind = layout.edges.find((entry) => entry.id === edge.id) as JourneyEdge;
		const classes = ['edge', `edge--${kind.kind}`, ...(kind.taken ? ['edge--taken'] : [])].join(
			' '
		);
		out.push(`<path class="${classes}" d="${edge.path}" data-edge="${escapeXml(edge.id)}"/>`);
		if (edge.label !== '')
			out.push(
				`<text class="edge-label" x="${edge.labelX}" y="${edge.labelY}" text-anchor="${edge.anchor}">${escapeXml(edge.label)}</text>`
			);
	}
	if (g.end)
		out.push(
			`<line class="end" x1="${g.end.x}" y1="${g.end.y1}" x2="${g.end.x}" y2="${g.end.y2}"/>`
		);
	for (const node of g.nodes) {
		const spec = layout.nodes.find((entry) => entry.stageId === node.stageId) as JourneyNode;
		const classes = [
			'node',
			`node--${spec.executor}`,
			...(litNodes.has(node.stageId) ? ['node--lit'] : []),
			...(spec.irreversible ? ['node--irreversible'] : [])
		].join(' ');
		out.push(
			`<circle class="${classes}" cx="${node.cx}" cy="${node.cy}" r="${node.r}" data-stage="${escapeXml(node.stageId)}"/>`
		);
		out.push(
			`<text class="node-label" x="${node.labelX}" y="${node.labelY}">${escapeXml(spec.name)}</text>`
		);
	}
	for (const point of g.points) {
		if (point.shape === 'ring')
			out.push(
				`<circle class="point point--${point.kind}" cx="${point.cx}" cy="${point.cy}" r="${JOURNEY_METRICS.pointRadius}" data-point="${escapeXml(point.id)}"/>`
			);
		else if (point.shape === 'gate')
			out.push(
				`<rect class="point point--${point.kind}" x="${point.cx - Math.floor(point.height / 2)}" y="${point.cy - Math.floor(point.height / 2)}" width="${point.height}" height="${point.height}" data-point="${escapeXml(point.id)}"/>`
			);
		else
			out.push(
				`<rect class="point point--${point.kind}" x="${point.cx - 3}" y="${point.cy}" width="6" height="${point.height}" data-point="${escapeXml(point.id)}"/>`
			);
	}
	out.push('</svg>');
	return out.join('\n') + '\n';
}
