import {
	CRAFTABOT_CORE_VERSION,
	brickKindsFor,
	buildAgentCard,
	buildKitFile,
	capabilitiesOf,
	type AgentCard,
	type AgentRecord,
	type AnyAgentSpec,
	type ControlEvidence,
	type ControlMap,
	type ControlMapRow,
	type EngineEvent,
	type EvaluationRecord,
	type PackRegistry,
	type RunRecord,
	type RunSummary,
	type Storage
} from '@craftabot/core';
import { campaignEvidenceFor, type CampaignEvidence } from './campaign-evidence.js';
import { driftIn, telemetrySeries, type DriftFlag, type TelemetryBucket } from './drift.js';
import { explanationsForTicks, type DecisionExplanation } from './decision-explanation.js';
import { incidentsFromSummaries, type Incident } from './incidents.js';
import { ensureRunSummaries } from './run-summaries.js';
import {
	safetyCaseFromSummaries,
	type EvaluationEvidence,
	type SafetyCase
} from './safety-case.js';

/**
 * **The assurance pack** (WP67, `53-ASSURANCE-PACK.md` §4.2; `41-…` §6.7):
 * one bot's evidence, folded from what the store already holds and the
 * registry already knows, filed against the control maps and sectioned by
 * PRA SS1/23's principles with the Consumer Duty's outcomes as the second
 * axis. A fold, not a form: nothing is authored into it, nothing invented,
 * and every number carries the run or report ids it came from. What a
 * later WP records (who validated — WP65; what a decision saw — WP66) is
 * laid out as *not recorded in this build*, so the shape holds. Relevance,
 * never compliance: the posture sentence rides in the pack itself.
 */
/** The `format` field of a pack file. */
export const ASSURANCE_PACK_FORMAT = 'craftabot-assurance-pack';
/** The pack's own format version. */
export const ASSURANCE_PACK_VERSION = 1;

/** The sentence every rendering opens and closes with. */
export const ASSURANCE_POSTURE =
	'This pack files evidence against obligations as claims of relevance. It is not a claim of compliance with any of them, and the simulator it describes controls nothing real.';

/** A section a later work package fills in — present now so the document keeps its shape. */
export interface NotRecorded {
	recorded: false;
	note: string;
}

/** The campaign report fields the pack reads — structural, so `governance` need not import `@craftabot/evals`. */
export interface AssuranceCampaignReportLike {
	id: string;
	campaignId?: string | undefined;
	campaignTitle: string;
	createdAt: string;
	passed: boolean;
	builds?: ReadonlyArray<{
		id: string;
		agentId?: string | undefined;
		agentName?: string | undefined;
	}>;
	cells: ReadonlyArray<{
		build: string;
		outcome?: string | undefined;
		runId?: string | undefined;
		cohort?: Record<string, string> | undefined;
		/** What the drift series reads (`DriftReportLike`): the cell's verdicts, labels and case metrics. */
		evaluations: Readonly<Record<string, 'pass' | 'fail' | 'inconclusive'>>;
		labels?: Readonly<Record<string, string>> | undefined;
		caseMetrics?: Readonly<Record<string, number>> | undefined;
	}>;
	gates: ReadonlyArray<{
		id: string;
		kind?: string | undefined;
		required: string;
		observed?: number | undefined;
		passed: boolean;
		matched?: boolean | undefined;
		values?: Record<string, number> | undefined;
		where?: { build?: string | undefined } | undefined;
	}>;
	summary?:
		| {
				matrices: ReadonlyArray<{
					evaluatorId: string;
					slice: Record<string, string | undefined>;
					tp: number;
					fp: number;
					tn: number;
					fn: number;
					precision?: number | undefined;
					recall?: number | undefined;
					falsePositiveRate?: number | undefined;
				}>;
				cohorts: ReadonlyArray<{
					attribute: string;
					value: string;
					cells: number;
					successRate: number;
				}>;
				obligations: ReadonlyArray<{ tag: string; cells: number; successRate: number }>;
		  }
		| undefined;
}

