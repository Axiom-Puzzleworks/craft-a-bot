import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	parseAnyProviderCassette,
	type ProviderCassetteFile,
	type ProviderRecordingFile
} from '@craftabot/core';

/**
 * **A brain's provider cassette, from disk** (WP114, `103-FALLIBLE-ACTORS.md`
 * §4; WP190, `113-RECORDING-AND-RELIABILITY.md`): `evals` never reads a file,
 * so the harness hands the runner this loader as `cassetteFor`. A path is
 * resolved against `root` (the working directory by default), read once and
 * parsed against the provider cassette schema of whichever version the file
 * is — the merged, prompt-keyed cassette (version 1) or the cell-scoped
 * recording (version 2); a file that is neither is refused before any cell
 * runs on it.
 */
export function cassetteLoader(
	root: string = process.cwd()
): (path: string) => ProviderCassetteFile | ProviderRecordingFile {
	const cache = new Map<string, ProviderCassetteFile | ProviderRecordingFile>();
	return (path) => {
		const absolute = resolve(root, path);
		const cached = cache.get(absolute);
		if (cached) return cached;
		let parsed: ProviderCassetteFile | ProviderRecordingFile;
		try {
			parsed = parseAnyProviderCassette(JSON.parse(readFileSync(absolute, 'utf8'))).file;
		} catch (error) {
			throw new Error(
				`${path} is not a provider cassette: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
				{ cause: error }
			);
		}
		cache.set(absolute, parsed);
		return parsed;
	};
}

/** The model a cassette of either version was answered by, for the provenance a replayed run carries. */
export function cassetteModel(file: ProviderCassetteFile | ProviderRecordingFile): string {
	return file.kind === 'provider-recording'
		? (file.manifest.models[0] ?? 'unrecorded')
		: (file.entries[0]?.model ?? 'unrecorded');
}
