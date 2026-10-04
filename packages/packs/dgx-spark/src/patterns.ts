import { sparkCartridges } from './catalogue.js';
import { SPARK_UNITS, type SparkUnitId } from './endpoints.js';
import { SPARK_MODE_ID_PATTERN, modesServing, sparkModeById, type SparkMode } from './modes.js';
import type { ServedModel } from './transport.js';

/**
 * **A Spark pattern** (`99-DGX-SPARK.md` §9): one named way of using the two
 * Sparks for Craft A Bot, as data that can be checked, planned, stood up, shut
 * down and replaced by another. The Sparks have other uses (a puzzle
 * generator, a fairness project, coding agents, image and video), so a
 * pattern never owns them: it names which *mode* each unit runs while it is
 * up, and which Craft A Bot *role* runs on which cartridge. Standing one up
 * remembers what each unit was doing (`craftabot spark up`, the lease), and
 * standing it down puts that back.
 *
 * The roles are the jobs the bank gives a model:
 * - `brain`: an agent's own LLM (a `live` brain in a campaign);
 * - `seat`: the person across the desk, played live (WP64, WP169);
 * - `reader`: a typed-question classifier (`dgx-spark/classifier`, `llmReader`);
 * - `labeller`: a blind second labeller for a corpus (`105-…`);
 * - `redteam`: the adversarial seat (`106-…` §8).
 *
 * A pattern is *checked* against the mode catalogue (`checkSparkPattern`:
 * does a unit in this pattern serve each role's model, with the context and
 * log-probabilities it needs), *planned* against a live survey
 * (`planSparkPattern`: what would change, what it would stop, how long it
 * takes) and *verified* against that survey (`rolesReady`: is each role
 * servable right now). A pattern can be wrong about the Sparks; only the
 * survey is true.
 */
export const SPARK_ROLES = ['brain', 'seat', 'reader', 'labeller', 'redteam'] as const;
export type SparkRole = (typeof SPARK_ROLES)[number];

export interface SparkRoleSpec {
	/** A cartridge from the pack (`dgx-spark/giant-qwen`, …). */
	cartridge: string;
	/** The role refuses a mode whose context is shorter (an agent's prompt grows; a reader's does not). */
	minContext?: number;
	/** The role reads the first token's log-probabilities (a reader's confidence). */
	needsLogprobs?: boolean;
	/** The units the role may use; absent, any unit in the pattern that serves the model. */
	units?: SparkUnitId[];
}

export interface SparkPattern {
	id: string;
	title: string;
	purpose: string;
	/** The mode each unit runs while the pattern is up, or `off` (stop the unit's mode stack). A unit not named is left alone. */
	units: Partial<Record<SparkUnitId, string>>;
	roles: Partial<Record<SparkRole, SparkRoleSpec>>;
}

/** The mode id a unit stands down to: `switch.sh off` stops every mode stack and leaves monitoring running. */
export const SPARK_OFF = 'off';

const BRAIN_CONTEXT = 16_384;

const giant = 'dgx-spark/giant-qwen';
const quick = 'dgx-spark/quick-qwen';

