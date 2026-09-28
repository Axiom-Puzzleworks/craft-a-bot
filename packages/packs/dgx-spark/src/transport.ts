/**
 * **Reaching a Spark** (`99-DGX-SPARK.md` §3–§4). Every request goes to the
 * first unit that is up **and** serves the model asked for. Model
 * resolution is by *model*, not by served name. A mode serves its model
 * under a name of its own choosing: `puzzle-llm` and `tidy` in `puzzle`
 * mode, `qwen3.5-122b` in `lang-single`, `qwen3.6` in `chat`. A caller
 * names either a served name or the model's directory
 * (`Qwen3.5-122B-A10B-NVFP4`), and `/v1/models`'s `root` field says which
 * directory each served name loads. So a cartridge keeps working when the
 * operator switches modes, as long as some unit still serves its model.
 *
 * A unit is skipped, and the next one tried, when:
 * - it cannot be reached (down, reloading, or away from home without Tailscale);
 * - it answers 502, 503 or 504 (loading); or
 * - its mode doesn't serve the model.
 *
 * When every unit has been skipped, the error names what each one is serving,
 * and the switch command for the operator.
 */

export interface ServedModel {
	/** The name to send in `model`. */
	id: string;
	/** The directory it loads, e.g. `/models/Qwen3.5-122B-A10B-NVFP4`. */
	root?: string;
	maxModelLen?: number;
}

export interface SparkRoute {
	baseUrl: string;
	model: ServedModel;
}

export interface SparkTransport {
	/** The first unit serving `wanted`, in the transport's order, or a thrown `SparkUnavailable`. */
	route(wanted: string, signal?: AbortSignal): Promise<SparkRoute>;
	/** POST to a route's base URL; on a transient failure, re-route to the next unit and retry once per unit. */
	post(
		wanted: string,
		path: string,
		body: (model: string) => unknown,
		signal?: AbortSignal
	): Promise<{ response: Response; route: SparkRoute }>;
	/** What each unit is serving now (for errors and `validateKey`). */
	survey(
		signal?: AbortSignal
	): Promise<{ baseUrl: string; models: ServedModel[] | 'unreachable' }[]>;
}

export class SparkUnavailable extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SparkUnavailable';
	}
}

const TRANSIENT = new Set([502, 503, 504]);
/** How long a unit's model list is trusted before it is asked again. */
const MODELS_TTL_MS = 60_000;

/** `puzzle-llm`, or the directory `Qwen3.5-122B-A10B-NVFP4`, against one served model. */
export function servesModel(model: ServedModel, wanted: string): boolean {
	if (model.id === wanted) return true;
	const dir = model.root
		?.split('/')
		.filter((part) => part !== '')
		.at(-1);
	return dir !== undefined && dir.toLowerCase() === wanted.toLowerCase();
}

export function createSparkTransport(options: {
	baseUrls: string[];
	fetch: typeof globalThis.fetch;
	now?: () => number;
}): SparkTransport {
	const { baseUrls, fetch } = options;
	const now = options.now ?? (() => Date.now());
	const cache = new Map<string, { at: number; models: ServedModel[] }>();

	async function modelsAt(
		baseUrl: string,
		signal?: AbortSignal
	): Promise<ServedModel[] | 'unreachable'> {
		const hit = cache.get(baseUrl);
		if (hit && now() - hit.at < MODELS_TTL_MS) return hit.models;
		try {
			const response = await fetch(`${baseUrl}/models`, signal ? { signal } : {});
			if (!response.ok) return 'unreachable';
			const body = (await response.json()) as {
				data?: { id?: unknown; root?: unknown; max_model_len?: unknown }[];
			};
			const models: ServedModel[] = (body.data ?? [])
				.filter((m) => typeof m.id === 'string')
				.map((m) => ({
					id: m.id as string,
					...(typeof m.root === 'string' ? { root: m.root } : {}),
					...(typeof m.max_model_len === 'number' ? { maxModelLen: m.max_model_len } : {})
				}));
			cache.set(baseUrl, { at: now(), models });
			return models;
		} catch {
			// A refused or failed connection is "unreachable", never the transport's own words.
			return 'unreachable';
		}
	}

	async function survey(signal?: AbortSignal) {
		return Promise.all(
			baseUrls.map(async (baseUrl) => ({ baseUrl, models: await modelsAt(baseUrl, signal) }))
		);
	}

	async function unavailable(wanted: string, signal?: AbortSignal): Promise<SparkUnavailable> {
		const seen = await survey(signal);
		const lines = seen.map(({ baseUrl, models }) =>
			models === 'unreachable'
				? `${baseUrl}: unreachable`
				: `${baseUrl}: serving ${models.map((m) => m.id).join(', ') || 'nothing'}`
		);
		return new SparkUnavailable(
			`No DGX Spark is serving "${wanted}" right now (${lines.join('; ')}). Switch a unit to a mode that serves it, e.g. \`scripts/spark-mode.sh spark1 puzzle\`, and try again.`
		);
	}

	async function routes(wanted: string, signal?: AbortSignal): Promise<SparkRoute[]> {
		const found: SparkRoute[] = [];
		for (const baseUrl of baseUrls) {
			const models = await modelsAt(baseUrl, signal);
			if (models === 'unreachable') continue;
			const model = models.find((m) => servesModel(m, wanted));
			if (model) found.push({ baseUrl, model });
		}
		return found;
	}

	return {
		survey,
		async route(wanted, signal) {
			const [first] = await routes(wanted, signal);
			if (!first) throw await unavailable(wanted, signal);
			return first;
		},
		async post(wanted, path, body, signal) {
			const candidates = await routes(wanted, signal);
			if (candidates.length === 0) throw await unavailable(wanted, signal);
			let last: Response | undefined;
			for (const route of candidates) {
				let response: Response;
				try {
					response = await fetch(`${route.baseUrl}${path}`, {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify(body(route.model.id)),
						...(signal ? { signal } : {})
					});
				} catch (cause) {
					if (signal?.aborted) throw cause;
					cache.delete(route.baseUrl);
					continue;
				}
				// A mode switched under us answers 404 for the name; a loading unit answers 5xx.
				if (response.status === 404 || TRANSIENT.has(response.status)) {
					cache.delete(route.baseUrl);
					last = response;
					continue;
				}
				return { response, route };
			}
			if (last) return { response: last, route: candidates.at(-1)! };
			throw await unavailable(wanted, signal);
		}
	};
}
