import type {
	BoundaryMap,
	BoundaryOutside,
	BoundaryWorkflowStage
} from '@craftabot/governance/reports';

/**
 * **The Boundary's layout** (WP86, `77-PIPELINE-AND-BOUNDARY.md` §5; UX-7):
 * a force-free radial layout with collision resolution. Every node sits on
 * a radius by kind — the chassis at the centre, the world and the
 * counterparts inside the ring, the workflow's stages on a second ring
 * outside it, the outside nodes fanned by kind on the outer radius, grown
 * when the outer nodes would not fit their circumference — and every label
 * is placed beside its anchor, then tested against every label placed
 * before it; a label that would overlap is pushed outward along its own
 * angle in steps and leader-lined back to its anchor. Pure, so the test can
 * assert the invariant the component draws: no two labels overlap.
 */
export interface Point {
	x: number;
	y: number;
}

export interface PlacedLabel {
	id: string;
	kind: 'node' | 'host' | 'counterpart' | 'stage' | 'ring' | 'gate' | 'human' | 'world' | 'agent';
	lines: string[];
	/** Where the label is drawn (its baseline start when anchored start/end, its centre when middle). */
	x: number;
	y: number;
	/** What the label names — the leader line's far end when it moved. */
	anchor: Point;
	/** How the text is anchored at (x, y) — the same rule the box was measured with. */
	align: 'start' | 'middle' | 'end';
	moved: boolean;
	/** The label's bounding box in the SVG's coordinates, for the collision test. */
	box: { x: number; y: number; width: number; height: number };
}

export interface PlacedOutside {
	entry: BoundaryOutside;
	edge: string;
	at: Point;
	ring: Point;
	width: number;
	height: number;
	lit: boolean;
	flagged: boolean;
}

export interface PlacedStage {
	id: string;
	workflowId: string;
	stageId: string;
	name: string;
	executor: BoundaryWorkflowStage['executor'];
	status?: BoundaryWorkflowStage['status'] | undefined;
	at: Point;
}

export interface BoundaryLayout {
	width: number;
	height: number;
	centre: Point;
	ring: number;
	inside: number;
	gate: Point;
	human: Point;
	world: Point;
	counterparts: Array<{ agentId: string; name: string; at: Point }>;
	rings: Array<{ workflowId: string; radius: number }>;
	stages: PlacedStage[];
	outside: PlacedOutside[];
	labels: PlacedLabel[];
}

/** Where each kind lives around the ring, in degrees (0 = right, 90 = up). */
const ANGLE: Record<BoundaryOutside['kind'], number> = {
	provider: 90,
	'guard-service': 20,
	pdp: -10,
	evaluator: -50,
	sink: -90,
	'evidence-store': -130,
	'service-line': 180
};

const LABEL_LINE_HEIGHT = 12;
/** An uppercase 10px label at 0.06em tracking is about 6.4px a character; a mono host line 5.8px. */
const CHAR_WIDTH = { node: 7, host: 6.2, stage: 6.6 } as const;

export const polar = (centre: Point, deg: number, r: number): Point => ({
	x: centre.x + r * Math.cos((deg * Math.PI) / 180),
	y: centre.y - r * Math.sin((deg * Math.PI) / 180)
});

const overlaps = (a: PlacedLabel['box'], b: PlacedLabel['box'], gap = 2): boolean =>
	a.x < b.x + b.width + gap &&
	b.x < a.x + a.width + gap &&
	a.y < b.y + b.height + gap &&
	b.y < a.y + a.height + gap;

/** Wrap a label at about `max` characters on a word boundary, so a long name spans lines rather than the map. */
function wrap(text: string, max: number): string[] {
	if (text.length <= max) return [text];
	const words = text.split(' ');
	const lines: string[] = [];
	let current = '';
	for (const word of words) {
		if (current !== '' && current.length + 1 + word.length > max) {
			lines.push(current);
			current = word;
		} else current = current === '' ? word : `${current} ${word}`;
	}
	if (current !== '') lines.push(current);
	return lines;
}