export const SPARK_PATTERNS: readonly SparkPattern[] = [
	{
		id: 'reasoning-pair',
		title: 'Reasoning pair: the 122B on both units',
		purpose:
			'The strongest model for every role, with both units serving it so a batch spreads across 16 streams (about 1.8 times one unit’s throughput, measured 2026-10-04). The Sparks’ starter shape; the units are in it already when the puzzle software’s mode is up on both.',
		units: { 'spark-619c': 'puzzle', 'spark-ef08': 'puzzle' },
		roles: {
			brain: { cartridge: giant, minContext: BRAIN_CONTEXT },
			seat: { cartridge: giant, minContext: BRAIN_CONTEXT },
			reader: { cartridge: giant },
			labeller: { cartridge: giant },
			redteam: { cartridge: giant, minContext: BRAIN_CONTEXT }
		}
	},
	{
		id: 'brain-and-seats',
		title: 'Brain and seats: the 122B beside the 35B',
		purpose:
			'The 122B on spark-619c for the agent and the labeller, the 35B on spark-ef08 for the people across the desk, the reader and the red team. The 35B equalled Jev on the servicing request and is five times quicker (`99-…` §5), so the seats are not slowed by the brain. Two models in one run: a live counterpart and a live brain at once.',
		units: { 'spark-619c': 'puzzle', 'spark-ef08': 'chat' },
		roles: {
			brain: { cartridge: giant, minContext: BRAIN_CONTEXT, units: ['spark-619c'] },
			labeller: { cartridge: giant, units: ['spark-619c'] },
			seat: { cartridge: quick, minContext: BRAIN_CONTEXT, units: ['spark-ef08'] },
			reader: { cartridge: quick, units: ['spark-ef08'] },
			redteam: { cartridge: quick, minContext: BRAIN_CONTEXT, units: ['spark-ef08'] }
		}
	},
	{
		id: 'fast-pair',
		title: 'Fast pair: the 35B on both units',
		purpose:
			'The quick model for every role on both units: bulk recording where speed matters more than the last point of quality, with a 262k context.',
		units: { 'spark-619c': 'chat', 'spark-ef08': 'chat' },
		roles: {
			brain: { cartridge: quick, minContext: BRAIN_CONTEXT },
			seat: { cartridge: quick, minContext: BRAIN_CONTEXT },
			reader: { cartridge: quick },
			labeller: { cartridge: quick },
			redteam: { cartridge: quick, minContext: BRAIN_CONTEXT }
		}
	},
	{
		id: 'reader-batch',
		title: 'Reader batch: the 122B tuned for single-token answers',
		purpose:
			'The fairness project’s `cpf-large` mode on both units: 64 streams each, log-probabilities on, 4k context. A corpus of classifications (a reader scored over a thousand rows) runs here in a fraction of the time; an agent brain does not fit in 4k.',
		units: { 'spark-619c': 'cpf-large', 'spark-ef08': 'cpf-large' },
		roles: { reader: { cartridge: giant, needsLogprobs: true } }
	},
	{
		id: 'idle',
		title: 'Idle: both units stood down',
		purpose:
			'Stops the mode stack on both units (monitoring stays up). Frees the memory for ComfyUI or anything else started by hand.',
		units: { 'spark-619c': SPARK_OFF, 'spark-ef08': SPARK_OFF },
		roles: {}
	}
];

export const sparkPatternById = (id: string): SparkPattern | undefined =>
	SPARK_PATTERNS.find((pattern) => pattern.id === id);

const unitIds = new Set<string>(SPARK_UNITS.map((unit) => unit.id));

function modelOf(cartridgeId: string): string | undefined {
	return sparkCartridges.find((cartridge) => cartridge.id === cartridgeId)?.model;
}

/**
 * What is wrong with a pattern, against the catalogue (no network): an unknown
 * unit or mode, a mode id that is not a safe folder name, a role whose
 * cartridge no unit in the pattern can serve with the context and
 * log-probabilities the role needs, a shared mode on one unit alone.
 */
export function checkSparkPattern(pattern: SparkPattern): string[] {
	const problems: string[] = [];
	const at = `pattern "${pattern.id}"`;
	if (!/^[a-z][a-z0-9-]*$/.test(pattern.id)) problems.push(`${at}: the id is not a plain name`);
	const entries = Object.entries(pattern.units);
	if (entries.length === 0) problems.push(`${at}: it names no unit`);
	const modesByUnit = new Map<string, SparkMode | undefined>();
	for (const [unit, mode] of entries) {
		if (!unitIds.has(unit)) {
			problems.push(`${at}: "${unit}" is not one of the two Sparks`);
			continue;
		}
		if (mode === SPARK_OFF) {
			modesByUnit.set(unit, undefined);
			continue;
		}
		if (typeof mode !== 'string' || !SPARK_MODE_ID_PATTERN.test(mode)) {
			problems.push(`${at}: "${String(mode)}" is not a mode name`);
			continue;
		}
		const known = sparkModeById(mode);
		if (!known) problems.push(`${at}: "${mode}" is not a mode the catalogue knows`);
		modesByUnit.set(unit, known);
	}
	const kinds = entries.map(([, mode]) => sparkModeById(String(mode))?.kind);
	if (kinds.includes('shared') && entries.length < 2)
		problems.push(`${at}: a shared mode needs both units`);
	for (const [role, spec] of Object.entries(pattern.roles) as [SparkRole, SparkRoleSpec][]) {
		if (!SPARK_ROLES.includes(role)) {
			problems.push(`${at}: "${role}" is not a role`);
			continue;
		}
		const model = modelOf(spec.cartridge);
		if (!model) {
			problems.push(
				`${at}: role ${role} names "${spec.cartridge}", which is not a Spark cartridge`
			);
			continue;
		}
		const candidates = entries
			.filter(([unit]) => spec.units === undefined || spec.units.includes(unit as SparkUnitId))
			.map(([unit]) => ({ unit, mode: modesByUnit.get(unit) }))
			.filter((entry): entry is { unit: string; mode: SparkMode } => entry.mode !== undefined);
		const serving = candidates.filter(
			(entry) => entry.mode.model?.toLowerCase() === model.toLowerCase()
		);
		if (serving.length === 0) {
			problems.push(
				`${at}: role ${role} needs ${model}, which no unit it may use is set to serve (${
					candidates.map((c) => `${c.unit}: ${c.mode.id}`).join(', ') || 'none'
				})`
			);
			continue;
		}
		const roomy = serving.filter(
			(entry) => spec.minContext === undefined || (entry.mode.contextTokens ?? 0) >= spec.minContext
		);
		if (roomy.length === 0)
			problems.push(
				`${at}: role ${role} needs ${spec.minContext} tokens of context and ${serving
					.map((s) => `${s.mode.id} gives ${s.mode.contextTokens}`)
					.join(', ')}`
			);
		else if (spec.needsLogprobs && !roomy.some((entry) => entry.mode.logprobs))
			problems.push(
				`${at}: role ${role} reads log-probabilities and no unit's mode is tuned for them`
			);
	}
	return problems;
}

