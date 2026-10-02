import { engineEventSchema, EVENT_TYPES, type EventType } from '@craftabot/core';

/**
 * **The Sensor Inventory** (WP159, `112-REAL-ENOUGH-PLAN.md` §5): one row per
 * event type a run can carry — where it comes from, what it carries, who
 * reads it — so a sensor that goes quiet, or one nothing reads, is a finding
 * and not a surprise. The Control Inventory's twin: that one lists what
 * constrains a bot, this one lists what *records* it.
 *
 * The declaration table is typed `Record<EventType, …>`: a new event type
 * fails to compile until it is declared here. The fields are not declared at
 * all — they are walked off the payload schema, so the inventory cannot drift
 * from the schema it describes. What the harness sees fire is the coverage
 * test's (`harness/src/sensor-coverage.test.ts`); what a reader id's files
 * are is checked there too.
 */

/** Which part of the system writes the event. The last four are WP160's, named now so the table's type does not change then. */
export type SensorSource =
	'engine' | 'group' | 'workflow' | 'desk' | 'component' | 'seat' | 'reviewer' | 'gate';

/**
 * Whether the harness can make the event fire. `browser-only` is a stated
 * exception with its reason (a token stream the harness's providers do not
 * produce); the coverage test fails if one declared so does fire.
 */
export type SensorReach = { kind: 'harness' } | { kind: 'browser-only'; reason: string };

/** `listed` shows the event as a row; `folded` reads its fields into something. */
export type SensorReaderDepth = 'listed' | 'folded';

/** One place that reads events: its words, whether it lists or folds them, and the sources the harness holds the claim to. */
export interface SensorReader {
	label: string;
	depth: SensorReaderDepth;
	/** Repository-relative sources that read events of the types naming this reader; the harness checks each claim against them. */
	files: readonly string[];
}

/** Every place that reads events, by id. A row's `readBy` names these; each claim is checked against `files`. */
export const SENSOR_READERS = {
	'trace-list': {
		label: 'Run Lab trace list',
		depth: 'listed',
		files: ['apps/workbench/src/lib/trace-style.ts']
	},
	'run-lab': {
		label: 'Run Lab page',
		depth: 'folded',
		files: ['apps/workbench/src/routes/workshop/runs/[runId]/+page.svelte']
	},
	timeline: {
		label: 'Step timeline',
		depth: 'folded',
		files: ['apps/workbench/src/lib/workshop/timeline.ts']
	},
	narration: {
		label: 'Kit story strip',
		depth: 'folded',
		files: ['apps/workbench/src/lib/narration/narrate.ts']
	},
	'kit-session': {
		label: 'Kit live session state',
		depth: 'folded',
		files: [
			'apps/workbench/src/lib/state/session.svelte.ts',
			'apps/workbench/src/lib/state/session-group.svelte.ts',
			'apps/workbench/src/lib/fx-cue.ts'
		]
	},
	planner: {
		label: 'Planner checklist',
		depth: 'folded',
		files: ['apps/workbench/src/lib/state/planner-projection.ts']
	},
	explain: {
		label: 'Explain this decision',
		depth: 'folded',
		files: ['packages/governance/src/reports/decision-explanation.ts']
	},
	summary: {
		label: 'Run summary (incidents, safety case, telemetry)',
		depth: 'folded',
		files: [
			'packages/governance/src/reports/summary.ts',
			'packages/governance/src/reports/incidents.ts',
			'packages/governance/src/reports/failures.ts',
			'packages/governance/src/reports/safety-tally.ts'
		]
	},
	boundary: {
		label: 'Boundary map and verdict flow',
		depth: 'folded',
		files: [
			'packages/governance/src/reports/boundary.ts',
			'packages/governance/src/reports/verdict-flow.ts'
		]
	},
	'control-map': {
		label: 'Control map and inventory',
		depth: 'folded',
		files: [
			'packages/governance/src/reports/control-map.ts',
			'packages/governance/src/controls/mechanisms.ts'
		]
	},
	evaluators: {
		label: 'Evaluators and evaluation metrics',
		depth: 'folded',
		files: [
			'packages/governance/src/evaluators.ts',
			'packages/evals/src/metrics.ts',
			'packages/desk/src/metrics.ts'
		]
	},
	monitor: {
		label: 'The Monitor',
		depth: 'folded',
		files: ['packages/evals/src/monitor.ts']
	},
	guardrails: {
		label: 'Guardrails that read the trace',
		depth: 'folded',
		files: [
			'packages/governance/src/guardrails/no-progress.ts',
			'packages/governance/src/guardrails/no-repetition.ts',
			'packages/governance/src/guardrails/privilege-scopes.ts',
			'packages/governance/src/guardrails/approval-mode.ts',
			'packages/governance/src/memory-provenance.ts'
		]
	},
	otel: {
		label: 'OpenTelemetry mapping',
		depth: 'folded',
		files: ['packages/telemetry/src/otel.ts', 'packages/telemetry/src/batch.ts']
	},
	projection: {
		label: 'Run and group projections, fork',
		depth: 'folded',
		files: [
			'packages/core/src/projection/run-projection.ts',
			'packages/core/src/projection/group-replay-projection.ts',
			'packages/core/src/session/fork.ts',
			'packages/core/src/persistence/run-record.ts'
		]
	},
	workflow: {
		label: 'The workflow runtime',
		depth: 'folded',
		files: ['packages/workflow/src/run.ts', 'packages/workflow/src/reader.ts']
	},
	story: {
		label: 'The story',
		depth: 'folded',
		files: ['packages/governance/src/reports/story.ts']
	},
	gate: {
		label: 'The Gate',
		depth: 'folded',
		files: ['packages/gate/src/gate.ts']
	}
} as const satisfies Record<string, SensorReader>;

