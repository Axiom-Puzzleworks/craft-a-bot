/**
 * **The one data-visualisation grammar** (WP57, `44-CONTROL-ROOM.md` §4.3).
 *
 * Every chart the Workshop draws — a campaign grid, a confusion matrix, a
 * telemetry ribbon, a gauge, the Boundary map — reads its ramps, its lane
 * order, its status marks and its axis rules from here and nowhere else.
 * This is the only module under `lib/control-room` or
 * `components/control-room` allowed to name a hex; components read tokens
 * through the `var(--cab-*)` strings below and call these functions. The
 * lint rule in `eslint.config.js` keeps `<svg>` inside `Meter`, `Tape` and
 * `Boundary`; review keeps the ramps here.
 *
 * Two rules everything below serves (`04-…` §7, `17-…` §4.4): **colour is
 * magnitude and the number is the fact** — a cell always shows its value;
 * and **never colour alone** — every lane and every status has a glyph and
 * a word beside its hue.
 */

export interface RampStep {
	/** The cell or band fill. */
	fill: string;
	/** Whether a label on that fill should be ink (true) or cream (false). */
	ink: boolean;
}

/**
 * **Teal, and the hue is not a free choice** (the Eval Matrix's own note,
 * WP23): `04-…` §2.2 makes the colour↔concept mapping law — blue is LLM,
 * green Memory, purple Tools, sky Sense, red Actions, yellow Safety, rose
 * Planner, indigo If/Then — so a magnitude ramp in any of them would put a
 * brick's colour on a number that has nothing to do with the brick. Teal is
 * the hue `20-…` §2 designates "accent only — not a brick colour", so it is
 * the one sequential ramp; orange, the other accent-only tint, is the far
 * end of the diverging one. The six teal steps are the WP23 ramp,
 * byte-identical, so the grid's colours did not move when its ramp moved
 * house. Every step pairs with a label colour that clears 4.5:1 on it, and
 * the ramp skips the middle band where neither ink nor cream passes.
 */
export const SEQUENTIAL_TEAL: readonly RampStep[] = [
	{ fill: '#ecf8f7', ink: true },
	{ fill: '#c3e7e4', ink: true },
	{ fill: '#93cbc7', ink: true },
	{ fill: '#63a6a1', ink: true },
	{ fill: '#356b67', ink: false },
	{ fill: '#20514e', ink: false }
];

/** Orange through cream to teal — a value relative to a baseline, worse to better. Neither end is a brick colour. */
export const DIVERGING: readonly RampStep[] = [
	{ fill: '#a8501e', ink: false },
	{ fill: '#d77a3c', ink: true },
	{ fill: '#ecc9ac', ink: true },
	{ fill: '#efe8d6', ink: true },
	{ fill: '#c3e7e4', ink: true },
	{ fill: '#63a6a1', ink: true },
	{ fill: '#20514e', ink: false }
];

const clamp01 = (value: number): number =>
	Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

/** The ramp step for a value in `[0, 1]`; the top step is reserved for exactly 1. */
export function sequential(value: number, ramp: readonly RampStep[] = SEQUENTIAL_TEAL): RampStep {
	const v = clamp01(value);
	const last = ramp.length - 1;
	if (v >= 1) return ramp[last] as RampStep;
	const index = Math.min(last - 1, Math.floor(v * last));
	return ramp[index] as RampStep;
}

/** The ramp step for a delta in `[-1, 1]`, centred on cream. */
export function diverging(delta: number): RampStep {
	const d = Number.isFinite(delta) ? Math.min(1, Math.max(-1, delta)) : 0;
	const index = Math.round(((d + 1) / 2) * (DIVERGING.length - 1));
	return DIVERGING[index] as RampStep;
}

/**
 * The lanes, in the colour law's order (`04-…` §2.2): a trace lane means
 * the same thing everywhere. `token` is the hue for a border or a fill,
 * `text` the darkened variant for a label, `glyph` the mark that goes with
 * the hue so a lane is never colour alone.
 */
export type LaneId =
	| 'sense'
	| 'think'
	| 'tool'
	| 'action'
	| 'memory'
	| 'guardrail'
	| 'planner'
	| 'reflexes'
	| 'counterpart'
	| 'system';

export interface Lane {
	id: LaneId;
	label: string;
	token: string;
	text: string;
	glyph: string;
}

export const LANES: readonly Lane[] = [
	{
		id: 'sense',
		label: 'sense',
		token: 'var(--cab-sky)',
		text: 'var(--cab-blue-text)',
		glyph: '👀'
	},
	{
		id: 'think',
		label: 'think',
		token: 'var(--cab-blue)',
		text: 'var(--cab-blue-text)',
		glyph: '💭'
	},
	{
		id: 'tool',
		label: 'tool',
		token: 'var(--cab-purple)',
		text: 'var(--cab-purple-text)',
		glyph: '🔧'
	},
	{
		id: 'action',
		label: 'action',
		token: 'var(--cab-red)',
		text: 'var(--cab-red-text)',
		glyph: '▶'
	},
	{
		id: 'memory',
		label: 'memory',
		token: 'var(--cab-green)',
		text: 'var(--cab-green-text)',
		glyph: '📗'
	},
	{
		id: 'guardrail',
		label: 'guardrail',
		token: 'var(--cab-yellow)',
		text: 'var(--cab-inconclusive)',
		glyph: '🛡'
	},
	{
		id: 'planner',
		label: 'planner',
		token: 'var(--cab-rose)',
		text: 'var(--cab-rose)',
		glyph: '📋'
	},
	{
		id: 'reflexes',
		label: 'reflexes',
		token: 'var(--cab-indigo)',
		text: 'var(--cab-indigo)',
		glyph: '⚡'
	},
	{
		id: 'counterpart',
		label: 'counterpart',
		token: 'var(--cab-counterpart)',
		text: 'var(--cab-counterpart)',
		glyph: '◀'
	},
	{
		id: 'system',
		label: 'system',
		token: 'var(--cab-ink-muted)',
		text: 'var(--cab-ink-muted)',
		glyph: '•'
	}
];

