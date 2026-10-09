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
import { SUITES, suiteFrom, trialsOf } from './live-suite.mjs';

export const CARTRIDGE = SUITES.giant.cartridge;

/**
 * The reply limit a live design gives its agents. The stage agents inherit the starter's 256, and the first lending
 * recording (2026-10-06) found 35 of its 791 replies, 4.4%, cut off by it with no call made: a measurement of the cap, not of
 * the model. A scripted brain never reads it, so raising it moves nothing but the live tier.
 *
 * 1,024 until 2026-10-07 (plan 113 §12, preflight): with the desks' rules on the case file a bot sometimes re-derives the rule at
 * length, and one lending cell spent eleven calls cut off at 1,024 with no call made, each reply feeding the next. 2,048 lets
 * the first long reply finish; the ordinary reply is 100–300 tokens, so it costs only the tail.
 */
export const MAX_TOKENS = 2048;

/**
 * The designs and the book each is recorded at. The size is chosen so a
 * design records in one session (roughly sixty to a hundred live cases; the desks' incidences differ widely — the fraud book draws nearly five alerts for every customer — so their sizes do). `variant`
 * names a second recording of the same design: the difference between the two
 * cassettes is the live tier's own variance.
 */
export const LIVE = [
	// Cheapest first, so a stopped run has the most designs behind it. `trials` is how often a design is performed
	// (`113-RECORDING-AND-RELIABILITY.md` §12): 2 where a second performance can change a conclusion, 1 where the design
	// sits at a ceiling (servicing) and the model's variance there would only cost hours. At k = 3 a design would read pass^3.
	{ base: 'onboarding-stack', size: 400, trials: 2 },
	{ base: 'disputes-stack', size: 400, trials: 2 },
	{ base: 'complaints-stack', size: 200, trials: 2 },
	{ base: 'servicing-stack', size: 200 },
	// WP169: the same design with a live customer across the desk, answering back (the book's caller drawn by the desk).
	{ base: 'servicing-stack', size: 100, seat: true },
	// Plan 113 §12, item 10: a design over scenarios, not a book — the agent-security components against the attacks the Playroom
	// carries, with a live model as the agent. No population to resize; one seed, since a scenario's world is deterministic and
	// the model's own variance is read from trials.
	{ base: 'controls', scenarios: true, trials: 2 },
	{ base: 'collections-stack', size: 300, trials: 2 },
	// `lending-stack` was recorded twice (a variant `b`) to read the live tier's own variance; trials now measure that directly, so
	// the second design is retired (its committed evidence stays as the record of that first measurement).
	{ base: 'lending-stack', size: 800, trials: 2 },
	{ base: 'advice-context', size: 1200, trials: 2 },
	{ base: 'fraud-stack', size: 6, trials: 2 }
];

/**
 * WP198: the designs of the oversight suite. Each derives from a base design like the others, but names the person at the bank's
 * decisions — the reviewer model that refuses, asks first and is late (`fs-bank/reviewer/person-at-approval`) — and the autonomy
 * levels to compare: the person at the decision and the bot with the go-ahead its own (where a stack's approval is the only person
 * left). `rules-only` is left out: it has no bot to oversee, and a live design costs cells.
 */
export const OVERSIGHT = [
	{
		id: 'lending-oversight-live',
		base: 'lending-stack',
		size: 800,
		trials: 2,
		reviewer: 'fs-bank/reviewer/person-at-approval',
		executors: ['bot-with-a-person-at-the-decision', 'bot-everywhere']
	},
	{
		id: 'complaints-oversight-live',
		base: 'complaints-stack',
		size: 200,
		trials: 2,
		reviewer: 'fs-bank/reviewer/person-at-approval',
		executors: ['bot-with-a-person-at-approval', 'bot-everywhere'],
		baselineExecutors: 'bot-everywhere'
	}
];

/** The designs a suite records: its own list where it names one, else the ten of the first suites. */
export const designsOf = (suite) => (suite.designs === 'oversight' ? OVERSIGHT : LIVE);

export const liveIdOf = ({ id, base, variant, seat }) =>
	id ?? `${base}-live${seat ? '-seat' : ''}${variant ? `-${variant}` : ''}`;

export function cassettePathOf(entry, cassetteRoot, suite = SUITES.giant) {
	const id = liveIdOf(entry);
	return `${cassetteRoot ?? suite.evidenceDir}/${id}/${id}.provider-cassette.json`.replaceAll(
		'\\',
		'/'
	);
}

