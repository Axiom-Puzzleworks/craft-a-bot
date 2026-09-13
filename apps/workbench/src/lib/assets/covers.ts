import { INSTRUMENT_ICONS } from './instruments.js';

/**
 * **Journey covers** (WP109, `96-CONTROL-ROOM-V3.md` §4; `83-…` §6.7.2):
 * one illustration per shipped journey, in the Kit's voice, on the journeys
 * page's cards and the Playground's strip — on the swap-in seam every wave
 * 2 asset sits on. `coverFor` returns the delivered file when the commission
 * lands (`DELIVERED`, keyed by workflow id, empty today) and the in-house
 * placeholder otherwise: a graph-paper card with the journey's lanes as
 * bands, its stages as a row of stops, and the journey roundel — drawn from
 * the journey's own layout, so no two are alike and the same journey draws
 * the same cover on every machine.
 */
export interface CoverSubject {
	/** The workflow id: `fs-lending/lending`. */
	id: string;
	name: string;
	/** The lanes the layout draws, in order. */
	lanes: readonly string[];
	/** The stage count. */
	stages: number;
}

/** The delivered covers, by workflow id — none yet; the brief's seam. */
export const DELIVERED: Readonly<Record<string, string>> = {};

export const COVER_WIDTH = 240;
export const COVER_HEIGHT = 150;

const escape = (text: string): string =>
	text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A small deterministic hash: which band carries the stops, where the roundel sits. */
function seedOf(id: string): number {
	let hash = 2166136261;
	for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
	return hash;
}

/** The in-house placeholder, to the brief: palette colours only, `#tint` tintable, the roundel's glyph inlined. */
export function placeholderCover(subject: CoverSubject): string {
	const lanes = subject.lanes.length > 0 ? subject.lanes : ['assistant'];
	const seed = seedOf(subject.id);
	const bandTop = 34;
	const bandHeight = (COVER_HEIGHT - bandTop - 14) / lanes.length;
	const stopLane = seed % lanes.length;
	const stops = Math.max(2, Math.min(subject.stages, 9));
	const stopY = bandTop + bandHeight * stopLane + bandHeight / 2;
	const left = 26;
	const right = COVER_WIDTH - 62;
	const step = stops > 1 ? (right - left) / (stops - 1) : 0;
	const bands = lanes
		.map((lane, index) => {
			const y = bandTop + bandHeight * index;
			const shade = index % 2 === 0 ? 0.16 : 0.08;
			return `<rect x="8" y="${y.toFixed(1)}" width="${COVER_WIDTH - 16}" height="${bandHeight.toFixed(1)}" fill="#2B2620" fill-opacity="${shade}"/><text x="12" y="${(y + 11).toFixed(1)}" font-family="system-ui, sans-serif" font-size="8" fill="#2B2620" fill-opacity=".7">${escape(lane)}</text>`;
		})
		.join('');
	const line = `<line x1="${left}" y1="${stopY.toFixed(1)}" x2="${right}" y2="${stopY.toFixed(1)}" stroke="#2B2620" stroke-width="2"/>`;
	const marks = Array.from({ length: stops }, (_, index) => {
		const x = left + step * index;
		const last = index === stops - 1;
		return `<circle cx="${x.toFixed(1)}" cy="${stopY.toFixed(1)}" r="${last ? 6 : 4.5}" fill="${last ? '#3E8F8A' : '#F3E9D2'}" stroke="#2B2620" stroke-width="2"/>`;
	}).join('');
	const roundel = INSTRUMENT_ICONS.journey
		.replace(/^<svg[^>]*>/, '')
		.replace(/<\/svg>\s*$/, '')
		.replace(/id="/g, `id="cover-${seed % 997}-`);
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COVER_WIDTH} ${COVER_HEIGHT}" role="img" aria-label="${escape(subject.name)}"><defs><pattern id="grid-${seed % 997}" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#2B2620" stroke-opacity=".12" stroke-width="1"/></pattern></defs><rect id="tint" width="${COVER_WIDTH}" height="${COVER_HEIGHT}" rx="10" fill="var(--part-tint, #F3E9D2)"/><rect width="${COVER_WIDTH}" height="${COVER_HEIGHT}" rx="10" fill="url(#grid-${seed % 997})"/><rect x="1.5" y="1.5" width="${COVER_WIDTH - 3}" height="${COVER_HEIGHT - 3}" rx="9" fill="none" stroke="#2B2620" stroke-width="3"/><text x="12" y="22" font-family="system-ui, sans-serif" font-size="12" font-weight="700" fill="#2B2620">${escape(subject.name)}</text>${bands}${line}${marks}<g transform="translate(${COVER_WIDTH - 44} 8) scale(0.375)">${roundel}</g></svg>`;
}

/** The cover for a journey: the delivered file when there is one, the placeholder otherwise. */
export function coverFor(subject: CoverSubject): string {
	return DELIVERED[subject.id] ?? placeholderCover(subject);
}
