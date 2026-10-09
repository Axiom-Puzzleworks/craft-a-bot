import type { ControlMap, EffectRecord, ExperimentResult } from '@craftabot/core';

/**
 * **The Control Effectiveness Register** (WP90, `80-CONTROL-EFFECTIVENESS-REGISTER.md`
 * §2; `64-…` §6.8.2; tenet 19): a pure fold over experiment results and the
 * control maps — for every control a full-scale bank might implement, what
 * it did, at what cost, how sure, over which populations and workflows. A
 * control the maps list that no experiment has tested is `untested`, in
 * the open; the register is a to-do list as much as a result.
 */
/** The largest-n effect on a control's primary metric: what the register quotes for it. */
export interface ControlEffectivenessHeadline {
	metricId: string;
	delta: number;
	interval: [number, number];
	n: number;
	experimentId: string;
	resultId: string;
	underpowered: boolean;
	/** The brain tier it was measured under (WP116, `103-FALLIBLE-ACTORS.md` §6); absent on a result written before. */
	tier?: string;
	/** Both sides at a bound: says nothing about the control (WP116). Quoted only when every effect is. */
	untestable?: true;
}

/** One control on the register: its map row, every effect that named it, the headline, the cost, the coverage and the status. */
export interface ControlEffectivenessRow {
	/** `<mapId>/<ref>`, or a bare id an experiment named that no map lists. */
	controlId: string;
	controlMapRow?: {
		mapId: string;
		ref: string;
		title: string;
		obligation: string;
		status: string | undefined;
	};
	obligations: string[];
	/** Every effect that named this control. */
	effects: EffectRecord[];
	/** The largest-n effect on the control's primary metric — the first metric its effects name. */
	headline?: ControlEffectivenessHeadline;
	/** The treatment side's cost, averaged over the effects. */
	cost: { tokensPerCase?: number; approvalsPerCase?: number; touchesPerCase?: number };
	coverage: { experiments: number; populations: string[]; contexts: string[]; workflows: string[] };
	/** `untestable` since WP116: every effect on the primary metric sat at a bound, so no actor erred for the control to catch (tenet 33; the primary metric's effects since WP150, every effect before). */
	status: 'evidenced' | 'inconclusive' | 'untestable' | 'untested';
	/**
	 * WP196: the effects measured with a live model as the brain, read apart — never merged into `headline`/`status`, which stay the
	 * scripted and fallible tiers' (a live figure is one sample of one model, and a different instrument).
	 */
	live?: ControlLiveColumn;
}

/**
 * **A live recording the register reads** (WP196, `114-DECISIONS-UNDER-PRESSURE-PLAN.md`): what the committed result alone does
 * not say — the model that answered, when, how long the recording took — and the cells of the run, from which a control's
 * price is read. Supplied by the host from `docs/evidence/live*`/`timings.json`; the fold stays pure.
 */
export interface LiveRunSource {
	/** The experiment result's id. */
	resultId: string;
	/** The model that was the brain (`Qwen3.5-122B-A10B-NVFP4`). */
	model: string;
	cartridge?: string;
	/** The day it was recorded. */
	recordedOn?: string;
	/** The wall time of the whole recording. */
	wallSeconds?: number;
	/** The run's cells: the campaign (its arms as `axis=value--…`) and how each ended. */
	cells?: ReadonlyArray<{ campaign: string; outcome: string }>;
}

/** What a control cost, read beside what it caught: the shares of cells that did not succeed in each arm, and the per-case spend. */
export interface ControlPrice {
	/** Cells in each arm. */
	cells: { baseline: number; treatment: number };
	/** Cells that ended in an error or ran out of steps. */
	lost: { baseline: number; treatment: number };
	/** Cells a guardrail stopped. */
	stopped: { baseline: number; treatment: number };
	tokensPerCase: { baseline: number; treatment: number };
	/** The bill per case in pounds, when the analysis was given rates. */
	poundsPerCase?: { baseline: number; treatment: number };
}

/** One live effect, read with its model and its price. */
export interface ControlLiveEffect {
	model: string;
	cartridge?: string;
	recordedOn?: string;
	resultId: string;
	experimentId: string;
	metricId: string;
	delta: number;
	interval: [number, number];
	n: number;
	underpowered: boolean;
	untestable?: true;
	price?: ControlPrice;
}

/** The live column of a control: every live effect, the largest per model quoted, and a status read over them like the main one. */
export interface ControlLiveColumn {
	effects: ControlLiveEffect[];
	status: 'evidenced' | 'inconclusive' | 'untestable';
}

