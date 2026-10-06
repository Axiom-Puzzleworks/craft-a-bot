import { SPARK_PORT, SPARK_UNITS, type SparkUnit } from './endpoints.js';
import { inferMode, type SparkUnitState } from './patterns.js';
import type { ServedModel } from './transport.js';

/**
 * **Surveying the two units** (`99-DGX-SPARK.md` §9): one state per *unit*,
 * where the transport's `survey` has one line per address. A unit is asked on
 * its LAN name first and its Tailscale address second, so the survey works
 * away from home, and says which it reached it by. No credentials and no
 * commands: this is `GET /v1/models` and nothing else. The mode the unit runs
 * is *inferred* here from what it serves; a host that can ask the unit
 * (`craftabot spark`, over ssh) replaces the inference with the real answer.
 */
export interface SurveyedUnit extends SparkUnitState {
	/** The address that answered, or absent when none did. */
	via?: string;
}

async function modelsOf(
	host: string,
	fetch: typeof globalThis.fetch,
	signal?: AbortSignal
): Promise<ServedModel[] | undefined> {
	try {
		const response = await fetch(
			`http://${host}:${SPARK_PORT}/v1/models`,
			signal ? { signal } : {}
		);
		if (!response.ok) return undefined;
		const body = (await response.json()) as {
			data?: { id?: unknown; root?: unknown; max_model_len?: unknown }[];
		};
		return (body.data ?? [])
			.filter((m) => typeof m.id === 'string')
			.map((m) => ({
				id: m.id as string,
				...(typeof m.root === 'string' ? { root: m.root } : {}),
				...(typeof m.max_model_len === 'number' ? { maxModelLen: m.max_model_len } : {})
			}));
	} catch {
		return undefined;
	}
}

async function surveyUnit(
	unit: SparkUnit,
	fetch: typeof globalThis.fetch,
	signal?: AbortSignal
): Promise<SurveyedUnit> {
	for (const host of [unit.lan, unit.tailscale]) {
		const models = await modelsOf(host, fetch, signal);
		if (models !== undefined) {
			const inferred = inferMode(models);
			return { unit: unit.id, reachable: true, models, via: host, ...inferred };
		}
	}
	return { unit: unit.id, reachable: false, models: [], mode: 'unknown', modeFrom: 'none' };
}

export function surveySparks(
	fetch: typeof globalThis.fetch = globalThis.fetch,
	signal?: AbortSignal
): Promise<SurveyedUnit[]> {
	return Promise.all(SPARK_UNITS.map((unit) => surveyUnit(unit, fetch, signal)));
}