/** What one unit is, as surveyed: reachable or not, its models, and the mode it reports when asked over ssh. */
export interface SparkUnitState {
	unit: SparkUnitId;
	reachable: boolean;
	models: ServedModel[];
	/** The mode folder the running stack was started from, `off` for none, `unknown` when it could not be asked. */
	mode: string;
	/** How the mode was learned: from the compose project (`ssh`) or inferred from the names it serves. */
	modeFrom: 'ssh' | 'inferred' | 'none';
}

/**
 * The mode a unit is in, as far as can be told. Over ssh it is exact. Without,
 * a mode is inferred only when exactly one catalogue mode serves precisely the
 * names the unit serves *and* the same model: two modes can serve the same
 * names (`puzzle` and `cpf-large` both serve `puzzle-llm`), and then the answer
 * is `unknown` rather than a guess.
 */
export function inferMode(models: ServedModel[]): { mode: string; modeFrom: 'inferred' | 'none' } {
	if (models.length === 0) return { mode: SPARK_OFF, modeFrom: 'none' };
	const names = new Set(models.map((m) => m.id.toLowerCase()));
	const matching = (candidate: SparkMode) =>
		candidate.served.length === names.size && candidate.served.every((n) => names.has(n));
	const exact = [...modesServing(models[0]!.id)].filter(matching);
	return exact.length === 1
		? { mode: exact[0]!.id, modeFrom: 'inferred' }
		: { mode: 'unknown', modeFrom: 'inferred' };
}

export type SparkUnitAction = 'keep' | 'switch' | 'unreachable';

export interface SparkUnitPlan {
	unit: SparkUnitId;
	from: string;
	to: string;
	action: SparkUnitAction;
	/** Whose mode a switch would stop, so the operator can see what they are interrupting. */
	stops?: { mode: string; owner: SparkMode['owner'] };
	minutes: number;
}

export interface SparkPlan {
	pattern: string;
	units: SparkUnitPlan[];
	/** The longest switch: the units switch in parallel. */
	minutes: number;
	/** Whether anything changes at all. */
	changes: boolean;
}

/**
 * What standing a pattern up would do to each unit it names, from the survey.
 * Nothing here runs a command. A unit already in the mode (or already off) is
 * kept; an unreachable unit blocks the plan; a unit in a mode the survey could
 * not name is switched, and the plan says `unknown` for what it stops.
 */
export function planSparkPattern(pattern: SparkPattern, states: SparkUnitState[]): SparkPlan {
	const units: SparkUnitPlan[] = Object.entries(pattern.units).map(([unit, to]) => {
		const state = states.find((candidate) => candidate.unit === unit);
		const target = String(to);
		const base = { unit: unit as SparkUnitId, to: target };
		if (!state || !state.reachable)
			return { ...base, from: 'unreachable', action: 'unreachable' as const, minutes: 0 };
		const keep = target === SPARK_OFF ? state.mode === SPARK_OFF : state.mode === target;
		const current = sparkModeById(state.mode);
		return {
			...base,
			from: state.mode,
			action: keep ? ('keep' as const) : ('switch' as const),
			...(!keep && state.mode !== SPARK_OFF
				? { stops: { mode: state.mode, owner: current?.owner ?? ('shared' as const) } }
				: {}),
			minutes: keep ? 0 : (sparkModeById(target)?.loadMinutes ?? 1)
		};
	});
	return {
		pattern: pattern.id,
		units,
		minutes: Math.max(0, ...units.map((u) => u.minutes)),
		changes: units.some((u) => u.action !== 'keep')
	};
}