export function lane(id: LaneId): Lane {
	return LANES.find((candidate) => candidate.id === id) as Lane;
}

/** Verdicts and liveness — a token, a glyph and a word, always together. */
export type Status = 'pass' | 'fail' | 'inconclusive' | 'live';

export interface StatusMark {
	id: Status;
	label: string;
	token: string;
	glyph: string;
}

export const STATUS: Record<Status, StatusMark> = {
	pass: { id: 'pass', label: 'pass', token: 'var(--cab-pass)', glyph: '✓' },
	fail: { id: 'fail', label: 'fail', token: 'var(--cab-fail)', glyph: '✕' },
	inconclusive: {
		id: 'inconclusive',
		label: 'inconclusive',
		token: 'var(--cab-inconclusive)',
		glyph: '?'
	},
	live: { id: 'live', label: 'live', token: 'var(--cab-scope)', glyph: '●' }
};

/** A verdict as an evaluator writes it, onto a status mark. */
export function statusOf(verdict: 'pass' | 'fail' | 'inconclusive' | undefined): StatusMark {
	return STATUS[verdict ?? 'inconclusive'];
}

// ------------------------------------------------------------------ axes

/** "Nice" tick values across `[min, max]` — 1/2/5 steps, the way a ruler is marked. */
export function ticks(min: number, max: number, count = 5): number[] {
	if (!Number.isFinite(min) || !Number.isFinite(max) || count < 2) return [];
	if (max === min) return [min];
	const span = max - min;
	const rough = span / (count - 1);
	const magnitude = 10 ** Math.floor(Math.log10(rough));
	const residual = rough / magnitude;
	// The usual nice-number thresholds: 1, 2, 5, 10.
	const step = (residual < 1.5 ? 1 : residual < 3 ? 2 : residual < 7 ? 5 : 10) * magnitude;
	const start = Math.ceil(min / step) * step;
	const out: number[] = [];
	for (let value = start; value <= max + step / 1000; value += step) {
		out.push(Number(value.toFixed(10)));
	}
	return out;
}

export const formatPercent = (value: number): string =>
	Number.isFinite(value) ? `${Math.round(value * 100)}%` : '—';

export const formatCount = (value: number): string =>
	Number.isFinite(value) ? new Intl.NumberFormat('en-GB').format(Math.round(value)) : '—';

export const formatTick = (tick: number): string => `t${tick}`;

// ------------------------------------------------------------- geometry

export interface Point {
	x: number;
	y: number;
}

export interface Box {
	width: number;
	height: number;
	/** Inset on every side, in the same units. */
	pad: number;
}

/** Scale a series into a box, y up; a flat series sits on the midline. */
export function plot(
	points: readonly Point[],
	box: Box,
	range?: { min: number; max: number }
): string {
	if (points.length === 0) return '';
	const xs = points.map((p) => p.x);
	const ys = points.map((p) => p.y);
	const xMin = Math.min(...xs);
	const xMax = Math.max(...xs);
	const yMin = range?.min ?? Math.min(...ys);
	const yMax = range?.max ?? Math.max(...ys);
	const innerW = box.width - box.pad * 2;
	const innerH = box.height - box.pad * 2;
	return points
		.map((p) => {
			const px =
				xMax === xMin ? box.pad + innerW / 2 : box.pad + ((p.x - xMin) / (xMax - xMin)) * innerW;
			const py =
				yMax === yMin
					? box.pad + innerH / 2
					: box.pad + innerH - ((p.y - yMin) / (yMax - yMin)) * innerH;
			return `${px.toFixed(1)},${py.toFixed(1)}`;
		})
		.join(' ');
}

/** The needle's angle for a value across a half-dial: 180° at `min` (left), 0° at `max` (right). */
export function needleAngle(value: number, min = 0, max = 1): number {
	const v = max === min ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min)));
	return 180 - v * 180;
}

/** An SVG arc path on a half-dial from one angle to another (degrees, 180 = left, 0 = right). */
export function arcPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
	const point = (deg: number): Point => ({
		x: cx + r * Math.cos((deg * Math.PI) / 180),
		y: cy - r * Math.sin((deg * Math.PI) / 180)
	});
	const a = point(fromDeg);
	const b = point(toDeg);
	const sweep = fromDeg > toDeg ? 1 : 0;
	return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} A ${r} ${r} 0 0 ${sweep} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}
