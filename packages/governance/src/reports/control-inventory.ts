import {
	CONTROL_ARTEFACT_IDS,
	CONTROL_GATE_KINDS,
	latestMeasurement,
	latestReviews,
	parseControlRef,
	reviewSubjectKey,
	type BenchmarkReport,
	type ControlEvidence,
	type ControlRef,
	type ControlRefKind,
	type CoverageStatus,
	type ErrorModel,
	type GuardrailCatalogue,
	type PackRegistry,
	type Review,
	type ReviewSubject,
	type ReviewerModel,
	type RunSummary
} from '@craftabot/core';
import { CONTROL_MECHANISMS } from '../controls/mechanisms.js';
import { GOVERNANCE_GUARDRAIL_IDS } from './control-map.js';
import type { ControlEffectivenessRow } from './control-effectiveness.js';

/**
 * **The Control Inventory** (WP133, `110-CONTROL-SUITE-PLAN.md` §4): one row
 * per control instance in the product — every guardrail component, card,
 * evaluator, reader, stack, mechanism, gate kind, knob, ceiling, model and
 * artefact — keyed by its control reference, with eight facets each folded
 * from where it is recorded and none typed in:
 *
 * - **coverage** — the catalogue entries that name it, directly or through
 *   the component it runs on (a card through `governance/policy-card`, a
 *   stack through its fits, a reader through the confidence gate);
 * - **built** — registered content, a declared mechanism, or a closed list's
 *   member;
 * - **fitted** — the shipped stacks, stage guards and configurations that
 *   carry it;
 * - **exercised** — whether it fired in the runs and campaign reports given;
 * - **measured** — its latest benchmark measurement, never a stand-in's;
 * - **effect** — the register's best verdict over the control-map rows that
 *   cite it (G103: an instance's effect is its rows', not its desk's);
 * - **reviewed** — the readings of the entries, rows, rights and models
 *   that describe it;
 * - **configurable** — the surfaces and the setting that turn it, or fixed.
 *
 * Deterministic over its input: rows in kind order, then by id.
 */
export interface ControlInventoryInput {
	registry: Pick<
		PackRegistry,
		| 'listGuardrailComponents'
		| 'getGuardrailComponent'
		| 'listPolicyCards'
		| 'getPolicyCard'
		| 'listEvaluators'
		| 'getEvaluator'
		| 'listReaders'
		| 'getReader'
		| 'listStacks'
		| 'getStack'
		| 'listControlMaps'
		| 'listDomains'
		| 'listWorlds'
		| 'listWorkflows'
		| 'getScenario'
		| 'getBrickKind'
	>;
	catalogue: GuardrailCatalogue;
	/** Guardrail ids the host installs beside `governance`'s own. */
	knownGuardrails?: readonly string[];
	/** The shipped campaign and experiment files, as JSON: what one fits and gates on counts as *fitted* there. */
	campaigns?: ReadonlyArray<{ id: string; campaign: unknown; kind?: 'campaign' | 'experiment' }>;
	/** Run summaries: a guardrail's trips by id (the *exercised* facet). */
	summaries?: readonly RunSummary[];
	/** Campaign reports' cells: evaluator verdicts and reader readings (the *exercised* facet). */
	campaignReports?: readonly InventoryCampaignReport[];
	/** Evaluation records: an evaluator's verdict over one run (the *exercised* facet). */
	evaluations?: ReadonlyArray<{ evaluatorId: string; result: { verdict?: string | undefined } }>;
	/** The register, folded (`controlEffectiveness`). */
	register?: readonly ControlEffectivenessRow[];
	benchmarks?: readonly BenchmarkReport[];
	reviews?: readonly Review[];
	errorModels?: readonly ErrorModel[];
	reviewerModels?: readonly ReviewerModel[];
}

/** The part of a campaign report the inventory reads — structural, so `governance` need not import `evals`. */
export interface InventoryCampaignReport {
	cells: ReadonlyArray<{
		evaluations?: Readonly<Record<string, 'pass' | 'fail' | 'inconclusive'>>;
		workflow?: { readings?: ReadonlyArray<{ readerId: string; gated: boolean }> };
	}>;
}

/** An instance's kind — a control reference's. */
export type InventoryKind = ControlRefKind;

/** A catalogue entry that names an instance. */
export interface InventoryEntryLink {
	id: string;
	name: string;
	status: CoverageStatus;
	/** The reference the link came through, when the instance inherits it (a card through its component). */
	via?: ControlRef;
}

/** A control-map row that cites an instance. */
export interface InventoryRowLink {
	mapId: string;
	ref: string;
	title: string;
}