/** The id of a reader in `SENSOR_READERS`; a row's `readBy` names these. */
export type SensorReaderId = keyof typeof SENSOR_READERS;

/** What is declared by hand about one event type; the rest is derived. */
export interface SensorDeclaration {
	source: SensorSource;
	/** The work package that added it (`V1`'s events are WP1's). */
	since: string;
	readBy: readonly SensorReaderId[];
	reach?: SensorReach;
	/** Why no fold reads it yet, when only `listed` readers do — the row's finding, with its owner. */
	unfolded?: string;
}

const LIST: SensorReaderId = 'trace-list';

/** What is declared by hand about each event type — typed by `EventType`, so a new event fails to compile until it is declared here. */
export const SENSOR_DECLARATIONS: Record<EventType, SensorDeclaration> = {
	'run.started': {
		source: 'engine',
		since: 'WP1',
		readBy: [LIST, 'run-lab', 'otel', 'control-map', 'evaluators', 'projection', 'story']
	},
	'run.finished': {
		source: 'engine',
		since: 'WP1',
		readBy: [LIST, 'kit-session', 'narration', 'evaluators', 'summary', 'projection', 'story']
	},
	'tick.started': { source: 'engine', since: 'WP1', readBy: [LIST, 'evaluators'] },
	'tick.completed': { source: 'engine', since: 'WP1', readBy: [LIST, 'projection'] },
	sense: {
		source: 'engine',
		since: 'WP1',
		readBy: [LIST, 'narration', 'timeline', 'run-lab', 'story']
	},
	'prompt.composed': {
		source: 'engine',
		since: 'WP1',
		readBy: [LIST, 'run-lab', 'explain', 'control-map', 'gate', 'story']
	},
	'think.started': {
		source: 'engine',
		since: 'WP1',
		readBy: [LIST, 'kit-session', 'projection', 'story']
	},
	'think.token': { source: 'engine', since: 'WP1', readBy: [LIST, 'projection'] },
	'think.completed': {
		source: 'engine',
		since: 'WP1',
		readBy: [
			LIST,
			'timeline',
			'explain',
			'boundary',
			'evaluators',
			'otel',
			'monitor',
			'projection',
			'story'
		]
	},
	decision: {
		source: 'engine',
		since: 'WP1',
		readBy: [LIST, 'narration', 'run-lab', 'explain', 'guardrails', 'story']
	},
	'decision.fault': {
		source: 'engine',
		since: 'WP115',
		readBy: [LIST, 'story']
	},
	// WP160 (`112-…` §5): the seat and the reviewer, written by the desk's action result and the workflow's human stage.
	'seat.said': {
		source: 'seat',
		since: 'WP160',
		readBy: [LIST, 'story']
	},
	'reviewer.drew': {
		source: 'reviewer',
		since: 'WP160',
		readBy: [LIST, 'story']
	},
	'tool.executed': {
		source: 'engine',
		since: 'WP1',
		readBy: [LIST, 'kit-session', 'narration', 'explain', 'evaluators', 'otel', 'story']
	},
	'action.performed': {
		source: 'engine',
		since: 'WP1',
		readBy: [
			LIST,
			'kit-session',
			'narration',
			'run-lab',
			'evaluators',
			'guardrails',
			'control-map',
			'story'
		]
	},
	'memory.updated': {
		source: 'engine',
		since: 'WP1',
		readBy: [LIST, 'guardrails', 'control-map', 'story']
	},
	'brick.state': { source: 'engine', since: 'WP30', readBy: [LIST, 'planner'] },
	'guardrail.external': {
		source: 'engine',
		since: 'WP35',
		readBy: [
			LIST,
			'kit-session',
			'summary',
			'boundary',
			'control-map',
			'explain',
			'otel',
			'workflow',
			'story'
		]
	},
	'guardrail.checked': {
		source: 'engine',
		since: 'WP1',
		readBy: [LIST, 'summary', 'boundary', 'control-map', 'explain', 'workflow', 'story']
	},
	'guardrail.tripped': {
		source: 'engine',
		since: 'WP1',
		readBy: [LIST, 'kit-session', 'narration', 'summary', 'explain', 'otel', 'control-map', 'story']
	},
	'content.marked': {
		source: 'engine',
		since: 'WP124',
		readBy: [LIST, 'control-map', 'gate', 'story']
	},
	'approval.requested': {
		source: 'engine',
		since: 'WP1',
		readBy: [LIST, 'narration', 'explain', 'boundary', 'summary', 'guardrails', 'story']
	},
	'approval.resolved': {
		source: 'engine',
		since: 'WP1',
		readBy: [
			LIST,
			'narration',
			'run-lab',
			'explain',
			'boundary',
			'summary',
			'workflow',
			'evaluators',
			'story'
		]
	},
	'elevation.requested': {
		source: 'engine',
		since: 'WP142',
		readBy: [LIST, 'story']
	},
	'elevation.resolved': { source: 'engine', since: 'WP142', readBy: [LIST, 'guardrails', 'story'] },
	'disclosure.given': {
		source: 'engine',
		since: 'WP145',
		readBy: [LIST, 'control-map', 'workflow', 'story']
	},
	'stage.overdue': {
		source: 'workflow',
		since: 'WP146',
		readBy: [LIST, 'control-map', 'workflow', 'story']
	},
	'world.changed': {
		source: 'engine',
		since: 'WP1',
		readBy: [LIST, 'kit-session', 'explain', 'guardrails', 'projection']
	},
	'input.delivered': {
		source: 'engine',
		since: 'WP13',
		readBy: [LIST, 'narration', 'projection', 'story']
	},
	'provider.retried': { source: 'engine', since: 'WP13', readBy: [LIST, 'control-map', 'story'] },
	error: { source: 'engine', since: 'WP1', readBy: [LIST, 'timeline', 'run-lab', 'story'] },
	'group.started': {
		source: 'group',
		since: 'WP29',
		readBy: [LIST, 'run-lab', 'boundary', 'control-map', 'otel']
	},
	'group.finished': { source: 'group', since: 'WP29', readBy: [LIST, 'kit-session', 'otel'] },
	'stage.started': {
		source: 'workflow',
		since: 'WP79',
		readBy: [LIST, 'otel', 'workflow', 'story']
	},
	'stage.completed': {
		source: 'workflow',
		since: 'WP79',
		readBy: [LIST, 'control-map', 'otel', 'workflow', 'story']
	},
	'reader.answered': { source: 'workflow', since: 'WP117', readBy: [LIST, 'workflow', 'story'] }
};

