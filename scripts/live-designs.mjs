#!/usr/bin/env node
/**
 * **The live designs** (WP168, `112-REAL-ENOUGH-PLAN.md` §5): each reference
 * design with a book, run once with its brain a live model, as a design of its
 * own under `experiments/live/`. Derived from the base design, never written
 * by hand, so the two cannot drift: the same template, factors and metrics,
 * the brain factor removed, one brain — `dgx-spark/giant-qwen`, the 122B on
 * the DGX Sparks (D1) — naming the cassette its calls are recorded to, a book
 * at a reduced size of its own (a live case costs about fifteen thousand
 * tokens and half a minute), and a budget for its live cells.
 *
 * They live apart from `experiments/*.json` because CI replays those at one
 * reduced size and shape-checks them against the committed full-size result; a
 * live design replays at its own recorded size, from its own cassette, and is
 * held to its own committed result (`scripts/live-check.mjs`).
 *
 *   node scripts/live-designs.mjs                      write experiments/live/*.json
 *   node scripts/live-designs.mjs --cassette-root <d>  the same, cassettes under <d> (for a dry run)
 *   node scripts/live-designs.mjs --check              fail if a file on disk differs, as data, from what this would write
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CARTRIDGE = 'dgx-spark/giant-qwen';

/**
 * The reply limit a live design gives its agents. The stage agents inherit the starter's 256, and the first lending
 * recording (2026-10-06) found 35 of its 791 replies, 4.4%, cut off by it with no call made: a measurement of the cap, not of
 * the model. A scripted brain never reads it, so raising it moves nothing but the live tier.
 */
export const MAX_TOKENS = 1024;

/**
 * The designs and the book each is recorded at. The size is chosen so a
 * design records in one session (roughly sixty to a hundred live cases; the desks' incidences differ widely — the fraud book draws nearly five alerts for every customer — so their sizes do). `variant`
 * names a second recording of the same design: the difference between the two
 * cassettes is the live tier's own variance.
 */
export const LIVE = [
	{ base: 'lending-stack', size: 800 },
	{ base: 'lending-stack', size: 800, variant: 'b' },
	{ base: 'servicing-stack', size: 200 },
	{ base: 'disputes-stack', size: 400 },
	{ base: 'collections-stack', size: 300 },
	{ base: 'onboarding-stack', size: 400 },
	{ base: 'complaints-stack', size: 200 },
	{ base: 'fraud-stack', size: 6 },
	{ base: 'advice-context', size: 1200 }
];

export const liveIdOf = ({ base, variant }) => `${base}-live${variant ? `-${variant}` : ''}`;

export function cassettePathOf(entry, cassetteRoot) {
	const id = liveIdOf(entry);
	return `${cassetteRoot ?? 'docs/evidence/live'}/${id}/${id}.provider-cassette.json`.replaceAll(
		'\\',
		'/'
	);
}

export function liveDesign(entry, cassetteRoot) {
	const base = JSON.parse(readFileSync(join(ROOT, 'experiments', `${entry.base}.json`), 'utf8'));
	const id = liveIdOf(entry);
	const d = structuredClone(base);
	d.id = id;
	d.title = `${base.title} — with the 122B on the DGX Sparks as the brain${entry.variant ? ` (second recording)` : ''}`;
	d.hypothesis = `${base.hypothesis} Here the decisions are made by a live model, \`${CARTRIDGE}\` (Qwen3.5-122B-A10B-NVFP4 on the builder's DGX Sparks), at temperature 0 with a ${MAX_TOKENS}-token reply limit, over a book of ${entry.size}: a single sample, recorded once and replayed from its cassette. The design's scripted and fallible columns are \`${entry.base}\`.`;
	d.design.factors = d.design.factors.filter((factor) => factor.axis !== 'brain');
	delete d.design.baseline.brain;
	d.design.template.brains = [
		{
			id: 'live',
			tier: 'live',
			cartridgeId: CARTRIDGE,
			cassette: cassettePathOf(entry, cassetteRoot)
		}
	];
	d.design.template.budget = { maxLiveCells: 1000 };
	d.design.template.builds = d.design.template.builds.map((build) => ({
		...build,
		overrides: { ...build.overrides, maxTokens: MAX_TOKENS }
	}));
	const source = d.design.template.source;
	if (!source?.population)
		throw new Error(`${entry.base}: a live design needs a book population to resize`);
	source.population = { ...source.population, size: entry.size };
	return d;
}

const text = (design) => `${JSON.stringify(design, null, '\t')}\n`;

function main(argv) {
	const rootIndex = argv.indexOf('--cassette-root');
	const cassetteRoot = rootIndex === -1 ? undefined : argv[rootIndex + 1];
	const check = argv.includes('--check');
	const dir = join(ROOT, 'experiments', 'live');
	if (!check) mkdirSync(dir, { recursive: true });
	let bad = 0;
	for (const entry of LIVE) {
		const file = join(dir, `${liveIdOf(entry)}.json`);
		const wanted = text(liveDesign(entry, cassetteRoot));
		if (check) {
			// Compared as data: prettier lays the file out its own way.
			const same =
				existsSync(file) &&
				JSON.stringify(JSON.parse(readFileSync(file, 'utf8'))) ===
					JSON.stringify(JSON.parse(wanted));
			if (!same) {
				console.error(
					`live-designs: ${file} is out of date; run node scripts/live-designs.mjs and format`
				);
				bad += 1;
			}
		} else {
			writeFileSync(file, wanted, 'utf8');
			console.log(`wrote ${file}`);
		}
	}
	if (bad > 0) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
	main(process.argv.slice(2));
