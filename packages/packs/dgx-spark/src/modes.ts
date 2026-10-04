/**
 * **What a Spark can be doing** (`99-DGX-SPARK.md` §1, §9): the modes the
 * builder's Spark project folder defines (`MODES.md`, `stacks/modes/<mode>/`),
 * as data. A unit runs one mode at a time; the mode decides which model it
 * serves, under which names, with what context and how many parallel streams.
 *
 * This list is a *claim about the Sparks*, kept beside the code that depends on
 * it, and never the truth: what a unit serves is whatever its `/v1/models` says
 * (`transport.ts`), and a pattern (`patterns.ts`) is checked against this list
 * but verified against the survey. A mode added on the Sparks is added here to
 * be usable in a pattern; until then `craftabot spark status` still shows it.
 *
 * The Sparks have other uses than Craft A Bot (a puzzle generator, a fairness
 * project, coding agents, image and video). A mode's `owner` says whose it is,
 * so a plan can say what it would stop.
 */
export interface SparkMode {
	/** The folder under `~/stacks/modes/` on a unit, and the argument to `switch.sh`. */
	id: string;
	title: string;
	kind: 'llm' | 'media' | 'shared';
	/** Whose mode this is; Craft A Bot's patterns borrow the others'. */
	owner: 'craft-a-bot' | 'puzzle' | 'fairness' | 'coding' | 'media' | 'shared';
	/** The model directory it loads (the cartridges' `model`), absent for media modes. */
	model?: string;
	/** Every name the model is served under. */
	served: readonly string[];
	contextTokens?: number;
	/** Parallel sequences the engine accepts (`--max-num-seqs`). */
	streams?: number;
	/** The first token's log-probabilities are available and the mode is tuned for single-token answers. */
	logprobs?: boolean;
	/** Minutes a switch into this mode takes to be healthy: measured 2026-10-04 for `puzzle` (12 m 33 s, so 13) and `chat` (6 m 45 s, so 7); the others are the Sparks' own estimates, the 122B modes set to match `puzzle`. */
	loadMinutes: number;
	summary: string;
}

const QWEN_122B = 'Qwen3.5-122B-A10B-NVFP4';

export const SPARK_MODES: readonly SparkMode[] = [
	{
		id: 'puzzle',
		title: 'Puzzle (122B, 8 streams)',
		kind: 'llm',
		owner: 'puzzle',
		model: QWEN_122B,
		served: ['puzzle-llm', 'tidy'],
		contextTokens: 40960,
		streams: 8,
		loadMinutes: 13,
		summary:
			'The Logic Grid Puzzle software’s mode, and the Sparks’ starter: the 122B served as `puzzle-llm` and `tidy`, 40k context, 8 streams.'
	},
	{
		id: 'lang-single',
		title: 'Language, single (122B, long context)',
		kind: 'llm',
		owner: 'craft-a-bot',
		model: QWEN_122B,
		served: ['qwen3.5-122b'],
		contextTokens: 131072,
		streams: 4,
		loadMinutes: 13,
		summary: 'The 122B alone with 131k context and 4 streams: the hardest language tasks.'
	},
	{
		id: 'cpf-large',
		title: 'Cohort Parity Fairness (122B, 64 streams, logprobs)',
		kind: 'llm',
		owner: 'fairness',
		model: QWEN_122B,
		served: ['qwen3.5-122b', 'puzzle-llm'],
		contextTokens: 4096,
		streams: 64,
		logprobs: true,
		loadMinutes: 13,
		summary:
			'The fairness project’s mode: the 122B tuned for many short single-token answers with log-probabilities, 4k context, 64 streams, no speculative decoding. The shape a Craft A Bot reader asks for.'
	},
	{
		id: 'chat',
		title: 'Chat (35B, 262k context)',
		kind: 'llm',
		owner: 'craft-a-bot',
		model: 'Qwen3.6-35B-A3B-NVFP4',
		served: ['qwen3.6'],
		contextTokens: 262144,
		streams: 8,
		loadMinutes: 7,
		summary:
			'Qwen3.6-35B-A3B: about five times quicker than the 122B and, on the servicing classifier, as good as Jev (`99-…` §5).'
	},
	{
		id: 'coder-27b',
		title: 'Coder (27B dense)',
		kind: 'llm',
		owner: 'coding',
		model: 'Qwen3.6-27B-NVFP4',
		served: ['qwen3.6-27b'],
		contextTokens: 131072,
		streams: 6,
		loadMinutes: 5,
		summary: 'Qwen3.6-27B dense: careful with tools; the Claude Code target.'
	},
	{
		id: 'coder-single',
		title: 'Coder, single (80B-A3B)',
		kind: 'llm',
		owner: 'coding',
		model: 'Qwen3-Coder-Next-FP8',
		served: ['qwen3-coder-next'],
		contextTokens: 131072,
		streams: 4,
		loadMinutes: 8,
		summary: 'The strongest coder, one agent at a time.'
	},
	{
		id: 'coder-swarm',
		title: 'Coder swarm (30B-A3B)',
		kind: 'llm',
		owner: 'coding',
		model: 'Qwen3-Coder-30B-A3B-Instruct-FP8',
		served: ['qwen3-coder-30b'],
		contextTokens: 65536,
		streams: 16,
		loadMinutes: 5,
		summary: 'Sixteen parallel coding agents.'
	},
	{
		id: 'lang-swarm',
		title: 'Language swarm (Nemotron Lightning)',
		kind: 'llm',
		owner: 'coding',
		model: 'Nemotron-3.5-Lightning-30B-A3B-NVFP4',
		served: ['nemotron-lightning'],
		contextTokens: 65536,
		streams: 8,
		loadMinutes: 5,
		summary: 'The fastest per token, with a speculative draft.'
	},
	{
		id: 'comfyui',
		title: 'ComfyUI (image and video)',
		kind: 'media',
		owner: 'media',
		served: [],
		loadMinutes: 2,
		summary: 'Image and video generation on :8188. Serves no language model.'
	},
	{
		id: 'shared-head',
		title: 'Shared, head (spark-619c)',
		kind: 'shared',
		owner: 'shared',
		served: [],
		loadMinutes: 20,
		summary:
			'The head half of one large model split across both units over the QSFP link; the model is chosen per run, so the catalogue does not claim one.'
	},
	{
		id: 'shared-worker',
		title: 'Shared, worker (spark-ef08)',
		kind: 'shared',
		owner: 'shared',
		served: [],
		loadMinutes: 20,
		summary: 'The worker half of the shared mode.'
	}
];

/** A mode id is a folder name on the Sparks and an argument in a command line: only this shape is ever sent. */
export const SPARK_MODE_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

export const sparkModeById = (id: string): SparkMode | undefined =>
	SPARK_MODES.find((mode) => mode.id === id);

/** The modes that serve a model directory (or any of its served names). */
export const modesServing = (wanted: string): SparkMode[] =>
	SPARK_MODES.filter(
		(mode) =>
			mode.model?.toLowerCase() === wanted.toLowerCase() ||
			mode.served.some((name) => name.toLowerCase() === wanted.toLowerCase())
	);