const excludesZero = (interval: [number, number]): boolean => interval[0] > 0 || interval[1] < 0;

const isLive = (effect: EffectRecord): boolean => effect.tier === 'live';

/** A cell's campaign names its arms as `axis=value` joined by `--`. */
function armCells(
	cells: NonNullable<LiveRunSource['cells']>,
	axis: string,
	value: string
): NonNullable<LiveRunSource['cells']> {
	return cells.filter((cell) => cell.campaign.split('--').includes(`${axis}=${value}`));
}

function priceOf(
	effect: EffectRecord,
	source: LiveRunSource | undefined
): ControlPrice | undefined {
	if (!source?.cells) return undefined;
	const base = armCells(source.cells, effect.factor.axis, effect.factor.baseline);
	const treat = armCells(source.cells, effect.factor.axis, effect.factor.treatment);
	if (base.length === 0 || treat.length === 0) return undefined;
	const share = (cells: typeof base, outcomes: string[]): number =>
		cells.filter((cell) => outcomes.includes(cell.outcome)).length / cells.length;
	// A scenario design ends its cells by the step limit on purpose (the attack is resisted by running out the clock), so for it
	// only an error is a cell lost (the same reading as `scripts/live-compare.mjs`).
	const lostOutcomes = effect.experimentId.startsWith('controls')
		? ['ERROR']
		: ['ERROR', 'OUT_OF_STEPS'];
	const bill = effect.cost.bill;
	return {
		cells: { baseline: base.length, treatment: treat.length },
		lost: {
			baseline: share(base, lostOutcomes),
			treatment: share(treat, lostOutcomes)
		},
		stopped: {
			baseline: share(base, ['STOPPED_BY_GUARDRAIL']),
			treatment: share(treat, ['STOPPED_BY_GUARDRAIL'])
		},
		tokensPerCase: {
			baseline: effect.cost.tokensPerCase.baseline,
			treatment: effect.cost.tokensPerCase.treatment
		},
		...(bill
			? {
					poundsPerCase: {
						baseline: bill.baseline.pounds,
						treatment: bill.treatment.pounds
					}
				}
			: {})
	};
}

function liveColumnFor(
	entries: ReadonlyArray<{ effect: EffectRecord; result: ExperimentResult }>,
	sources: ReadonlyMap<string, LiveRunSource>
): ControlLiveColumn | undefined {
	const live = entries.filter(({ effect }) => isLive(effect));
	if (live.length === 0) return undefined;
	const effects: ControlLiveEffect[] = live.map(({ effect, result }) => {
		const source = sources.get(result.id);
		const price = priceOf(effect, source);
		return {
			model: source?.model ?? 'unnamed model',
			...(source?.cartridge ? { cartridge: source.cartridge } : {}),
			...(source?.recordedOn ? { recordedOn: source.recordedOn } : {}),
			resultId: result.id,
			experimentId: result.experimentId,
			metricId: effect.metricId,
			delta: effect.delta,
			interval: [effect.interval[0], effect.interval[1]],
			n: effect.baseline.n + effect.treatment.n,
			underpowered: effect.underpowered,
			...(effect.untestable ? { untestable: true as const } : {}),
			...(price ? { price } : {})
		};
	});
	// Read like the main column: a testable primary effect that excludes zero is evidence; every effect at a bound is untestable.
	const primaryMetric = live[0]!.effect.metricId;
	const primary = live.filter(({ effect }) => effect.metricId === primaryMetric);
	const status: ControlLiveColumn['status'] = primary.every(
		({ effect }) => effect.untestable === true
	)
		? 'untestable'
		: primary.some(
					({ effect }) =>
						effect.untestable !== true && excludesZero(effect.interval as [number, number])
			  )
			? 'evidenced'
			: 'inconclusive';
	return { effects, status };
}

const mean = (values: number[]): number | undefined =>
	values.length === 0 ? undefined : values.reduce((sum, value) => sum + value, 0) / values.length;

