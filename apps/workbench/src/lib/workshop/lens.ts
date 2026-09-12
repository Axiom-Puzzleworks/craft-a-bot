/**
 * **The lenses** (WP87, `78-LENSES.md`; `64-TARGET-DESIGN-V5.md` §6.7,
 * decision D9, tenet 25): a lens is configuration over the existing routes
 * and folds — it changes the rail's order and grouping, the entry page and
 * the vocabulary, never the data. Four ship: the engineer's (today's
 * Workshop, unchanged), the board's, the compliance reviewer's and the
 * data scientist's. Every route stays reachable by URL under every lens: a
 * lens hides nothing, it orders. The Conduct and Model-risk entries are
 * WP88's pages; until they land, those lenses open on the pages that hold
 * their facts today.
 */
export type LensId = 'engineer' | 'assurance' | 'conduct' | 'model-risk';

export const LENS_IDS: readonly LensId[] = ['engineer', 'assurance', 'conduct', 'model-risk'];

/** The rail's destinations, by the ids `WorkshopRail.svelte` draws. */
export type RailId =
	| 'dashboard'
	| 'runs'
	| 'spec'
	| 'evals'
	| 'campaigns'
	| 'workflows'
	| 'evaluators'
	| 'scenarios'
	| 'sinks'
	| 'evidence'
	| 'playground'
	| 'policies'
	| 'bench'
	| 'telemetry'
	| 'monitor'
	| 'conduct'
	| 'model-risk'
	| 'experiments'
	| 'incidents'
	| 'safety-case'
	| 'assurance'
	| 'export'
	| 'guards';

export interface RailGroup {
	group: string;
	routes: RailId[];
}

export interface FirstRunStep {
	/** What to do, in the lens's own words. */
	text: string;
	/** Where to do it. */
	href: string;
}

export interface Lens {
	id: LensId;
	name: string;
	/** The question this reader brings. */
	question: string;
	/** The landing route. */
	entry: string;
	/** The routes this reader sees, in order, in groups. */
	rail: RailGroup[];
	/** Label overrides over the engineer's words: `trip` → `control intervention`, `cell` → `case`, … */
	vocabulary: Record<string, string>;
	/** The guided path (GAP-2): three steps to a first reading, shown on the entry page until dismissed. */
	firstRun: FirstRunStep[];
}

/**
 * The terms the rail and the entry pages speak in the engineer's words.
 * Every lens answers each of them (`vocab` falls back to the engineer's
 * word), and the test holds that no lens maps one to nothing.
 */
export const VOCABULARY_TERMS = [
	'trip',
	'trips',
	'cell',
	'cells',
	'gate',
	'gates',
	'run',
	'runs',
	'campaign',
	'campaigns',
	'evaluator',
	'verdict',
	'incident',
	'drift',
	'workflow',
	'bot'
] as const;
export type VocabularyTerm = (typeof VOCABULARY_TERMS)[number];

const EVERYTHING: RailId[] = [
	'dashboard',
	'runs',
	'spec',
	'evals',
	'campaigns',
	'workflows',
	'evaluators',
	'scenarios',
	'sinks',
	'evidence',
	'playground',
	'policies',
	'bench',
	'telemetry',
	'monitor',
	'conduct',
	'model-risk',
	'experiments',
	'incidents',
	'safety-case',
	'assurance',
	'export',
	'guards'
];

const rest = (...taken: RailId[][]): RailId[] => {
	const seen = new Set(taken.flat());
	return EVERYTHING.filter((id) => !seen.has(id));
};

const ASSURANCE_FIRST: RailId[] = [
	'assurance',
	'experiments',
	'safety-case',
	'incidents',
	'export'
];
const ASSURANCE_EVIDENCE: RailId[] = ['campaigns', 'workflows', 'evidence'];
const BANK: RailId[] = ['playground', 'monitor'];
const CONDUCT_FIRST: RailId[] = ['conduct', 'incidents', 'playground', 'workflows', 'campaigns'];
const CONDUCT_RULES: RailId[] = ['policies', 'evaluators', 'scenarios', 'guards'];
const MODEL_RISK_FIRST: RailId[] = [
	'model-risk',
	'experiments',
	'telemetry',
	'campaigns',
	'evals',
	'evaluators'
];
const MODEL_RISK_EVIDENCE: RailId[] = ['workflows', 'evidence', 'export'];

