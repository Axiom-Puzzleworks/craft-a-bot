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
	status: 'evidenced' | 'inconclusive' | 'untested';
}

const excludesZero = (interval: [number, number]): boolean => interval[0] > 0 || interval[1] < 0;

const mean = (values: number[]): number | undefined =>
	values.length === 0 ? undefined : values.reduce((sum, value) => sum + value, 0) / values.length;

/** The register: a row per control-map row in the maps' order, then every id an effect named that no map lists. */
export function controlEffectiveness(
	results: readonly ExperimentResult[],
	controlMaps: readonly ControlMap[]
): ControlEffectivenessRow[] {
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
				rowFor(controlId, byControl.get(controlId) ?? [], {
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
			rowFor(controlId, entries, {
				obligations: [...new Set(entries.flatMap(({ result }) => result.obligations))]
			})
		);
	}
	return rows;
}

function rowFor(
	controlId: string,
	entries: ReadonlyArray<{ effect: EffectRecord; result: ExperimentResult }>,
	base: Pick<ControlEffectivenessRow, 'obligations'> &
		Partial<Pick<ControlEffectivenessRow, 'controlMapRow'>>
): ControlEffectivenessRow {
	const effects = entries.map(({ effect }) => effect);
	const primaryMetric = effects[0]?.metricId;
	const onPrimary = entries.filter(({ effect }) => effect.metricId === primaryMetric);
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
				underpowered: largest.effect.underpowered
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
		status
	};
}