/** One control instance with its eight facets. */
export interface ControlInventoryRow {
	ref: ControlRef;
	kind: InventoryKind;
	id: string;
	name: string;
	summary: string;
	/** The pack that ships it, from its qualified id; `governance` or `core` for the product's own. */
	pack: string;
	entries: InventoryEntryLink[];
	/**
	 * The first direct entry's status, or the first inherited one's; `uncatalogued`
	 * when none names it. A knob or a model is a setting or the simulation's
	 * apparatus, not a technique: the catalogue does not apply (`not-applicable`).
	 */
	coverage: CoverageStatus | 'uncatalogued';
	/** The control-map rows that cite it as evidence, or that a stack claims. */
	rows: InventoryRowLink[];
	built: 'registered' | 'mechanism' | 'declared';
	fitted: { state: 'fitted' | 'unfitted' | 'not-applicable'; where: string[]; note?: string };
	exercised: {
		state: 'fired' | 'not-fired' | 'not-run' | 'no-runs' | 'not-applicable';
		count?: number;
	};
	measured: {
		state: 'measured' | 'unmeasured' | 'not-applicable';
		recall?: number | null;
		precision?: number | null;
		benchmarkId?: string;
	};
	effect: {
		state: 'evidenced' | 'inconclusive' | 'untestable' | 'untested' | 'not-applicable';
		/** The register rows the verdict came from. */
		controlIds: string[];
		delta?: number;
		metricId?: string;
	};
	reviewed: {
		state: 'accepted' | 'amended' | 'rejected' | 'unread' | 'not-applicable';
		read: number;
		of: number;
	};
	configurable: {
		state: 'configurable' | 'fixed';
		surfaces: InventorySurface[];
		setting?: string;
	};
}

/** Where a person turns a control — the page maps each to its route. */
export type InventorySurface =
	| 'studio'
	| 'spec-lab'
	| 'policies'
	| 'campaigns'
	| 'experiments'
	| 'workflow'
	| 'gate'
	| 'kit'
	| 'readings'
	| 'harness';

const KIND_ORDER: readonly InventoryKind[] = [
	'component',
	'guardrail',
	'policy-card',
	'stack',
	'reader',
	'evaluator',
	'mechanism',
	'gate',
	'knob',
	'ceiling',
	'error-model',
	'reviewer-model',
	'artefact',
	'scenario',
	'brick-kind',
	'trace-guarantee'
];

/** The `safety/…` guardrails the built-in components compile to: one control, one row (the component's). */
const GUARDRAIL_COMPONENT: Readonly<Record<string, string>> = {
	'safety/step-budget': 'governance/step-budget',
	'safety/token-budget': 'governance/token-budget',
	'safety/action-blocklist': 'governance/action-blocklist',
	'safety/no-repetition': 'governance/no-repetition',
	'safety/approval-mode': 'governance/approval-mode'
};

const GUARDRAIL_NAMES: Readonly<Record<string, [string, string]>> = {
	'connector/tool-blocklist': [
		'The Connector’s scopes',
		'A service-line operation the Connector brick was not given is refused before it runs.'
	]
};

const GATE_NAMES: Readonly<Record<string, string>> = {
	'outcome-rate': 'How often a run ends as it should.',
	'evaluator-pass-rate': 'How often an evaluator passes.',
	'assertion-pass-rate': 'How often an assertion card holds.',
	metric: 'A run metric’s mean, median or maximum.',
	'no-regression': 'No worse than the stored baseline, within a tolerance.',
	'derived-metric': 'A rate derived from labels — recall, a false-freeze rate.',
	'label-rate': 'How often an evaluator gives a label.',
	parity: 'An outcome compared across cohorts or a matched pair, with its interval.',
	drift: 'A distribution compared with a reference window.'
};

const ARTEFACT_NAMES: Readonly<Record<string, string>> = {
	'agent-card': 'A machine-readable inventory of a built bot.',
	'kit-file-requires': 'The packs and versions a kit file was built from.',
	'campaign-report': 'A campaign’s cells, gates and summary.',
	'drift-series': 'The run series a drift statistic reads.',
	'incident-log': 'What went wrong, when, and the decision explained.',
	'safety-case': 'The structured argument with its evidence.',
	'trace-bundle': 'Runs bundled with their digests.',
	'assurance-pack': 'The SS1/23-shaped pack a reviewer opens with no app.'
};

const EFFECT_RANK = { evidenced: 0, inconclusive: 1, untestable: 2, untested: 3 } as const;

/** The mechanism that produces each artefact: an artefact is catalogued through it. */
const ARTEFACT_MECHANISM: Readonly<Record<string, ControlRef>> = {
	'agent-card': 'mechanism:core/agent-card',
	'kit-file-requires': 'mechanism:core/kit-requires',
	'campaign-report': 'mechanism:evals/campaign',
	'drift-series': 'mechanism:metrics/drift',
	'incident-log': 'mechanism:governance/incidents',
	'safety-case': 'mechanism:governance/safety-case',
	'trace-bundle': 'mechanism:core/trace',
	'assurance-pack': 'mechanism:governance/assurance-pack'
};

/** Kinds the catalogue does not describe: settings and the simulation's apparatus. */
const NOT_A_TECHNIQUE: readonly InventoryKind[] = ['knob', 'error-model', 'reviewer-model'];

/** The pack a qualified id belongs to: everything before the first `/`. */
const packOf = (id: string): string => id.split('/')[0] ?? id;

/** The register's key for a map row. */
const registerKey = (mapId: string, ref: string): string => `${mapId}/${ref}`;