/** One field of an event's payload, or of the envelope every event shares. */
export interface SensorField {
	name: string;
	optional: boolean;
}

/** One event type with its declaration, its payload fields (walked off the schema) and whether any fold reads it. */
export interface SensorRow extends SensorDeclaration {
	type: EventType;
	/** The payload's top-level fields, walked off the schema. */
	fields: SensorField[];
	/** Whether a fold reads it; `false` is the orphan rule's finding unless `unfolded` says why. */
	folded: boolean;
}

/** The envelope's own optional fields, common to every event. */
export const ENVELOPE_OPTIONAL: readonly string[] = ['agentId', 'parentRunId'];

/** The payload fields of one event type, in schema order, each with whether it may be absent. */
export function payloadFields(type: EventType): SensorField[] {
	const option = engineEventSchema.options.find((each) => each.shape.type.value === type);
	if (!option) return [];
	const shape = option.shape.payload.shape as Record<string, { _zod: { def: { type: string } } }>;
	return Object.entries(shape).map(([name, field]) => ({
		name,
		optional: field._zod.def.type === 'optional'
	}));
}

function isFolded(declaration: SensorDeclaration): boolean {
	return declaration.readBy.some((id) => SENSOR_READERS[id].depth === 'folded');
}

/** One row per event type, in the schema's order. */
export function sensorInventory(): SensorRow[] {
	return EVENT_TYPES.map((type) => {
		const declaration = SENSOR_DECLARATIONS[type];
		return { type, ...declaration, fields: payloadFields(type), folded: isFolded(declaration) };
	});
}

