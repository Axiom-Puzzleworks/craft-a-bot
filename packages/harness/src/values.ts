import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalJson } from '@craftabot/core';

/**
 * **A stage value kept beside the run** (WP160, `112-REAL-ENOUGH-PLAN.md` §5):
 * a workflow's record keeps a stage's input or output only under `VALUE_CAP`;
 * over it, the digest alone. With `--keep-values` the host keeps the whole
 * value under `<out>/values/<digest>.json` — canonical JSON, named by the
 * digest the record carries — so a story can open it. Once per digest;
 * nothing else reads these files, and the record is unchanged.
 */
export interface ValueKeeper {
	keep(value: { digest: string; value: unknown }): void;
	/** Every write finished: await before the run is reported. */
	done(): Promise<void>;
	/** The digests kept so far. */
	readonly kept: ReadonlySet<string>;
}

export function valueKeeper(out: string): ValueKeeper {
	const directory = join(out, 'values');
	const kept = new Set<string>();
	let writing: Promise<unknown> = Promise.resolve();
	return {
		keep({ digest, value }) {
			if (kept.has(digest)) return;
			kept.add(digest);
			const text = `${canonicalJson(value)}\n`;
			writing = writing
				.then(() => mkdir(directory, { recursive: true }))
				.then(() => writeFile(join(directory, `${digest}.json`), text, 'utf8'));
		},
		done: async () => {
			await writing;
		},
		kept
	};
}