/** The register: a row per control-map row in the maps' order, then every id an effect named that no map lists. */
export function controlEffectiveness(
	results: readonly ExperimentResult[],
	controlMaps: readonly ControlMap[],
	options: { liveRuns?: readonly LiveRunSource[] } = {}
): ControlEffectivenessRow[] {
	const sources = new Map((options.liveRuns ?? []).map((run) => [run.resultId, run]));
	const byControl = new Map<string, Array<{ effect: EffectRecord; result: ExperimentResult }>>();
	for (const result of results) {
		for (const effect of result.effects) {
			for (const controlId of effect.controlIds) {
				const list = byControl.get(controlId) ?? [];
				list.push({ effect, result });
				byControl.set(controlId, list);
			}
		}
	}
	const rows: ControlEffectivenessRow[] = [];
	const listed = new Set<string>();
	for (const map of controlMaps) {
		for (const row of map.rows) {
			const controlId = `${map.id}/${row.ref}`;
			listed.add(controlId);
			rows.push(
				rowFor(controlId, byControl.get(controlId) ?? [], sources, {
					controlMapRow: {
						mapId: map.id,
						ref: row.ref,
						title: row.title,
						obligation: row.obligation,
						status: row.status
					},
					obligations: [...row.tags]
				})
			);
		}
	}
	for (const [controlId, entries] of byControl) {
		if (listed.has(controlId)) continue;
		rows.push(
			rowFor(controlId, entries, sources, {
				obligations: [...new Set(entries.flatMap(({ result }) => result.obligations))]
			})
		);
	}
	return rows;
}

function rowFor(
	controlId: string,
	allEntries: ReadonlyArray<{ effect: EffectRecord; result: ExperimentResult }>,
	sources: ReadonlyMap<string, LiveRunSource>,
	base: Pick<ControlEffectivenessRow, 'obligations'> &
		Partial<Pick<ControlEffectivenessRow, 'controlMapRow'>>
): ControlEffectivenessRow {
	const entries = allEntries.filter(({ effect }) => !isLive(effect));
	const live = liveColumnFor(allEntries, sources);
	const effects = entries.map(({ effect }) => effect);
	const primaryMetric = effects[0]?.metricId;
	// A testable effect is quoted before an untestable one (WP116): an effect at a bound says nothing about the control.
	const primary = entries.filter(({ effect }) => effect.metricId === primaryMetric);
	const testablePrimary = primary.filter(({ effect }) => effect.untestable !== true);
	const onPrimary = testablePrimary.length > 0 ? testablePrimary : primary;
	const largest = onPrimary.reduce<(typeof entries)[number] | undefined>((best, entry) => {
		const n = entry.effect.baseline.n + entry.effect.treatment.n;
		const bestN = best ? best.effect.baseline.n + best.effect.treatment.n : -1;
		return n > bestN ? entry : best;
	}, undefined);
	const headline: ControlEffectivenessHeadline | undefined = largest
		? {
				metricId: largest.effect.metricId,
				delta: largest.effect.delta,
				interval: [largest.effect.interval[0], largest.effect.interval[1]],
				n: largest.effect.baseline.n + largest.effect.treatment.n,
				experimentId: largest.result.experimentId,
				resultId: largest.result.id,
				underpowered: largest.effect.underpowered,
				...(largest.effect.tier !== undefined ? { tier: largest.effect.tier } : {}),
				...(largest.effect.untestable ? { untestable: true as const } : {})
			}
		: undefined;
	const tokens = mean(effects.map((effect) => effect.cost.tokensPerCase.treatment));
	const approvals = mean(effects.map((effect) => effect.cost.approvalsPerCase.treatment));
	const touches = mean(
		effects.flatMap((effect) =>
			effect.cost.touchesPerCase ? [effect.cost.touchesPerCase.treatment] : []
		)
	);
	const status: ControlEffectivenessRow['status'] =
		effects.length === 0
			? 'untested'
			: // WP150: untestable when every effect on the primary metric sat at a bound — the metric the control was built to move could not.
				primary.every(({ effect }) => effect.untestable === true)
				? 'untestable'
				: headline && excludesZero(headline.interval)
					? 'evidenced'
					: 'inconclusive';
	return {
		controlId,
		...(base.controlMapRow ? { controlMapRow: base.controlMapRow } : {}),
		obligations: base.obligations,
		effects,
		...(headline ? { headline } : {}),
		cost: {
			...(tokens !== undefined ? { tokensPerCase: tokens } : {}),
			...(approvals !== undefined ? { approvalsPerCase: approvals } : {}),
			...(touches !== undefined ? { touchesPerCase: touches } : {})
		},
		coverage: {
			experiments: new Set(entries.map(({ result }) => result.experimentId)).size,
			populations: [
				...new Set(
					entries.flatMap(({ result }) =>
						result.populationDigest ? [result.populationDigest] : []
					)
				)
			].sort(),
			contexts: [
				...new Set(
					effects.flatMap((effect) =>
						effect.factor.axis === 'context'
							? [effect.factor.baseline, effect.factor.treatment]
							: []
					)
				)
			].sort(),
			workflows: [...new Set(entries.flatMap(({ result }) => result.workflowIds ?? []))].sort()
		},
		status,
		...(live ? { live } : {})
	};
}