/**
 * The orphan rule's twin: a row no fold reads and that does not say why.
 * Rows that do say why are the inventory's *open findings*, reported but not
 * refused; a row with neither a fold nor a reason is refused.
 */
export function sensorFindings(rows: readonly SensorRow[]): {
	refused: SensorRow[];
	open: SensorRow[];
} {
	return {
		refused: rows.filter((row) => !row.folded && !row.unfolded),
		open: rows.filter((row) => !row.folded && row.unfolded)
	};
}

/** The inventory as a file: every row, optionally what a run store held, and the counts. */
export interface SensorInventoryExport {
	schemaVersion: 1;
	generatedAt: string;
	/** Fields every event carries, optional or not: the envelope's. */
	envelopeOptional: readonly string[];
	rows: SensorRow[];
	/** How many of each type a run store held (`--store`); absent when none was read. */
	observed?: Record<string, number>;
	summary: {
		types: number;
		folded: number;
		listedOnly: number;
		browserOnly: number;
		optionalFields: number;
	};
}

/** Fold the rows into the exported file — `observed` is the count of each type a run store held, when one was read. */
export function sensorInventoryExport(
	rows: readonly SensorRow[],
	generatedAt: string,
	observed?: Record<string, number>
): SensorInventoryExport {
	return {
		schemaVersion: 1,
		generatedAt,
		envelopeOptional: ENVELOPE_OPTIONAL,
		rows: [...rows],
		...(observed ? { observed } : {}),
		summary: {
			types: rows.length,
			folded: rows.filter((row) => row.folded).length,
			listedOnly: rows.filter((row) => !row.folded).length,
			browserOnly: rows.filter((row) => row.reach?.kind === 'browser-only').length,
			optionalFields: rows.reduce(
				(total, row) => total + row.fields.filter((field) => field.optional).length,
				0
			)
		}
	};
}

/** The inventory as a markdown table, with a *Seen* column when counts were read. */
export function renderSensorsMarkdown(file: SensorInventoryExport): string {
	const { summary, observed } = file;
	const seenHead = observed ? ' Seen |' : '';
	const seenRule = observed ? ' --- |' : '';
	const lines = [
		'# Sensor Inventory',
		'',
		`${summary.types} event types — ${summary.folded} read by a fold, ${summary.listedOnly} listed only, ${summary.browserOnly} browser-only; ${summary.optionalFields} optional payload fields.`,
		'',
		`| Event | Source | Since | Read by | Optional fields |${seenHead} Note |`,
		`| --- | --- | --- | --- | --- |${seenRule} --- |`
	];
	for (const row of file.rows) {
		const optional = row.fields.filter((field) => field.optional).map((field) => field.name);
		const note = row.reach?.kind === 'browser-only' ? row.reach.reason : (row.unfolded ?? '');
		const readers = row.readBy.map((id) => SENSOR_READERS[id].label).join('; ');
		const fields = optional.length ? optional.map((name) => `\`${name}\``).join(', ') : '—';
		const seen = observed ? ` ${observed[row.type] ?? 0} |` : '';
		lines.push(
			`| \`${row.type}\` | ${row.source} | ${row.since} | ${readers} | ${fields} |${seen} ${note} |`
		);
	}
	return `${lines.join('\n')}\n`;
}
