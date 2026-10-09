import { parseExperimentResult, type ExperimentResult } from '@craftabot/core';
import { experimentSchema, type Experiment } from '@craftabot/evals';

/**
 * **The live recordings the site serves** (WP196's remainder, `114-DECISIONS-UNDER-PRESSURE-PLAN.md`; G134, G194): the committed
 * live results, their designs and (through `loadCassettes`) their cassettes, emitted beside the app by the build
 * (`scripts/live-site-assets.mjs`). The Experiments page lists them, opens a recorded result and replays a design in the
 * Worker from its cassette. An edition that does not serve them answers 404 and the list is empty, never an error: the live
 * column is drawn from what was recorded or not at all.
 */
export interface LiveRecording {
	id: string;
	/** `giant` (the 122B) or `oversight` (the 122B with a person at the decisions). */
	suite: string;
	title: string;
	model: string;
	recordedOn: string;
	verdict: string;
	cells: number;
	trials: number;
	/** Paths under the edition's base. */
	result: string;
	design: string;
}

export async function loadLiveIndex(
	base: string,
	fetcher: typeof fetch = fetch
): Promise<LiveRecording[]> {
	try {
		const response = await fetcher(`${base}/live/index.json`);
		if (!response.ok) return [];
		const parsed: unknown = await response.json();
		return Array.isArray(parsed) ? (parsed as LiveRecording[]) : [];
	} catch {
		return [];
	}
}

async function fetchJson(base: string, path: string, fetcher: typeof fetch): Promise<unknown> {
	const response = await fetcher(`${base}/${path}`);
	if (!response.ok) throw new Error(`${path} is not served by this edition (${response.status})`);
	return response.json();
}

/** A recorded result, held to its digest on the way in. */
export async function fetchLiveResult(
	base: string,
	recording: LiveRecording,
	fetcher: typeof fetch = fetch
): Promise<ExperimentResult> {
	return parseExperimentResult(await fetchJson(base, recording.result, fetcher));
}

/** A recorded design, ready to expand; its brain names the cassette `loadCassettes` fetches. */
export async function fetchLiveDesign(
	base: string,
	recording: LiveRecording,
	fetcher: typeof fetch = fetch
): Promise<Experiment> {
	const file = await fetchJson(base, recording.design, fetcher);
	return experimentSchema.parse(file);
}
