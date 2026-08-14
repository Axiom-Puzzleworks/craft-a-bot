/**
 * **Every bot's box looks like its own box** (`16-…` §2.3, `12-…` D17).
 *
 * `boxArtSeed` has been on the spec since WP14 and rendered nowhere, so a shelf
 * of six bots was six identical boxes distinguished only by a name in small
 * type. A child who has built six things has built six *things*, and telling
 * them apart at a glance is most of what a shelf is for.
 *
 * Deterministic, because the seed is the point: the same bot must look the same
 * on every visit and on every machine, and an exported kit must arrive
 * somewhere else wearing the face it left with. That rules out randomness and
 * rules out anything derived from load order.
 *
 * Composition only — never the brick colours, the silhouettes or the type,
 * which `11-…` §2 fixes as the brand. What varies is the sticker: its tilt, its
 * corner, and which of the accent colours it uses.
 */

/**
 * FNV-1a, chosen because it is short enough to read and stable across engines.
 * Any avalanche-y hash would do; what matters is that it never changes, since
 * changing it would silently redecorate every bot on every shelf.
 */
function hash(seed: string): number {
	let value = 2_166_136_261;
	for (let index = 0; index < seed.length; index += 1) {
		value ^= seed.charCodeAt(index);
		value = Math.imul(value, 16_777_619);
	}
	return value >>> 0;
}

/** The accent palette a sticker may use — all brand colours, none of them brick colours. */
const STICKER_COLOURS = [
	'var(--cab-yellow)',
	'var(--cab-teal)',
	'var(--cab-purple)',
	'var(--cab-orange)',
	'var(--cab-sky)'
] as const;

/*
 * Only the right-hand corners. The left of a box lid is taken: the brick colour
 * strip runs along the top-left and the "N of 6 bricks fitted" line sits under
 * it, and a sticker placed there covered the strip — which is the one part of
 * the lid that says what is actually in the box. Two corners, five colours and
 * thirteen tilts is still 130 boxes before any two match.
 */
const CORNERS = ['top-right', 'bottom-right'] as const;

export interface BoxArt {
	/** Which accent the sticker wears. */
	colour: string;
	/** Which corner it sits in. */
	corner: (typeof CORNERS)[number];
	/** A slight tilt, in degrees — a sticker applied by hand, not by machine. */
	tilt: number;
}

export function boxArtFor(seed: string): BoxArt {
	const value = hash(seed);
	return {
		colour: STICKER_COLOURS[value % STICKER_COLOURS.length] as string,
		corner: CORNERS[(value >>> 8) % CORNERS.length] as (typeof CORNERS)[number],
		// −6°…+6°, which reads as hand-applied rather than broken.
		tilt: (((value >>> 16) % 13) - 6) as number
	};
}
