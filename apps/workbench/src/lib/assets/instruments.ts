/**
 * **The Workshop instrument icon set** (WP73, `62-THE-TAIL.md` §4.1;
 * `63-ART-COMMISSION-BRIEF-WAVE-2.md` §5.2; sixteen since WP91): roundels in the family
 * `11-…` §I describes — a disc in a token colour, the glyph in cream — one
 * per Control Room instrument or screen. What ships today is the
 * **placeholder** for each: geometric, drawn to the delivery contract
 * (96 × 96, `#disc` tintable through `--part-tint`, `#glyph` carrying the
 * mark, palette colours only), so the commissioned file replaces it by name
 * with no code change — the WP18 pattern (`20-…` §4).
 *
 * Imported `?raw` and handed out as markup like every wave 1 asset
 * (`index.ts`), for the same reason: `--part-tint` and the named groups are
 * unreachable through an `<img src>`.
 */
import iconMeter from './instruments/icon-meter.svg?raw';
import iconLamp from './instruments/icon-lamp.svg?raw';
import iconTape from './instruments/icon-tape.svg?raw';
import iconMatrix from './instruments/icon-matrix.svg?raw';
import iconChain from './instruments/icon-chain.svg?raw';
import iconCase from './instruments/icon-case.svg?raw';
import iconDesk from './instruments/icon-desk.svg?raw';
import iconDeck from './instruments/icon-deck.svg?raw';
import iconCassette from './instruments/icon-cassette.svg?raw';
import iconCohort from './instruments/icon-cohort.svg?raw';
import iconBoundary from './instruments/icon-boundary.svg?raw';
// WP91 (`81-…` §3): the Day 5 screens' roundels — the Pipeline, the clock, a lens, an experiment, the register.
import iconPipeline from './instruments/icon-pipeline.svg?raw';
import iconClock from './instruments/icon-clock.svg?raw';
import iconLens from './instruments/icon-lens.svg?raw';
import iconExperiment from './instruments/icon-experiment.svg?raw';
import iconRegister from './instruments/icon-register.svg?raw';

export const INSTRUMENT_IDS = [
	'meter',
	'lamp',
	'tape',
	'matrix',
	'chain',
	'case',
	'desk',
	'deck',
	'cassette',
	'cohort',
	'boundary',
	'pipeline',
	'clock',
	'lens',
	'experiment',
	'register'
] as const;

export type InstrumentId = (typeof INSTRUMENT_IDS)[number];

/** Each icon's markup, keyed by the instrument it stands for. */
export const INSTRUMENT_ICONS: Record<InstrumentId, string> = {
	meter: iconMeter,
	lamp: iconLamp,
	tape: iconTape,
	matrix: iconMatrix,
	chain: iconChain,
	case: iconCase,
	desk: iconDesk,
	deck: iconDeck,
	cassette: iconCassette,
	cohort: iconCohort,
	boundary: iconBoundary,
	pipeline: iconPipeline,
	clock: iconClock,
	lens: iconLens,
	experiment: iconExperiment,
	register: iconRegister
};