/** One campaign's evidence for this bot: the gates that applied, the matrices, cohorts, obligations and parity caveats, and the runs behind them. */
export interface AssuranceCampaign extends CampaignEvidence {
	campaignId: string | undefined;
	/** The run ids behind every cell of this bot's build — the citation for every number in this section. */
	runIds: string[];
	matrices: NonNullable<AssuranceCampaignReportLike['summary']>['matrices'];
	cohorts: NonNullable<AssuranceCampaignReportLike['summary']>['cohorts'];
	obligations: NonNullable<AssuranceCampaignReportLike['summary']>['obligations'];
	/** Every parity verdict, with the campaign's own claim about its cohorts repeated — the caveat the pack quotes. */
	parity: Array<{
		id: string;
		passed: boolean;
		matched: boolean;
		values: Record<string, number>;
		required: string;
	}>;
}

/** What this build shows of an evidence item: fitted, judged or run (`present`); registered but unused by this bot (`available`); a pending row's; a record a later WP writes; or dangling. */
export type EvidencePresence = 'present' | 'available' | 'pending' | 'not-recorded' | 'unresolved';

/** A control row's evidence item, annotated with its presence in this build. */
export interface AssuranceEvidence extends ControlEvidence {
	presence: EvidencePresence;
}

/** A control row as the pack files it, its evidence annotated. */
export interface AssuranceControlRow extends Omit<ControlMapRow, 'evidence'> {
	evidence: AssuranceEvidence[];
}

/** A registered control map as the pack files it. */
export interface AssuranceControlMap {
	id: string;
	title: string;
	description: string;
	rows: AssuranceControlRow[];
}

/** An evaluator's counts over this bot's runs, with the runs they are over. */
export interface AssuranceEvaluation extends EvaluationEvidence {
	/** The runs the counts are over. */
	runIds: string[];
}

/** One Consumer Duty outcome: the control rows tagged with it and the evaluator evidence those rows name. */
export interface AssuranceOutcome {
	tag: string;
	title: string;
	/** `<mapId>/<ref>` of every control row tagged with this outcome. */
	rows: string[];
	/** The evaluator evidence those rows name, over this bot's runs. */
	evaluations: AssuranceEvaluation[];
}

/** The pack itself — v1 (`53-…` §4.2), sectioned by SS1/23's principles. */
export interface AssurancePack {
	format: typeof ASSURANCE_PACK_FORMAT;
	formatVersion: typeof ASSURANCE_PACK_VERSION;
	generatedAt: string;
	/** SHA-256 over the canonical JSON of everything here but `digest` and `generatedAt`. */
	digest: string;
	posture: string;
	bot: { id: string; name: string; goalCardId: string; worldId?: string; purpose?: string };
	review: { rows: number; reviewed: number; unreviewed: number; pending: number };
	/** SS1/23 principle 1 — identification and classification: the inventory entry. */
	inventory: {
		agentCard: AgentCard;
		requires: { core: string; packs: Record<string, string>; brickKinds: Record<string, string> };
		packVersions: Record<string, string>;
		world?: { id: string; name: string; purpose?: string };
		goalCard?: { id: string; title: string };
	};
	/** Principle 2 — governance: the safety stack, approvals, egress, the principal. */
	governance: {
		guardrails: string[];
		approvals: { requested: number; granted: number; runIds: string[] };
		egress: { hosts: string[]; recordedRuns: number; noNetworkRuns: number; runIds: string[] };
		principal: NotRecorded;
	};
	/** Principle 3 — development, implementation and use: the campaigns as test evidence. */
	development: { campaigns: AssuranceCampaign[]; note?: string };
	/** Principle 4 — independent validation. */
	validation: { validatedBy: NotRecorded; evaluations: AssuranceEvaluation[]; note?: string };
	/** Principle 5 — risk mitigants. */
	mitigants: {
		inability: string[];
		reach: string[];
		guardrails: string[];
		killSwitch: string;
		hostedScreening: SafetyCase['hostedScreening'];
	};
	/** Ongoing monitoring: the series, its flags, the incidents — each with its findings' decisions explained (WP66). */
	monitoring: {
		series: TelemetryBucket[];
		drift: DriftFlag[];
		incidents: Array<Incident & { explanations: DecisionExplanation[] }>;
		/** Whether the host handed the incidents' traces in; the harness and the Workshop do. */
		explanations: NotRecorded | { recorded: true; note: string };
		note?: string;
	};
	/** The Consumer Duty's four outcomes as the second axis. */
	outcomes: AssuranceOutcome[];
	controlMaps: AssuranceControlMap[];
	/** The appendix every citation points into. */
	runs: Array<{ id: string; startedAt: string; outcome: string | undefined; goalCardId: string }>;
}