export function liveDesign(entry, cassetteRoot, suite = SUITES.giant) {
	const base = JSON.parse(readFileSync(join(ROOT, 'experiments', `${entry.base}.json`), 'utf8'));
	const id = liveIdOf(entry);
	const d = structuredClone(base);
	d.id = id;
	d.title = `${base.title} — with the ${suite.short} on the DGX Sparks as the brain${entry.seat ? ' and as the customer' : ''}${entry.variant ? ` (second recording)` : ''}`;
	d.hypothesis = `${base.hypothesis} Here the decisions are made by a live model, \`${suite.cartridge}\` (${suite.model} on the builder's DGX Sparks), at temperature 0 with a ${MAX_TOKENS}-token reply limit, over a book of ${entry.size}: a single sample, recorded once and replayed from its cassette. The design's scripted and fallible columns are \`${entry.base}\`.`;
	d.design.factors = d.design.factors.filter((factor) => factor.axis !== 'brain');
	delete d.design.baseline.brain;
	// WP198: a person at the decisions. The reviewer model goes on every build; the executors factor lists the levels to compare.
	if (entry.reviewer)
		d.design.template.builds = d.design.template.builds.map((build) => ({
			...build,
			overrides: { ...build.overrides, reviewer: entry.reviewer }
		}));
	if (entry.executors) {
		d.design.factors = d.design.factors.filter((factor) => factor.axis !== 'executors');
		d.design.factors.push({ axis: 'executors', levels: entry.executors });
		d.design.baseline.executors =
			entry.baselineExecutors ?? d.design.baseline.executors ?? entry.executors.at(-1);
		d.hypothesis = `${d.hypothesis} The person at the decisions is the reviewer model \`${entry.reviewer}\`, who refuses an approval one time in twelve, asks a question first one time in eight and is late one time in ten.`;
	}
	d.design.template.brains = [
		{
			id: 'live',
			tier: 'live',
			cartridgeId: suite.cartridge,
			cassette: cassettePathOf(entry, cassetteRoot, suite)
		}
	];
	d.design.template.budget = { maxLiveCells: 1000 };
	// Performed more than once (113 §12): the design itself says how often, so its replay — here, in CI and after a recording — runs
	// as many performances as were recorded, and the result carries the reliability.
	if (trialsOf(entry, suite) > 1) d.design.trials = trialsOf(entry, suite);
	// A live customer (WP169): the seat takes the same cartridge as the brain, and answers from the same cassette on replay.
	if (entry.seat)
		d.design.template.counterpart = { tier: 'live', cartridgeId: suite.cartridge, maxRounds: 12 };
	d.design.template.builds = d.design.template.builds.map((build) => ({
		...build,
		overrides: { ...build.overrides, maxTokens: MAX_TOKENS }
	}));
	if (entry.scenarios) {
		if (!d.design.template.scenarios?.length)
			throw new Error(`${entry.base}: a live scenario design needs scenarios`);
		d.design.seeds = [1];
		return d;
	}
	const source = d.design.template.source;
	if (!source?.population)
		throw new Error(`${entry.base}: a live design needs a book population to resize`);
	source.population = { ...source.population, size: entry.size };
	return d;
}

const text = (design) => `${JSON.stringify(design, null, '\t')}\n`;

function main(args) {
	const { suite, rest: argv } = suiteFrom(args);
	const rootIndex = argv.indexOf('--cassette-root');
	const cassetteRoot = rootIndex === -1 ? undefined : argv[rootIndex + 1];
	const check = argv.includes('--check');
	const dir = join(ROOT, suite.experimentsDir);
	if (!check) mkdirSync(dir, { recursive: true });
	let bad = 0;
	for (const entry of designsOf(suite)) {
		const file = join(dir, `${liveIdOf(entry)}.json`);
		const wanted = text(liveDesign(entry, cassetteRoot, suite));
		if (check) {
			// Compared as data: prettier lays the file out its own way.
			const same =
				existsSync(file) &&
				JSON.stringify(JSON.parse(readFileSync(file, 'utf8'))) ===
					JSON.stringify(JSON.parse(wanted));
			if (!same) {
				console.error(
					`live-designs: ${file} is out of date; run node scripts/live-designs.mjs${suite.id === 'giant' ? '' : ` --suite ${suite.id}`} and format`
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
