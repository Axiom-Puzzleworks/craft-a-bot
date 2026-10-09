/**
 * **The live suites** (`113-RECORDING-AND-RELIABILITY.md`, the 35B suite): the same ten live designs, run with a different model
 * in the brain's seat. A suite names the cartridge, the model behind it, the Spark pattern that serves it, and where its
 * designs, evidence and live-run stores live, so two suites never write over each other.
 *
 *   node scripts/<live-script>.mjs                 the default suite, `giant` (the 122B)
 *   node scripts/<live-script>.mjs --suite quick   the 35B
 *
 * `LIVE_SUITE=quick` in the environment does the same. A design has the same id in every suite (its result, its stories and
 * its cassette are told apart by the folder they sit in), and `trials` is the suite's when it names one: the 35B suite
 * performs every design twice, the 122B suite only where a second performance can change a conclusion.
 */
export const SUITES = {
	giant: {
		id: 'giant',
		cartridge: 'dgx-spark/giant-qwen',
		model: 'Qwen3.5-122B-A10B-NVFP4',
		short: '122B',
		pattern: 'reasoning-pair',
		experimentsDir: 'experiments/live',
		evidenceDir: 'docs/evidence/live',
		recordingsDir: 'recordings',
		workDir: '.live-work'
	},
	quick: {
		id: 'quick',
		cartridge: 'dgx-spark/quick-qwen',
		model: 'Qwen3.6-35B-A3B-NVFP4',
		short: '35B',
		pattern: 'fast-pair',
		experimentsDir: 'experiments/live-35b',
		evidenceDir: 'docs/evidence/live-35b',
		recordingsDir: 'recordings/35b',
		workDir: '.live-work-35b',
		trials: 2
	},
	// WP198 (114-DECISIONS-UNDER-PRESSURE-PLAN.md): a person who says no, at a bank decision. The 122B in the brain's seat as in the
	// first suite, but its own designs (`designs`, in live-designs.mjs), its own folders, and the reviewer model of person-at-approval.
	oversight: {
		id: 'oversight',
		cartridge: 'dgx-spark/giant-qwen',
		model: 'Qwen3.5-122B-A10B-NVFP4',
		short: '122B',
		pattern: 'reasoning-pair',
		experimentsDir: 'experiments/live-oversight',
		evidenceDir: 'docs/evidence/live-oversight',
		recordingsDir: 'recordings/oversight',
		workDir: '.live-work-oversight',
		trials: 2,
		designs: 'oversight'
	}
};

/** The suite an invocation names (`--suite <id>`, else `LIVE_SUITE`, else the 122B's), and the arguments without the flag. */
export function suiteFrom(argv = process.argv.slice(2), env = process.env) {
	const at = argv.indexOf('--suite');
	const id = at >= 0 ? argv[at + 1] : (env.LIVE_SUITE ?? 'giant');
	const suite = SUITES[id];
	if (!suite) throw new Error(`no live suite "${id}"; known: ${Object.keys(SUITES).join(', ')}`);
	const rest = at >= 0 ? argv.filter((_, i) => i !== at && i !== at + 1) : [...argv];
	return { suite, rest };
}

/** How often a design is performed in a suite: the suite's, where it names one, else the design's own. */
export const trialsOf = (entry, suite) => suite.trials ?? entry.trials ?? 1;