/** What `assurancePackFor` folds: the bot, the registry, and what the store holds about it. */
export interface AssurancePackInput {
	agent: { id: string; name: string; spec: AnyAgentSpec };
	registry: PackRegistry;
	runs: readonly RunRecord[];
	summaries: ReadonlyMap<string, RunSummary>;
	evaluations: readonly EvaluationRecord[];
	campaignReports: readonly AssuranceCampaignReportLike[];
	/** Every control map to file against — the registry's, by default. */
	controlMaps?: readonly ControlMap[];
	/** The traces of the runs the incident log names (WP66), so each finding's decision can be explained; absent, the section says so. */
	incidentEvents?: ReadonlyMap<string, readonly EngineEvent[]>;
	/** Injected so a pack is reproducible; the digest does not cover it. */
	now?: () => string;
}

const CONSUMER_DUTY: ReadonlyArray<{ tag: string; title: string }> = [
	{ tag: 'fca:cd:products-services', title: 'Products and services' },
	{ tag: 'fca:cd:price-value', title: 'Price and value' },
	{ tag: 'fca:cd:understanding', title: 'Consumer understanding' },
	{ tag: 'fca:cd:support', title: 'Consumer support' }
];

const notRecorded = (what: string, wp: string): NotRecorded => ({
	recorded: false,
	note: `${what} is not recorded in this build (${wp}).`
});

/** Canonical JSON: keys sorted at every level, so the same pack digests the same. */
export function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
	if (value && typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>)
			.filter(([, v]) => v !== undefined)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
		return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
	}
	return JSON.stringify(value);
}