/** A map row's evidence as the control reference the inventory keys it by, or `undefined` when it is not a control. */
export function evidenceRef(
	item: ControlEvidence,
	registry: Pick<PackRegistry, 'getGuardrailComponent'>
): ControlRef | undefined {
	switch (item.kind) {
		case 'policy-card':
			return `policy-card:${item.id}`;
		case 'evaluator':
			return `evaluator:${item.id}`;
		case 'gate':
			return `gate:${item.id}`;
		case 'artefact':
			return `artefact:${item.id}`;
		case 'egress':
			return `component:governance/egress-${item.id}`;
		case 'principal':
			return 'mechanism:core/principal';
		case 'trace-guarantee':
			return 'mechanism:core/trace';
		case 'guardrail': {
			const component = GUARDRAIL_COMPONENT[item.id];
			if (component) return `component:${component}`;
			if (registry.getGuardrailComponent(item.id)) return `component:${item.id}`;
			return `guardrail:${item.id}`;
		}
	}
}

/** A guardrail id on the trace (`guardrail.tripped.guardrailId`) as the instance it belongs to. */
export function tripRef(
	guardrailId: string,
	registry: Pick<PackRegistry, 'getGuardrailComponent' | 'getPolicyCard'>
): ControlRef {
	const hash = guardrailId.indexOf('#');
	if (hash > 0) {
		const cardId = guardrailId.slice(0, hash);
		if (registry.getPolicyCard(cardId)) return `policy-card:${cardId}`;
	}
	const component = GUARDRAIL_COMPONENT[guardrailId];
	if (component) return `component:${component}`;
	if (registry.getGuardrailComponent(guardrailId)) return `component:${guardrailId}`;
	if (registry.getPolicyCard(guardrailId)) return `policy-card:${guardrailId}`;
	return `guardrail:${guardrailId}`;
}

/** What a campaign file fits and gates on, read structurally so `governance` need not import `evals`. */
export function campaignUses(campaign: unknown): {
	stacks: string[];
	components: string[];
	cards: string[];
	evaluators: string[];
	gates: string[];
} {
	const uses = {
		stacks: new Set<string>(),
		components: new Set<string>(),
		cards: new Set<string>(),
		evaluators: new Set<string>(),
		gates: new Set<string>()
	};
	const record = (value: unknown): value is Record<string, unknown> =>
		typeof value === 'object' && value !== null && !Array.isArray(value);
	const walk = (value: unknown, key?: string) => {
		if (Array.isArray(value)) {
			for (const each of value) walk(each, key);
			return;
		}
		if (!record(value)) {
			if (typeof value !== 'string') return;
			if (key === 'evaluatorId' || key === 'evaluators') uses.evaluators.add(value);
			if (key === 'cardId' || key === 'policyCards') uses.cards.add(value);
			return;
		}
		if (key === 'guards') {
			if (typeof value['stack'] === 'string') uses.stacks.add(value['stack']);
			if (Array.isArray(value['components']))
				for (const component of value['components'])
					if (record(component) && typeof component['id'] === 'string')
						uses.components.add(component['id']);
		}
		if (key === 'require' && typeof value['kind'] === 'string') uses.gates.add(value['kind']);
		if (key === 'evaluators' && typeof value['id'] === 'string') uses.evaluators.add(value['id']);
		// The Safety brick fitted on a guard compiles to the built-in components (`14-…` §4.5).
		if (key === 'fit' && value['kind'] === 'starter/safety') {
			const config = record(value['config']) ? value['config'] : {};
			uses.components.add('governance/step-budget');
			if (Array.isArray(config['blockedActions']) && config['blockedActions'].length > 0)
				uses.components.add('governance/action-blocklist');
			if (typeof config['approval'] === 'string' && config['approval'] !== 'off')
				uses.components.add('governance/approval-mode');
		}
		for (const [childKey, child] of Object.entries(value)) walk(child, childKey);
	};
	walk(campaign);
	return {
		stacks: [...uses.stacks],
		components: [...uses.components],
		cards: [...uses.cards],
		evaluators: [...uses.evaluators],
		gates: [...uses.gates]
	};
}

