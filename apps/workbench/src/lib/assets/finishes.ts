/**
 * **The Control Room's two finishes** (WP73, `62-THE-TAIL.md` §4.2;
 * `63-…` §5.3): engraved metal and graph paper, as tileable textures. The
 * seam is two CSS custom properties set once on the Workshop's root
 * (`routes/workshop/+layout.svelte`); every instrument that paints a finish
 * reads the property with its own hand-drawn rule as the fallback, so no
 * component knows whether the art has landed.
 *
 * What ships today is the placeholder for each: the graph paper is the same
 * 16-px rule the components drew as a gradient, as a file; the metal is a
 * faint brushed stroke set over the panel's own `--cab-metal`.
 */
import graph from './finishes/finish-graph.svg?raw';
import metal from './finishes/finish-metal.svg?raw';

export const FINISHES = { metal, graph } as const;

export type FinishId = keyof typeof FINISHES;

/** A `url("data:image/svg+xml,…")` a stylesheet can paint with. */
export function finishUrl(finish: FinishId): string {
	return `url("data:image/svg+xml,${encodeURIComponent(FINISHES[finish])}")`;
}

/** The two properties the Workshop's root carries. */
export const FINISH_PROPERTIES = {
	'--cab-finish-metal': finishUrl('metal'),
	'--cab-finish-graph': finishUrl('graph')
} as const;