/** SHA-256 over the pack's canonical JSON, `digest` and `generatedAt` left out — so the same evidence digests the same. */
export async function assurancePackDigest(pack: Omit<AssurancePack, 'digest'>): Promise<string> {
	const { generatedAt: _generatedAt, ...covered } = pack;
	void _generatedAt;
	const data = new TextEncoder().encode(canonicalJson(covered));
	const hash = await crypto.subtle.digest('SHA-256', data);
	return Array.from(new Uint8Array(hash))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

function fittedPolicyCards(spec: AnyAgentSpec): Set<string> {
	const out = new Set<string>();
	const bricks = (spec as { bricks?: unknown }).bricks;
	const configs: unknown[] = Array.isArray(bricks)
		? bricks.map((brick) => (brick as { config?: unknown }).config)
		: Object.values((bricks ?? {}) as Record<string, unknown>);
	for (const config of configs) {
		const cards = (config as { policyCards?: unknown } | undefined)?.policyCards;
		if (Array.isArray(cards)) for (const card of cards) if (typeof card === 'string') out.add(card);
	}
	return out;
}

/** The fold (`53-…` §4.2): pure over its inputs, every number with its run ids, later WPs' sections present as *not recorded*. */
export async function assurancePackFor(input: AssurancePackInput): Promise<AssurancePack> {
	const { agent, registry, runs, summaries, evaluations, campaignReports } = input;
	const spec = agent.spec;
	const goalCardId = (spec as { goalCardId: string }).goalCardId;
	const goalCard = registry.getGoalCard(goalCardId);
	const world = goalCard ? registry.getWorld(goalCard.worldId) : undefined;
	const purpose = (world as { spec?: { purpose?: string } } | undefined)?.spec?.purpose;
	// Oldest first, by id within a day — so a store that lists newest first and a caller that lists by hand fold the same pack.
	const mine = runs
		.filter((run) => run.agentId === agent.id)
		.slice()
		.sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id));
	const mineIds = new Set(mine.map((run) => run.id));
	const safetyCase = safetyCaseFromSummaries(
		{ id: agent.id, name: agent.name, goalCardId },
		capabilitiesOf(spec, registry),
		world,
		registry.listTools(),
		mine,
		summaries,
		evaluations,
		campaignReports
	);
	const agentCard = buildAgentCard(spec, registry);
	const packVersions = Object.fromEntries(
		registry.listPacks().map((pack) => [pack.id, pack.version])
	);
	// The inventory entry's `requires` (WP52's ranges): the packs a fitted brick actually came from, at compatible later versions.
	const brickKinds = brickKindsFor(spec, registry);
	const packs: Record<string, string> = {};
	for (const packId of new Set(Object.values(brickKinds))) {
		const version = packVersions[packId];
		if (version !== undefined) packs[packId] = `^${version}`;
	}
	const kit = buildKitFile(spec, {
		exportedBy: 'assurance-pack',
		exportedAt: '1970-01-01T00:00:00.000Z',
		requires: { core: `>=${CRAFTABOT_CORE_VERSION}`, packs, brickKinds }
	});

	// Governance: approvals and egress, with the runs behind them.
	const approvalRuns = mine.filter((run) => (summaries.get(run.id)?.approvalsRequested ?? 0) > 0);
	const approvals = {
		requested: approvalRuns.reduce(
			(n, run) => n + (summaries.get(run.id)?.approvalsRequested ?? 0),
			0
		),
		granted: approvalRuns.reduce((n, run) => n + (summaries.get(run.id)?.approvalsGranted ?? 0), 0),
		runIds: approvalRuns.map((run) => run.id)
	};
	const egressRuns = mine.filter((run) => summaries.get(run.id)?.egress !== undefined);

	// Development: the campaigns, each with its matrices, cohorts, obligations and parity caveats.
	const evidence = campaignEvidenceFor(agent.id, campaignReports);
	const campaigns: AssuranceCampaign[] = evidence.map((entry) => {
		const report = campaignReports.find((candidate) => candidate.id === entry.reportId);
		const cells = (report?.cells ?? []).filter((cell) => cell.build === entry.buildId);
		return {
			...entry,
			campaignId: report?.campaignId,
			runIds: cells.map((cell) => cell.runId).filter((id): id is string => typeof id === 'string'),
			matrices: [...(report?.summary?.matrices ?? [])],
			cohorts: [...(report?.summary?.cohorts ?? [])],
			obligations: [...(report?.summary?.obligations ?? [])],
			parity: (report?.gates ?? [])
				.filter((gate) => gate.kind === 'parity')
				.map((gate) => ({
					id: gate.id,
					passed: gate.passed,
					matched: gate.matched === true,
					values: gate.values ?? {},
					required: gate.required
				}))
		};
	});

	// Validation: each evaluator's counts, with the runs they are over.
	const runsByEvaluator = new Map<string, string[]>();
	for (const record of evaluations) {
		if (!mineIds.has(record.runId)) continue;
		const list = runsByEvaluator.get(record.evaluatorId) ?? [];
		if (!list.includes(record.runId)) list.push(record.runId);
		runsByEvaluator.set(record.evaluatorId, list);
	}
	const evaluationRows: AssuranceEvaluation[] = safetyCase.evaluations.map((row) => ({
		...row,
		runIds: runsByEvaluator.get(row.evaluatorId) ?? []
	}));

	// Monitoring: the series over this bot's runs, the evaluations and the reports; the incidents.
	const series = telemetrySeries(mine, summaries, {
		evaluations: evaluations.filter((record) => mineIds.has(record.runId)),
		reports: campaignReports.filter((report) =>
			(report.builds ?? []).some((build) => build.agentId === agent.id)
		)
	});
	const capabilities = capabilitiesOf(spec, registry);
	const callsAvailable = [...capabilities.toolIds, ...capabilities.actionIds];
	const incidents = incidentsFromSummaries(mine, summaries).map((incident) => {
		const trace = input.incidentEvents?.get(incident.runId);
		return {
			...incident,
			explanations: trace
				? explanationsForTicks(
						trace,
						incident.findings.map((finding) => finding.tick),
						{ callsAvailable }
					)
				: []
		};
	});

	// The control maps, each evidence item annotated with what this build shows of it.
	const maps = input.controlMaps ?? registry.listControlMaps();
	const fitted = fittedPolicyCards(spec);
	const evaluated = new Set(runsByEvaluator.keys());
	const gateKinds = new Set(
		campaignReports.flatMap((report) => report.gates.map((gate) => gate.kind ?? ''))
	);
	const egressModes = new Set(mine.map((run) => summaries.get(run.id)?.egress?.mode));
	const artefactsPresent = new Set<string>([
		'agent-card',
		'kit-file-requires',
		'safety-case',
		'assurance-pack',
		...(campaigns.length > 0 ? ['campaign-report'] : []),
		...(series.length > 0 ? ['drift-series'] : []),
		...(incidents.length > 0 ? ['incident-log'] : [])
	]);
	const presenceOf = (item: ControlEvidence): EvidencePresence => {
		switch (item.kind) {
			case 'policy-card':
				if (!registry.getPolicyCard(item.id)) return 'unresolved';
				return fitted.has(item.id) ? 'present' : 'available';
			case 'evaluator':
				if (!registry.getEvaluator(item.id)) return 'unresolved';
				return evaluated.has(item.id) ? 'present' : 'available';
			case 'guardrail':
				return safetyCase.guardrails.includes(item.id) ? 'present' : 'available';
			case 'gate':
				return gateKinds.has(item.id) ? 'present' : 'available';
			case 'trace-guarantee':
				return mine.length > 0 ? 'present' : 'available';
			case 'egress':
				return egressModes.has(item.id as 'declared' | 'none') ? 'present' : 'available';
			case 'principal':
				return 'not-recorded';
			case 'artefact':
				return artefactsPresent.has(item.id) ? 'present' : 'available';
			default:
				return 'unresolved';
		}
	};
	const controlMaps: AssuranceControlMap[] = maps.map((map) => ({
		id: map.id,
		title: map.title,
		description: map.description,
		rows: map.rows.map((row) => ({
			...row,
			evidence:
				row.status === 'pending'
					? []
					: row.evidence.map((item) => ({ ...item, presence: presenceOf(item) }))
		}))
	}));
	const allRows = maps.flatMap((map) => map.rows.map((row) => ({ map, row })));
	const review = {
		rows: allRows.length,
		reviewed: allRows.filter(({ row }) => row.status === undefined).length,
		unreviewed: allRows.filter(({ row }) => row.status === 'unreviewed').length,
		pending: allRows.filter(({ row }) => row.status === 'pending').length
	};

	// The Consumer Duty's outcomes as the second axis.
	const outcomes: AssuranceOutcome[] = CONSUMER_DUTY.map(({ tag, title }) => {
		const tagged = allRows.filter(({ row }) => row.tags.includes(tag));
		const evaluatorIds = new Set(
			tagged.flatMap(({ row }) =>
				row.evidence.filter((item) => item.kind === 'evaluator').map((item) => item.id)
			)
		);
		return {
			tag,
			title,
			rows: tagged.map(({ map, row }) => `${map.id}/${row.ref}`),
			evaluations: evaluationRows.filter((row) => evaluatorIds.has(row.evaluatorId))
		};
	});

	const generatedAt = (input.now ?? (() => new Date().toISOString()))();
	const body: Omit<AssurancePack, 'digest'> = {
		format: ASSURANCE_PACK_FORMAT,
		formatVersion: ASSURANCE_PACK_VERSION,
		generatedAt,
		posture: ASSURANCE_POSTURE,
		bot: {
			id: agent.id,
			name: agent.name,
			goalCardId,
			...(world ? { worldId: world.id } : {}),
			...(purpose ? { purpose } : {})
		},
		review,
		inventory: {
			agentCard,
			requires: kit.requires,
			packVersions,
			...(world
				? { world: { id: world.id, name: world.name, ...(purpose ? { purpose } : {}) } }
				: {}),
			...(goalCard ? { goalCard: { id: goalCard.id, title: goalCard.title } } : {})
		},
		governance: {
			guardrails: [...safetyCase.guardrails],
			approvals,
			egress: { ...safetyCase.egress, runIds: egressRuns.map((run) => run.id) },
			principal: notRecorded('The principal on each run', 'WP65')
		},
		development: {
			campaigns,
			...(campaigns.length === 0
				? {
						note: 'No stored campaign report names a build of this bot: there is no campaign evidence yet.'
					}
				: {})
		},
		validation: {
			validatedBy: notRecorded('Who validated this build', 'WP65'),
			evaluations: evaluationRows,
			...(evaluationRows.length === 0
				? {
						note: 'No evaluator has judged a run of this bot yet: there is no evaluation evidence.'
					}
				: {})
		},
		mitigants: {
			inability: [...safetyCase.inability],
			reach: [...safetyCase.reach],
			guardrails: [...safetyCase.guardrails],
			killSwitch:
				'run.finished with STOPPED_BY_USER — a person can stop any run, and the trace records it.',
			hostedScreening: safetyCase.hostedScreening
		},
		monitoring: {
			series,
			drift: driftIn(series),
			incidents,
			explanations: input.incidentEvents
				? {
						recorded: true,
						note: 'Each incident’s findings carry the explanation of the decision made at that tick — what the bot saw, was offered, chose, and what checked it.'
					}
				: notRecorded('What each decision saw (the host handed no traces in)', 'WP66'),
			...(mine.length === 0
				? {
						note: 'This bot has no stored runs: there is no series to monitor and no incident to log.'
					}
				: {})
		},
		outcomes,
		controlMaps,
		runs: mine.map((run) => ({
			id: run.id,
			startedAt: run.startedAt,
			outcome: run.outcome,
			goalCardId: run.goalCardId
		}))
	};
	return { ...body, digest: await assurancePackDigest(body) };
}