export function layoutBoundary(map: BoundaryMap, lit: ReadonlySet<string>): BoundaryLayout {
	const RING = 128;
	const INSIDE = 104;
	const workflows = map.workflows ?? [];
	// One workflow ring per workflow, 30px apart, from just outside the boundary.
	const rings = workflows.map((workflow, index) => ({
		workflowId: workflow.id,
		radius: RING + 36 + index * 30
	}));
	const lastRing = rings.at(-1)?.radius ?? RING;

	// Outside nodes: fanned by kind, siblings 22° apart, on a radius that fits their boxes around the circle.
	const byKind: Array<[BoundaryOutside['kind'], BoundaryOutside[]]> = [];
	for (const entry of map.outside) {
		const found = byKind.find(([kind]) => kind === entry.kind);
		if (found) found[1].push(entry);
		else byKind.push([entry.kind, [entry]]);
	}
	// A node's box: its name wrapped to the box's width, its hosts beneath, the height following the lines.
	const NODE_CHARS = 26;
	const nameLinesOf = (entry: BoundaryOutside) => wrap(`${entry.kind} · ${entry.name}`, NODE_CHARS);
	const hostLinesOf = (entry: BoundaryOutside) => wrap(hostsOf(entry), 30);
	const widthOf = (entry: BoundaryOutside) =>
		Math.max(
			120,
			Math.max(
				...nameLinesOf(entry).map((line) => line.length * CHAR_WIDTH.node),
				...hostLinesOf(entry).map((line) => line.length * CHAR_WIDTH.host)
			) + 16
		);
	const heightOf = (entry: BoundaryOutside) =>
		LABEL_LINE_HEIGHT * (nameLinesOf(entry).length + hostLinesOf(entry).length) + 16;
	const totalWidth = map.outside.reduce((sum, entry) => sum + widthOf(entry) + 12, 0);
	// The outer radius: far enough out that the widest box fits the chord between neighbours, and past every ring.
	const widest = Math.max(0, ...map.outside.map(widthOf));
	const chordRadius =
		map.outside.length >= 2 ? widest / (2 * Math.sin(Math.PI / map.outside.length)) + 12 : 0;
	const OUTER = Math.max(lastRing + 70, 226, (totalWidth * 1.15) / (2 * Math.PI), chordRadius);
	const centre: Point = { x: Math.max(380, OUTER + 154), y: Math.max(260, OUTER + 34) };
	const width = centre.x * 2;
	const height = centre.y * 2;

	const edgeFor = (entry: BoundaryOutside): string =>
		entry.kind === 'provider' ? 'provider' : `${entry.kind}:${entry.id}`;

	// Every outside node evenly around the circle, in kind order from the top clockwise: the kinds keep
	// their order (provider first, the lines last) and the spacing is what fits the outer circumference.
	const ordered = byKind
		.slice()
		.sort(([a], [b]) => ANGLE[b] - ANGLE[a])
		.flatMap(([, list]) => list);
	const outside: PlacedOutside[] = ordered.map((entry, index) => {
		const deg = 90 - (index / Math.max(1, ordered.length)) * 360;
		const edge = edgeFor(entry);
		return {
			entry,
			edge,
			at: polar(centre, deg, OUTER),
			ring: polar(centre, deg, RING),
			width: widthOf(entry),
			height: heightOf(entry),
			lit: lit.has(edge),
			flagged: (map.activity ?? []).some((a) => a.edge === edge && a.verdict === 'outside-egress')
		};
	});

	const human = polar(centre, 225, RING);
	const gate = polar(centre, -30, RING);
	const world: Point = { x: centre.x, y: centre.y + 62 };
	const counterparts = map.inside.counterparts.map((c, index) => ({
		agentId: c.agentId,
		name: c.name,
		at: { x: centre.x + 70 + index * 10, y: centre.y + 30 + index * 26 }
	}));

	// The stages: each workflow's in order around its ring, from the top, clockwise.
	const stages: PlacedStage[] = [];
	workflows.forEach((workflow, ringIndex) => {
		const radius = rings[ringIndex]?.radius ?? RING + 36;
		const count = Math.max(1, workflow.stages.length);
		workflow.stages.forEach((stage, index) => {
			const deg = 90 - (index / count) * 360;
			stages.push({
				id: `${workflow.id}:${stage.id}`,
				workflowId: workflow.id,
				stageId: stage.id,
				name: stage.name,
				executor: stage.executor,
				status: stage.status,
				at: polar(centre, deg, radius)
			});
		});
	});

	// ── Labels, with collision resolution ─────────────────────────────────
	const labels: PlacedLabel[] = [];
	const boxes: Array<PlacedLabel['box']> = [
		// The chassis and the ring itself are obstacles too.
		{ x: centre.x - 34, y: centre.y - 76, width: 68, height: 86 },
		...outside.map((node) => ({
			x: node.at.x - node.width / 2,
			y: node.at.y - node.height / 2,
			width: node.width,
			height: node.height
		})),
		// The actor's glyph is drawn 10px high on the stage's mark: keep a 26px box clear of it.
		...stages.map((stage) => ({ x: stage.at.x - 13, y: stage.at.y - 13, width: 26, height: 26 }))
	];
	const place = (
		id: string,
		kind: PlacedLabel['kind'],
		lines: string[],
		anchor: Point,
		deg: number,
		start: Point,
		charWidth: number,
		options: { fixed?: boolean; middle?: boolean } = {}
	) => {
		const widest = Math.max(...lines.map((line) => line.length)) * charWidth;
		const height = lines.length * LABEL_LINE_HEIGHT;
		let at = start;
		let moved = false;
		for (let step = 0; step <= 8; step += 1) {
			const middle = options.middle ?? Math.abs(Math.cos((deg * Math.PI) / 180)) < 0.5;
			const anchored = middle ? 'middle' : Math.cos((deg * Math.PI) / 180) < 0 ? 'end' : 'start';
			const x =
				anchored === 'middle' ? at.x - widest / 2 : anchored === 'end' ? at.x - widest : at.x;
			const box = { x, y: at.y - 9, width: widest, height };
			const clash = boxes.some((other) => overlaps(box, other));
			if (!clash || options.fixed || step === 8) {
				const label: PlacedLabel = {
					id,
					kind,
					lines,
					x: at.x,
					y: at.y,
					anchor,
					align: anchored,
					moved,
					box
				};
				labels.push(label);
				boxes.push(box);
				return;
			}
			// Push outward along the label's own angle from the centre, and leader-line it.
			const r = Math.hypot(at.x - centre.x, at.y - centre.y) + 16;
			at = polar(centre, deg, r);
			moved = true;
		}
	};
	const degOf = (p: Point) => (Math.atan2(centre.y - p.y, p.x - centre.x) * 180) / Math.PI;

	// Fixed labels first: the agent's name, the world, the counterparts, the safety stack, the gate, the human.
	place(
		'agent',
		'agent',
		[map.agent.name],
		{ x: centre.x, y: centre.y + 26 },
		90,
		{ x: centre.x, y: centre.y + 26 },
		CHAR_WIDTH.node,
		{ fixed: true, middle: true }
	);
	if (map.inside.world) {
		place(
			'world',
			'world',
			[`${map.inside.world.view === 'desk' ? 'desk' : 'room'} · ${map.inside.world.name}`],
			world,
			-90,
			{ x: world.x, y: world.y + 4 },
			CHAR_WIDTH.node,
			{ fixed: true, middle: true }
		);
	}
	for (const counterpart of counterparts) {
		place(
			`counterpart:${counterpart.agentId}`,
			'counterpart',
			[`◀ ${counterpart.name}`],
			counterpart.at,
			0,
			{ x: counterpart.at.x, y: counterpart.at.y + 4 },
			CHAR_WIDTH.node,
			{ fixed: true, middle: true }
		);
	}
	place(
		'stack',
		'ring',
		[`safety stack · ${map.boundary.safetyStack.map((b) => b.name).join(' · ') || 'none'}`],
		{ x: centre.x, y: centre.y - RING },
		90,
		{ x: centre.x, y: centre.y - RING - 8 },
		CHAR_WIDTH.node,
		{ middle: true }
	);
	place(
		'gate',
		'gate',
		[
			`egress ${map.boundary.egress.mode ?? 'declared by the build'} · ${map.boundary.egress.hosts.length} host${map.boundary.egress.hosts.length === 1 ? '' : 's'}`
		],
		gate,
		-30,
		{ x: gate.x + 12, y: gate.y + 4 },
		CHAR_WIDTH.node
	);
	place(
		'human',
		'human',
		[`approval ${map.boundary.approval.mode} · ${map.human.approvals}`],
		human,
		225,
		{ x: human.x, y: human.y + 30 },
		CHAR_WIDTH.node,
		{ middle: true }
	);
	// The outside nodes' lines sit inside their boxes; the box is the obstacle, so they never move.
	for (const node of outside) {
		const names = nameLinesOf(node.entry);
		const hosts = hostLinesOf(node.entry);
		const top = node.at.y - node.height / 2 + 8;
		place(
			`node:${node.edge}`,
			'node',
			names,
			node.at,
			degOf(node.at),
			{ x: node.at.x, y: top + 10 },
			CHAR_WIDTH.node,
			{ fixed: true, middle: true }
		);
		place(
			`host:${node.edge}`,
			'host',
			hosts.map((line, index) =>
				index === hosts.length - 1 && node.entry.credential ? `${line} 🔑` : line
			),
			node.at,
			degOf(node.at),
			{ x: node.at.x, y: top + 10 + names.length * LABEL_LINE_HEIGHT },
			CHAR_WIDTH.host,
			{ fixed: true, middle: true }
		);
	}
	// The stages' labels: beside the actor, outward, wrapped, moved when crowded.
	for (const stage of stages) {
		const deg = degOf(stage.at);
		const start = polar(centre, deg, Math.hypot(stage.at.x - centre.x, stage.at.y - centre.y) + 22);
		place(
			`stage:${stage.id}`,
			'stage',
			wrap(stage.name, 14),
			stage.at,
			deg,
			{ x: start.x, y: start.y + 3 },
			CHAR_WIDTH.stage
		);
	}

	return {
		width,
		height,
		centre,
		ring: RING,
		inside: INSIDE,
		gate,
		human,
		world,
		counterparts,
		rings,
		stages,
		outside,
		labels
	};
}

const hostsOf = (entry: BoundaryOutside): string =>
	entry.hosts.length === 0 ? 'local' : entry.hosts.join(', ');

/** The pairs of labels whose boxes overlap — the invariant's witness; empty when the layout holds. */
export function overlappingLabels(layout: BoundaryLayout): Array<[string, string]> {
	const pairs: Array<[string, string]> = [];
	for (let i = 0; i < layout.labels.length; i += 1) {
		for (let j = i + 1; j < layout.labels.length; j += 1) {
			const a = layout.labels[i]!;
			const b = layout.labels[j]!;
			if (overlaps(a.box, b.box, 0)) pairs.push([a.id, b.id]);
		}
	}
	return pairs;
}