export const LENSES: readonly Lens[] = [
	{
		id: 'engineer',
		name: 'Engineer',
		question: 'What did it do?',
		entry: '/workshop',
		rail: [{ group: 'Workshop', routes: EVERYTHING }],
		vocabulary: {},
		firstRun: [
			{ text: 'Build a bot in the Kit and play a run.', href: '/' },
			{
				text: 'Open the run in the Run Lab: every prompt, decision and action.',
				href: '/workshop/runs'
			},
			{ text: 'Run the baseline campaign and read the gates.', href: '/workshop/campaigns' }
		]
	},
	{
		id: 'assurance',
		name: 'Assurance',
		question: 'Is it under control?',
		entry: '/workshop/assurance',
		rail: [
			{ group: 'Assurance', routes: ASSURANCE_FIRST },
			{ group: 'Evidence', routes: ASSURANCE_EVIDENCE },
			{ group: 'The bank', routes: BANK },
			{ group: 'Everything else', routes: rest(ASSURANCE_FIRST, ASSURANCE_EVIDENCE, BANK) }
		],
		vocabulary: {
			trip: 'control intervention',
			trips: 'control interventions',
			cell: 'case',
			cells: 'cases',
			gate: 'control',
			gates: 'controls',
			verdict: 'evidence',
			// `trial`, not `experiment`: Experiments is a destination of its own since WP89 (`72-…` §5).
			campaign: 'trial',
			campaigns: 'trials',
			evaluator: 'check',
			bot: 'system'
		},
		firstRun: [
			{
				text: 'Read the register: which controls changed what, by how much, and how sure.',
				href: '/workshop/assurance'
			},
			{
				text: 'Read the safety case’s four claims and the incidents this period.',
				href: '/workshop/safety-case'
			},
			{ text: 'Download the assurance pack for the file.', href: '/workshop/export' }
		]
	},
	{
		id: 'conduct',
		name: 'Conduct',
		question: 'Were customers treated as the rules require?',
		entry: '/workshop/conduct',
		rail: [
			{ group: 'Conduct', routes: CONDUCT_FIRST },
			{ group: 'The rules', routes: CONDUCT_RULES },
			{ group: 'Everything else', routes: rest(CONDUCT_FIRST, CONDUCT_RULES) }
		],
		vocabulary: {
			trip: 'breach caught',
			trips: 'breaches caught',
			cell: 'customer',
			cells: 'customers',
			gate: 'obligation',
			gates: 'obligations',
			verdict: 'outcome',
			evaluator: 'obligation check',
			incident: 'treatment failure',
			bot: 'assistant'
		},
		firstRun: [
			{
				text: 'Read the four outcomes: each obligation’s pass rate and the customers it failed.',
				href: '/workshop/conduct'
			},
			{
				text: 'Open a desk in the Playground and read its cards — the rules the assistant is held to.',
				href: '/workshop/playground'
			},
			{
				text: 'Open a journey on Workflows and read each stage’s treatment of the customer.',
				href: '/workshop/workflows'
			}
		]
	},
	{
		id: 'model-risk',
		name: 'Model risk',
		question: 'Is it fair, and is it moving?',
		entry: '/workshop/model-risk',
		rail: [
			{ group: 'Model risk', routes: MODEL_RISK_FIRST },
			{ group: 'Evidence', routes: MODEL_RISK_EVIDENCE },
			{ group: 'The bank', routes: BANK },
			{ group: 'Everything else', routes: rest(MODEL_RISK_FIRST, MODEL_RISK_EVIDENCE, BANK) }
		],
		vocabulary: {
			trip: 'guardrail event',
			trips: 'guardrail events',
			cell: 'sample',
			cells: 'samples',
			gate: 'metric bound',
			gates: 'metric bounds',
			verdict: 'label',
			drift: 'distribution shift',
			bot: 'model'
		},
		firstRun: [
			{
				text: 'Read the fairness workbench: every metric with its interval and n, across a cohort.',
				href: '/workshop/model-risk'
			},
			{
				text: 'Open a campaign report’s fairness pane: every metric with its interval and n.',
				href: '/workshop/campaigns'
			},
			{
				text: 'Compare two reports side by side, gate by gate.',
				href: '/workshop/compare'
			}
		]
	}
];

export const DEFAULT_LENS: LensId = 'engineer';

export function lensById(id: string | undefined): Lens {
	return LENSES.find((lens) => lens.id === id) ?? (LENSES[0] as Lens);
}

/** A term in the lens's words; the engineer's word when the lens has no other. */
export function vocab(lens: Lens, term: string): string {
	return lens.vocabulary[term] ?? term;
}

/** A sentence with every `{term}` replaced by the lens's word. */
export function speak(lens: Lens, text: string): string {
	return text.replace(/\{([a-z-]+)\}/g, (_match, term: string) => vocab(lens, term));
}

/** The rail's labels in the engineer's words, so a lens can translate what it wants to. */
export const RAIL_LABELS: Record<RailId, string> = {
	dashboard: 'Bench',
	runs: 'Runs',
	spec: 'Spec lab',
	evals: 'Evals',
	campaigns: 'Campaigns',
	workflows: 'Workflows',
	evaluators: 'Evaluators',
	scenarios: 'Scenarios',
	sinks: 'Sinks',
	evidence: 'Evidence',
	playground: 'Playground',
	policies: 'Policies',
	bench: 'Test bench',
	telemetry: 'Telemetry',
	monitor: 'Monitor',
	conduct: 'Conduct',
	'model-risk': 'Model risk',
	experiments: 'Experiments',
	incidents: 'Incidents',
	'safety-case': 'Safety case',
	assurance: 'Assurance',
	export: 'Audit',
	guards: 'Guards'
};

/** The rail label a lens shows for a destination: `campaigns` reads *Experiments* to the board, *Campaigns* to the engineer. */
export function railLabel(lens: Lens, id: RailId): string {
	const term = id === 'campaigns' ? 'campaigns' : id === 'incidents' ? 'incident' : undefined;
	if (term && lens.vocabulary[term]) {
		const word = lens.vocabulary[term] as string;
		return id === 'incidents'
			? `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}s`
			: `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`;
	}
	return RAIL_LABELS[id];
}