/**
 * The pack from a store (`53-…` §4.2): the gathering the harness and the
 * Workshop share, so the two render the same document for the same bot —
 * the WP37 equality pattern. Reports that no longer parse are skipped, never
 * fabricated, by the caller's `parseReport`.
 */
export async function assurancePackFromStorage(
	agentId: string,
	storage: Storage,
	registry: PackRegistry,
	options: {
		parseReport?: (raw: unknown) => AssuranceCampaignReportLike | undefined;
		now?: () => string;
	} = {}
): Promise<AssurancePack> {
	const record: AgentRecord | undefined = await storage.getAgent(agentId);
	if (!record) throw new Error(`no bot '${agentId}' in the store`);
	const runs = (await storage.listRuns()).filter((run) => run.agentId === agentId);
	const summaries = await ensureRunSummaries(storage, runs);
	const evaluations = await storage.listAllEvaluations();
	const parse =
		options.parseReport ?? ((raw: unknown) => raw as AssuranceCampaignReportLike | undefined);
	const campaignReports: AssuranceCampaignReportLike[] = [];
	for (const row of await storage.listCampaignReports()) {
		try {
			const report = parse(row.report);
			if (report) campaignReports.push(report);
		} catch {
			// Skipped: the envelope is there, the report inside is not one this version reads.
		}
	}
	// The incidents' own traces (WP66), for the explanations — read for those runs only.
	const incidentEvents = new Map<string, EngineEvent[]>();
	for (const run of runs) {
		if ((summaries.get(run.id)?.findings.length ?? 0) === 0) continue;
		incidentEvents.set(
			run.id,
			(await storage.getEvents(run.id)).map((row) => row.event)
		);
	}
	return assurancePackFor({
		agent: { id: record.id, name: record.spec.name, spec: record.spec },
		registry,
		runs,
		summaries,
		evaluations,
		campaignReports,
		incidentEvents,
		...(options.now ? { now: options.now } : {})
	});
}