/** **`controlInventory`**: every control instance with its eight facets. */
export function controlInventory(input: ControlInventoryInput): ControlInventoryRow[] {
	const { registry } = input;
	const rows = new Map<ControlRef, ControlInventoryRow>();
	const base = (
		kind: InventoryKind,
		id: string,
		name: string,
		summary: string,
		built: ControlInventoryRow['built']
	): ControlInventoryRow => ({
		ref: `${kind}:${id}`,
		kind,
		id,
		name,
		summary,
		pack:
			kind === 'mechanism' ? packOf(id) : ['gate', 'artefact'].includes(kind) ? 'core' : packOf(id),
		entries: [],
		coverage: 'uncatalogued',
		rows: [],
		built,
		fitted: { state: 'not-applicable', where: [] },
		exercised: { state: 'not-applicable' },
		measured: { state: 'not-applicable' },
		effect: { state: 'not-applicable', controlIds: [] },
		reviewed: { state: 'not-applicable', read: 0, of: 0 },
		configurable: { state: 'fixed', surfaces: [] }
	});
	const add = (row: ControlInventoryRow) => {
		if (!rows.has(row.ref)) rows.set(row.ref, row);
		return rows.get(row.ref)!;
	};

	// ------------------------------------------------------------ enumerate
	for (const component of registry.listGuardrailComponents()) {
		const row = add(
			base(
				'component',
				component.id,
				component.id,
				`A ${component.technique} component deciding at ${component.points.join(', ')}${component.connection ? `, over ${component.connection.wraps}` : ''}.`,
				'registered'
			)
		);
		row.configurable = {
			state: 'configurable',
			surfaces: ['studio', 'spec-lab'],
			setting: 'its fit’s settings in a stack'
		};
		row.fitted = { state: 'unfitted', where: [] };
	}
	const guardrailIds = [
		...GOVERNANCE_GUARDRAIL_IDS.filter((id) => !GUARDRAIL_COMPONENT[id]),
		...(input.knownGuardrails ?? [])
	];
	for (const id of new Set(guardrailIds)) {
		const [name, summary] = GUARDRAIL_NAMES[id] ?? [id, `A guardrail the host installs (${id}).`];
		const row = add(base('guardrail', id, name, summary, 'registered'));
		if (id === 'connector/tool-blocklist') {
			row.fitted = { state: 'fitted', where: ['the Connector brick'] };
			row.configurable = {
				state: 'configurable',
				surfaces: ['kit', 'spec-lab'],
				setting: 'the Connector’s scopes'
			};
		}
	}
	for (const card of registry.listPolicyCards()) {
		const row = add(
			base('policy-card', card.id, card.title, card.description ?? card.title, 'registered')
		);
		row.fitted = { state: 'unfitted', where: [] };
		row.configurable = {
			state: 'configurable',
			surfaces: ['studio', 'spec-lab', 'policies'],
			setting: 'fitted in a stack or on a stage; the card is the pack’s'
		};
	}
	for (const stack of registry.listStacks()) {
		const row = add(base('stack', stack.id, stack.name, stack.description, 'registered'));
		row.fitted = {
			state: 'unfitted',
			where: [],
			note: 'no shipped configuration, campaign or experiment names it; the Studio, the Spec Lab and ?stack= do'
		};
		row.configurable = {
			state: 'configurable',
			surfaces: ['studio', 'spec-lab', 'campaigns', 'experiments', 'gate'],
			setting:
				'derive and save in the Studio; name it on a bot, a campaign, an experiment or the Gate'
		};
	}
	for (const reader of registry.listReaders()) {
		const row = add(base('reader', reader.id, reader.name, reader.description, 'registered'));
		row.fitted = { state: 'unfitted', where: [] };
		row.configurable = {
			state: 'configurable',
			surfaces: ['workflow'],
			setting: 'the reader stage’s gate: threshold and else'
		};
	}
	for (const evaluator of registry.listEvaluators()) {
		const row = add(
			base('evaluator', evaluator.id, evaluator.name, evaluator.description, 'registered')
		);
		row.fitted = { state: 'unfitted', where: [] };
		row.configurable = {
			state: 'configurable',
			surfaces: ['campaigns'],
			setting: 'a campaign gates on it'
		};
	}
	for (const mechanism of CONTROL_MECHANISMS) {
		const row = add(
			base('mechanism', mechanism.id, mechanism.name, mechanism.summary, 'mechanism')
		);
		row.fitted = { state: 'not-applicable', where: [], note: 'fixed behaviour — always there' };
		if (mechanism.configuredBy)
			row.configurable = {
				state: 'configurable',
				surfaces: ['harness'],
				setting: mechanism.configuredBy
			};
	}
	for (const kind of CONTROL_GATE_KINDS) {
		const row = add(base('gate', kind, kind, GATE_NAMES[kind] ?? kind, 'declared'));
		row.fitted = { state: 'unfitted', where: [] };
		row.configurable = {
			state: 'configurable',
			surfaces: ['campaigns'],
			setting: 'a campaign’s gates'
		};
	}
	for (const world of registry.listWorlds()) {
		for (const knob of world.knobs ?? []) {
			const row = add(
				base(
					'knob',
					`${world.id}#${knob.id}`,
					`${knob.name} (${world.name})`,
					`${knob.description} Default ${String(knob.default)}${knob.values ? `; one of ${knob.values.join(', ')}` : ''}.`,
					'declared'
				)
			);
			row.fitted = { state: 'not-applicable', where: [] };
			row.configurable = {
				state: 'configurable',
				surfaces: ['experiments', 'campaigns', 'workflow'],
				setting: `config.knobs.${knob.id}`
			};
		}
	}
	for (const domain of registry.listDomains()) {
		for (const right of domain.decisionRights) {
			const row = add(
				base(
					'ceiling',
					`${domain.id}#${right.kind}`,
					`${right.kind} — Level ${right.ceiling}`,
					`${right.why} Measured as a breach rate; held for a person where a configuration enforces its ceilings.`,
					'declared'
				)
			);
			row.fitted = { state: 'unfitted', where: [] };
			row.configurable = {
				state: 'configurable',
				surfaces: ['workflow'],
				setting: 'WorkflowConfig.autonomy.ceilings'
			};
		}
	}
	for (const model of input.errorModels ?? []) {
		const row = add(base('error-model', model.id, model.name, model.description, 'registered'));
		row.configurable = {
			state: 'configurable',
			surfaces: ['readings'],
			setting: 'a reading amends its rate'
		};
	}
	for (const model of input.reviewerModels ?? []) {
		const row = add(base('reviewer-model', model.id, model.name, model.description, 'registered'));
		row.configurable = {
			state: 'configurable',
			surfaces: ['readings'],
			setting: 'a reading amends its rates'
		};
	}
	for (const id of CONTROL_ARTEFACT_IDS)
		add(base('artefact', id, id, ARTEFACT_NAMES[id] ?? id, 'declared'));

	// ------------------------------------------------------------ coverage
	const direct = new Map<ControlRef, InventoryEntryLink[]>();
	for (const entry of input.catalogue.entries) {
		const refs: string[] = [
			...(entry.coverage.componentIds ?? []).map((id) => `component:${id}`),
			...(entry.coverage.implementedBy ?? [])
		];
		for (const ref of refs) {
			const parsed = parseControlRef(ref);
			if (!parsed) continue;
			const key = ref as ControlRef;
			// A cited thing the fold does not enumerate itself — a scenario, a brick, an event type —
			// gets a row when it exists; a reference to registered content this host lacks gets none.
			if (!rows.has(key)) {
				const cited =
					parsed.kind === 'scenario'
						? registry.getScenario(parsed.id)?.title
						: parsed.kind === 'brick-kind'
							? registry.getBrickKind(parsed.id)?.name
							: parsed.kind === 'trace-guarantee'
								? parsed.id
								: undefined;
				if (cited !== undefined)
					add(
						base(
							parsed.kind,
							parsed.id,
							cited,
							`Cited by the catalogue as ${parsed.kind}.`,
							'declared'
						)
					);
			}
			const links = direct.get(key) ?? [];
			links.push({ id: entry.id, name: entry.name, status: entry.coverage.status });
			direct.set(key, links);
		}
	}
	const inherit = (row: ControlInventoryRow, via: ControlRef) => {
		for (const link of direct.get(via) ?? [])
			if (!row.entries.some((each) => each.id === link.id)) row.entries.push({ ...link, via });
	};
	for (const row of rows.values()) row.entries.push(...(direct.get(row.ref) ?? []));
	for (const row of rows.values()) {
		if (row.kind === 'policy-card') inherit(row, 'component:governance/policy-card');
		if (row.kind === 'reader') inherit(row, 'mechanism:workflow/reader-gate');
		if (row.kind === 'ceiling') inherit(row, 'mechanism:workflow/autonomy-ceilings');
		if (row.kind === 'gate') inherit(row, 'mechanism:evals/campaign');
		if (row.kind === 'artefact' && ARTEFACT_MECHANISM[row.id])
			inherit(row, ARTEFACT_MECHANISM[row.id]!);
		if (row.kind === 'stack') {
			const stack = registry.getStack(row.id);
			for (const fit of stack?.fit ?? []) inherit(row, `component:${fit.componentId}`);
		}
	}
	for (const row of rows.values()) {
		const first = row.entries.find((link) => !link.via) ?? row.entries[0];
		row.coverage = first
			? first.status
			: NOT_A_TECHNIQUE.includes(row.kind)
				? 'not-applicable'
				: 'uncatalogued';
	}

	// ------------------------------------------------------------ control-map rows
	for (const map of registry.listControlMaps()) {
		for (const mapRow of map.rows) {
			const link = { mapId: map.id, ref: mapRow.ref, title: mapRow.title };
			for (const item of mapRow.evidence) {
				const ref = evidenceRef(item, registry);
				const row = ref ? rows.get(ref) : undefined;
				if (row && !row.rows.some((each) => each.mapId === map.id && each.ref === mapRow.ref))
					row.rows.push(link);
			}
		}
	}
	const mapRowTitle = new Map<string, InventoryRowLink>();
	for (const map of registry.listControlMaps())
		for (const mapRow of map.rows)
			mapRowTitle.set(registerKey(map.id, mapRow.ref), {
				mapId: map.id,
				ref: mapRow.ref,
				title: mapRow.title
			});
	for (const stack of registry.listStacks()) {
		const row = rows.get(`stack:${stack.id}`);
		for (const claim of stack.controls ?? []) {
			const link = mapRowTitle.get(claim);
			if (
				row &&
				link &&
				!row.rows.some((each) => each.mapId === link.mapId && each.ref === link.ref)
			)
				row.rows.push(link);
		}
	}

	// ------------------------------------------------------------ fitted
	const fit = (ref: ControlRef, where: string) => {
		const row = rows.get(ref);
		if (!row || row.fitted.state === 'not-applicable') return;
		if (!row.fitted.where.includes(where)) row.fitted.where.push(where);
		row.fitted.state = 'fitted';
	};
	for (const stack of registry.listStacks()) {
		for (const each of stack.fit) {
			fit(`component:${each.componentId}`, `stack ${stack.id}`);
			const config = each.config as { cardId?: unknown; evaluatorId?: unknown } | undefined;
			if (typeof config?.cardId === 'string')
				fit(`policy-card:${config.cardId}`, `stack ${stack.id}`);
			if (typeof config?.evaluatorId === 'string')
				fit(`evaluator:${config.evaluatorId}`, `stack ${stack.id}`);
		}
		for (const breaker of stack.group?.breakOn ?? [])
			fit(`evaluator:${breaker.evaluatorId}`, `stack ${stack.id} (breaks on it)`);
	}
	for (const workflow of registry.listWorkflows()) {
		for (const stage of workflow.stages) {
			const at = `${workflow.id} · ${stage.id}`;
			for (const cardId of stage.guards?.policyCards ?? [])
				fit(`policy-card:${cardId}`, `stage ${at}`);
			for (const component of stage.guards?.components ?? [])
				fit(`component:${component.id}`, `stage ${at}`);
			if (stage.executor.kind === 'reader')
				fit(`reader:${stage.executor.readerId}`, `${at}${stage.executor.gate ? ' (gated)' : ''}`);
		}
		for (const [name, config] of Object.entries(workflow.configurations ?? {})) {
			const at = `${workflow.id} · ${name}`;
			if (config.stack) fit(`stack:${config.stack}`, at);
			for (const stackId of Object.values(config.stageStacks ?? {})) fit(`stack:${stackId}`, at);
			for (const executor of Object.values(config.executors ?? {}))
				if (executor.kind === 'reader')
					fit(`reader:${executor.readerId}`, `${at}${executor.gate ? ' (gated)' : ''}`);
			for (const kind of Object.keys(config.autonomy?.ceilings ?? {}))
				for (const domain of registry.listDomains()) fit(`ceiling:${domain.id}#${kind}`, at);
		}
	}

	for (const { id, campaign, kind } of input.campaigns ?? []) {
		const uses = campaignUses(campaign);
		const at = `${kind ?? 'campaign'} ${id}`;
		for (const stackId of uses.stacks) fit(`stack:${stackId}`, at);
		for (const componentId of uses.components) fit(`component:${componentId}`, at);
		for (const cardId of uses.cards) fit(`policy-card:${cardId}`, at);
		for (const evaluatorId of uses.evaluators) fit(`evaluator:${evaluatorId}`, at);
		for (const kind of uses.gates) fit(`gate:${kind}`, at);
	}

	// ------------------------------------------------------------ exercised
	const sawRuns =
		(input.summaries?.length ?? 0) +
			(input.campaignReports?.length ?? 0) +
			(input.evaluations?.length ?? 0) >
		0;
	const fired = new Map<ControlRef, number>();
	const seen = new Set<ControlRef>();
	for (const summary of input.summaries ?? [])
		for (const [guardrailId, count] of Object.entries(summary.guardrailTrips)) {
			const ref = tripRef(guardrailId, registry);
			fired.set(ref, (fired.get(ref) ?? 0) + count);
		}
	for (const report of input.campaignReports ?? [])
		for (const cell of report.cells) {
			for (const [evaluatorId, verdict] of Object.entries(cell.evaluations ?? {})) {
				const ref: ControlRef = `evaluator:${evaluatorId}`;
				seen.add(ref);
				if (verdict === 'fail') fired.set(ref, (fired.get(ref) ?? 0) + 1);
			}
			for (const reading of cell.workflow?.readings ?? []) {
				const ref: ControlRef = `reader:${reading.readerId}`;
				seen.add(ref);
				if (reading.gated) fired.set(ref, (fired.get(ref) ?? 0) + 1);
			}
		}
	for (const record of input.evaluations ?? []) {
		const ref: ControlRef = `evaluator:${record.evaluatorId}`;
		seen.add(ref);
		if (record.result.verdict === 'fail') fired.set(ref, (fired.get(ref) ?? 0) + 1);
	}
	for (const row of rows.values()) {
		const exercisable = ['component', 'guardrail', 'policy-card', 'evaluator', 'reader'].includes(
			row.kind
		);
		if (!exercisable) continue;
		if (!sawRuns) {
			row.exercised = { state: 'no-runs' };
			continue;
		}
		const count = fired.get(row.ref) ?? 0;
		if (count > 0) row.exercised = { state: 'fired', count };
		else if (row.kind === 'evaluator' || row.kind === 'reader')
			row.exercised = { state: seen.has(row.ref) ? 'not-fired' : 'not-run' };
		else row.exercised = { state: 'not-fired', count: 0 };
	}

	// ------------------------------------------------------------ measured
	const benchmarked = new Set<string>();
	for (const report of input.benchmarks ?? [])
		for (const subject of report.subjects) {
			benchmarked.add(subject.id);
			if (subject.componentId) benchmarked.add(subject.componentId);
		}
	for (const row of rows.values()) {
		if (row.kind !== 'component' && row.kind !== 'reader') continue;
		const component = row.kind === 'component' ? registry.getGuardrailComponent(row.id) : undefined;
		const measurable =
			benchmarked.has(row.id) || row.kind === 'reader' || component?.connection !== undefined;
		if (!measurable) continue;
		const latest = latestMeasurement(input.benchmarks ?? [], row.id);
		row.measured = latest
			? {
					state: 'measured',
					recall: latest.subject.recall.value,
					precision: latest.subject.precision.value,
					benchmarkId: latest.report.id
				}
			: { state: 'unmeasured' };
	}

	// ------------------------------------------------------------ effect
	const register = new Map((input.register ?? []).map((each) => [each.controlId, each]));
	for (const row of rows.values()) {
		if (row.rows.length === 0) {
			if (
				['component', 'guardrail', 'policy-card', 'stack', 'evaluator', 'reader'].includes(row.kind)
			)
				row.effect = { state: 'untested', controlIds: [] };
			continue;
		}
		const found = row.rows
			.map((link) => register.get(registerKey(link.mapId, link.ref)))
			.filter((each): each is ControlEffectivenessRow => each !== undefined)
			.sort((a, b) => EFFECT_RANK[a.status] - EFFECT_RANK[b.status]);
		const best = found[0];
		row.effect = best
			? {
					state: best.status,
					controlIds: found
						.filter((each) => each.status === best.status)
						.map((each) => each.controlId),
					...(best.headline ? { delta: best.headline.delta, metricId: best.headline.metricId } : {})
				}
			: { state: 'untested', controlIds: [] };
	}

	// ------------------------------------------------------------ reviewed
	const latest = latestReviews(input.reviews ?? []);
	const entryReview = new Map(input.catalogue.entries.map((entry) => [entry.id, entry.review]));
	for (const row of rows.values()) {
		const subjects: Array<{ subject: ReviewSubject; shipsReviewed: boolean }> = [];
		for (const link of row.entries)
			if (!link.via)
				subjects.push({
					subject: { kind: 'catalogue-entry', id: link.id },
					shipsReviewed: entryReview.get(link.id) === 'reviewed'
				});
		for (const link of row.rows)
			subjects.push({
				subject: { kind: 'control-row', id: `${link.mapId}#${link.ref}` },
				shipsReviewed: false
			});
		if (row.kind === 'ceiling')
			subjects.push({ subject: { kind: 'decision-right', id: row.id }, shipsReviewed: false });
		if (row.kind === 'error-model' || row.kind === 'reviewer-model')
			subjects.push({ subject: { kind: row.kind, id: row.id }, shipsReviewed: false });
		if (subjects.length === 0) continue;
		const verdicts = subjects.map(({ subject, shipsReviewed }) =>
			shipsReviewed ? 'accepted' : (latest.get(reviewSubjectKey(subject))?.verdict ?? 'unread')
		);
		const read = verdicts.filter((verdict) => verdict !== 'unread').length;
		const state = verdicts.includes('rejected')
			? 'rejected'
			: read < verdicts.length
				? 'unread'
				: verdicts.includes('amended')
					? 'amended'
					: 'accepted';
		row.reviewed = { state, read, of: verdicts.length };
	}

	return [...rows.values()].sort(
		(a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.id.localeCompare(b.id)
	);
}

/** One count per facet value, over the inventory — the page's readouts. */
export interface ControlInventorySummary {
	rows: number;
	byKind: Partial<Record<InventoryKind, number>>;
	uncatalogued: number;
	unfitted: number;
	fired: number;
	measured: number;
	evidenced: number;
	unread: number;
	configurable: number;
}

/** The inventory's readouts: rows by kind and each facet's headline count. */
export function controlInventorySummary(
	rows: readonly ControlInventoryRow[]
): ControlInventorySummary {
	const byKind: Partial<Record<InventoryKind, number>> = {};
	for (const row of rows) byKind[row.kind] = (byKind[row.kind] ?? 0) + 1;
	return {
		rows: rows.length,
		byKind,
		uncatalogued: rows.filter((row) => row.coverage === 'uncatalogued').length,
		unfitted: rows.filter((row) => row.fitted.state === 'unfitted').length,
		fired: rows.filter((row) => row.exercised.state === 'fired').length,
		measured: rows.filter((row) => row.measured.state === 'measured').length,
		evidenced: rows.filter((row) => row.effect.state === 'evidenced').length,
		unread: rows.filter((row) => row.reviewed.state === 'unread').length,
		configurable: rows.filter((row) => row.configurable.state === 'configurable').length
	};
}

/** What each surface is called, in words a reader knows. */
export const INVENTORY_SURFACE_LABELS: Readonly<Record<InventorySurface, string>> = {
	studio: 'the Studio',
	'spec-lab': 'the Spec Lab',
	policies: 'Policies',
	campaigns: 'Campaigns',
	experiments: 'Experiments',
	workflow: 'the journey’s configuration',
	gate: 'the Gate (craftabot gate serve)',
	kit: 'the Kit',
	readings: 'Readings',
	harness: 'the harness'
};

/** Each kind's name, for a heading or a column. */
export const INVENTORY_KIND_LABELS: Readonly<Record<InventoryKind, string>> = {
	component: 'Component',
	guardrail: 'Guardrail',
	'policy-card': 'Policy card',
	evaluator: 'Evaluator',
	reader: 'Reader',
	scenario: 'Scenario',
	stack: 'Stack',
	'brick-kind': 'Brick',
	'error-model': 'Error model',
	'reviewer-model': 'Reviewer model',
	ceiling: 'Ceiling',
	knob: 'Knob',
	gate: 'Gate kind',
	'trace-guarantee': 'Trace guarantee',
	artefact: 'Artefact',
	mechanism: 'Mechanism'
};

/** The facets a row is worded by, in the order the page and the export show them. */
export type InventoryFacet =
	'coverage' | 'fitted' | 'exercised' | 'measured' | 'effect' | 'reviewed' | 'configurable';

const percent = (value: number | null | undefined) =>
	value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`;
const signedDelta = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(3)}`;

/** **`controlFacetWords`**: each facet of a row in words — what the page's table, the drawer and the export print. */
export function controlFacetWords(row: ControlInventoryRow): Record<InventoryFacet, string> {
	const fitted =
		row.fitted.state === 'fitted'
			? `fitted in ${row.fitted.where.length}`
			: row.fitted.state === 'unfitted'
				? 'unfitted'
				: '—';
	const exercised = {
		fired: `fired ×${row.exercised.count ?? 0}`,
		'not-fired': 'not fired',
		'not-run': 'not run',
		'no-runs': 'no runs stored',
		'not-applicable': '—'
	}[row.exercised.state];
	const measured =
		row.measured.state === 'measured'
			? `recall ${percent(row.measured.recall)} · precision ${percent(row.measured.precision)}`
			: row.measured.state === 'unmeasured'
				? 'unmeasured'
				: '—';
	const effect =
		row.effect.state === 'not-applicable'
			? '—'
			: row.effect.delta !== undefined
				? `${row.effect.state} ${signedDelta(row.effect.delta)}${row.effect.metricId ? ` (${row.effect.metricId})` : ''}`
				: row.effect.state;
	const reviewed =
		row.reviewed.state === 'not-applicable'
			? '—'
			: row.reviewed.state === 'unread'
				? `${row.reviewed.read} of ${row.reviewed.of} read`
				: row.reviewed.state;
	const configurable =
		row.configurable.state === 'fixed'
			? 'fixed'
			: row.configurable.surfaces.map((surface) => INVENTORY_SURFACE_LABELS[surface]).join(', ') ||
				(row.configurable.setting ?? 'configurable');
	const coverage = row.coverage === 'not-applicable' ? 'not applicable' : row.coverage;
	return { coverage, fitted, exercised, measured, effect, reviewed, configurable };
}

/** The export file's format name. */
export const CONTROL_INVENTORY_FORMAT = 'craftabot-control-inventory' as const;

/** The inventory as a file (`craftabot controls export`): the rows, their summary and when it was folded. */
export interface ControlInventoryExport {
	format: typeof CONTROL_INVENTORY_FORMAT;
	formatVersion: 1;
	generatedAt: string;
	summary: ControlInventorySummary;
	rows: ControlInventoryRow[];
}

/** The inventory as the export file: the rows with their summary, stamped when folded. */
export function controlInventoryExport(
	rows: readonly ControlInventoryRow[],
	generatedAt: string
): ControlInventoryExport {
	return {
		format: CONTROL_INVENTORY_FORMAT,
		formatVersion: 1,
		generatedAt,
		summary: controlInventorySummary(rows),
		rows: [...rows]
	};
}

const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** **`renderControlInventoryMarkdown`**: the inventory for a reader with no app — one table per kind, every facet in words. */
export function renderControlInventoryMarkdown(file: ControlInventoryExport): string {
	const { summary } = file;
	const out: string[] = [
		'# The Control Inventory',
		'',
		`> Folded ${file.generatedAt} by \`craftabot controls export\` (WP134, \`docs/design-day2/110-CONTROL-SUITE-PLAN.md\` §4). ${summary.rows} controls — ${summary.uncatalogued} uncatalogued, ${summary.unfitted} unfitted, ${summary.fired} fired in the stored runs, ${summary.measured} measured, ${summary.evidenced} with an evidenced effect, ${summary.unread} unread. Every facet is folded from where it is recorded; nothing here is typed in.`,
		''
	];
	const kinds = [...new Set(file.rows.map((row) => row.kind))];
	for (const kind of kinds) {
		const rows = file.rows.filter((row) => row.kind === kind);
		out.push(`## ${INVENTORY_KIND_LABELS[kind]} (${rows.length})`, '');
		out.push(
			'| Control | Catalogue | Fitted | Exercised | Measured | Effect | Read | Turned in |',
			'|---|---|---|---|---|---|---|---|'
		);
		for (const row of rows) {
			const words = controlFacetWords(row);
			out.push(
				`| **${cell(row.name)}** (\`${row.ref}\`) — ${cell(row.summary)} | ${words.coverage}${row.entries.length > 0 ? ` (${row.entries.map((entry) => entry.id).join(', ')})` : ''} | ${cell(words.fitted)}${row.fitted.where.length > 0 ? `: ${cell(row.fitted.where.join('; '))}` : ''} | ${words.exercised} | ${words.measured} | ${words.effect} | ${words.reviewed} | ${cell(words.configurable)}${row.configurable.setting ? ` — ${cell(row.configurable.setting)}` : ''} |`
			);
		}
		out.push('');
	}
	return out.join('\n');
}
