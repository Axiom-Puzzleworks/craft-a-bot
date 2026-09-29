import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseProviderCassette, type ProviderCassetteFile } from '@craftabot/core';

/**
 * **A brain's provider cassette, from disk** (WP114, `103-FALLIBLE-ACTORS.md`
 * §4): `evals` never reads a file, so the harness hands the runner this
 * loader as `cassetteFor`. A path is resolved against `root` (the working
 * directory by default), read once and parsed against the provider cassette
 * schema; a file that is not one is refused before any cell runs on it.
 */
export function cassetteLoader(
	root: string = process.cwd()
): (path: string) => ProviderCassetteFile {
	const cache = new Map<string, ProviderCassetteFile>();
	return (path) => {
		const absolute = resolve(root, path);
		const cached = cache.get(absolute);
		if (cached) return cached;
		let parsed: ProviderCassetteFile;
		try {
			parsed = parseProviderCassette(JSON.parse(readFileSync(absolute, 'utf8')));
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
