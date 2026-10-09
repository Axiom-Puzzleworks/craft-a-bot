import {
	parseAnyProviderCassette,
	type ProviderCassetteFile,
	type ProviderRecordingFile
} from '@craftabot/core';

/**
 * **A live brain's cassette, served from the edition** (WP172, `112-REAL-ENOUGH-PLAN.md`
 * §5, D10): the Worker cannot read a file and refuses a live brain with no
 * provider, so the page fetches the cassettes a campaign's brains name and hands
 * them to the Worker, which replays them (`103-…` §4). A cassette the edition
 * does not serve is an error that names the path, never a silent scripted
 * stand-in: the live column is drawn from what was recorded or not at all.
 *
 * The files are served under `<base>/cassettes/<path>`, the path as the
 * campaign writes it. Nothing here touches a key: a cassette holds responses.
 */
export const CASSETTE_DIRECTORY = 'cassettes';

/** The cassette paths a campaign's brains name, once each. */
export function cassettePathsOf(campaign: unknown): string[] {
	const brains = (campaign as { brains?: unknown } | null)?.brains;
	if (!Array.isArray(brains)) return [];
	const paths = new Set<string>();
	for (const brain of brains) {
		const path = (brain as { cassette?: unknown } | null)?.cassette;
		if (typeof path === 'string' && path !== '') paths.add(path);
	}
	return [...paths];
}

export async function loadCassettes(
	campaign: unknown,
	base: string,
	fetcher: typeof fetch = fetch
): Promise<Record<string, ProviderCassetteFile | ProviderRecordingFile>> {
	const loaded: Record<string, ProviderCassetteFile | ProviderRecordingFile> = {};
	for (const path of cassettePathsOf(campaign)) {
		const url = `${base}/${CASSETTE_DIRECTORY}/${path}`;
		const response = await fetcher(url);
		if (!response.ok)
			throw new Error(
				`the cassette ${path} is not served by this edition (${response.status} at ${url}); a live brain is replayed from its recording or not run`
			);
		try {
			loaded[path] = parseAnyProviderCassette(await response.json()).file;
		} catch (error) {
			throw new Error(
				`${path} is not a provider cassette: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
				{ cause: error }
			);
		}
	}
	return loaded;
}