export interface SparkRoleReadiness {
	role: SparkRole;
	cartridge: string;
	ready: boolean;
	/** The units that can answer it now. */
	units: SparkUnitId[];
	/** Why it cannot, when it cannot. */
	why?: string;
}

/**
 * Which roles can be served right now, from the survey alone (no pattern
 * needed to be "up": a role is ready when some reachable unit it may use
 * serves its model with the context it needs). This is the check `record`
 * runs before a long recording and `craftabot spark verify` reports.
 */
export function rolesReady(
	roles: SparkPattern['roles'],
	states: SparkUnitState[]
): SparkRoleReadiness[] {
	return (Object.entries(roles) as [SparkRole, SparkRoleSpec][]).map(([role, spec]) => {
		const model = modelOf(spec.cartridge);
		const capable = states
			.filter((s) => s.reachable)
			.filter((s) => spec.units === undefined || spec.units.includes(s.unit))
			.filter((s) =>
				s.models.some((served) => served.root?.toLowerCase().endsWith(`/${model?.toLowerCase()}`))
			)
			.filter((s) => {
				if (spec.minContext === undefined) return true;
				const longest = Math.max(0, ...s.models.map((m) => m.maxModelLen ?? 0));
				return longest >= spec.minContext;
			});
		return {
			role,
			cartridge: spec.cartridge,
			ready: capable.length > 0,
			units: capable.map((s) => s.unit),
			...(capable.length === 0
				? {
						why: `no reachable unit serves ${model ?? spec.cartridge}${
							spec.minContext ? ` with ${spec.minContext} tokens of context` : ''
						} (${states
							.map((s) => `${s.unit}: ${s.reachable ? s.mode : 'unreachable'}`)
							.join(', ')})`
					}
				: {})
		};
	});
}

/** One cartridge asked for, and whether some reachable unit can serve it now. */
export interface CartridgeReadiness {
	cartridge: string;
	ready: boolean;
	units: SparkUnitId[];
	why?: string;
}

/** `rolesReady` without roles: what a design file asks of the Sparks, by cartridge. */
export function cartridgesReady(
	cartridges: readonly string[],
	states: SparkUnitState[]
): CartridgeReadiness[] {
	return cartridges.map((cartridge) => {
		const one = rolesReady({ brain: { cartridge } }, states)[0]!;
		return {
			cartridge: one.cartridge,
			ready: one.ready,
			units: one.units,
			...(one.why !== undefined ? { why: one.why } : {})
		};
	});
}

/**
 * How many requests the Sparks can serve at once for every cartridge named: for
 * each, the streams of the modes of the reachable units that serve its model,
 * summed; across cartridges, the smallest (a run that needs both a brain and a
 * seat is limited by the scarcer). Zero when some cartridge has no unit.
 */
export function sparkCapacity(cartridges: readonly string[], states: SparkUnitState[]): number {
	if (cartridges.length === 0) return 0;
	return Math.min(
		...cartridges.map((cartridge) => {
			const model = modelOf(cartridge);
			return states
				.filter((s) => s.reachable)
				.filter((s) =>
					s.models.some((served) => served.root?.toLowerCase().endsWith(`/${model?.toLowerCase()}`))
				)
				.reduce((sum, s) => sum + (sparkModeById(s.mode)?.streams ?? 4), 0);
		})
	);
}

/** The cartridges a JSON document (a campaign, an experiment) asks of the Sparks, found wherever they are written. */
export function sparkCartridgesIn(document: unknown): string[] {
	const found = new Set<string>();
	const walk = (value: unknown): void => {
		if (Array.isArray(value)) value.forEach(walk);
		else if (value && typeof value === 'object')
			for (const [key, inner] of Object.entries(value)) {
				if (
					(key === 'cartridgeId' || key === 'cartridge') &&
					typeof inner === 'string' &&
					inner.startsWith('dgx-spark/')
				)
					found.add(inner);
				else walk(inner);
			}
	};
	walk(document);
	return [...found].sort();
}

/** The shipped patterns whose modes serve every model the cartridges name, so an operator is told which to stand up. */
export function patternsServing(cartridgeIds: readonly string[]): SparkPattern[] {
	const models = cartridgeIds.map(modelOf);
	if (models.some((model) => model === undefined)) return [];
	return SPARK_PATTERNS.filter((pattern) => {
		const served = new Set(
			Object.values(pattern.units)
				.map((mode) => sparkModeById(String(mode))?.model?.toLowerCase())
				.filter((model): model is string => model !== undefined)
		);
		return models.every((model) => served.has(model!.toLowerCase()));
	});
}
