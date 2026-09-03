import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseCorpusJsonl, scenarioPackFrom, scenariosFromCorpus } from '@craftabot/evals';
import { createRegistry, type HarnessConfig } from '../config.js';

/**
 * **`craftabot scenarios`** (`32-SCENARIOS.md` §4.5, WP44): a JSONL corpus
 * becomes a scenario pack file over one goal card. The card must be one a
 * configured pack ships — the importer refuses to write a file no campaign
 * could run.
 */

export interface ImportCorpusOptions {
	file: string;
	card: string;
	out: string;
	config: HarnessConfig;
	id?: string;
	name?: string;
	/** The manual key each row is filed under; the warning-sign adversary plan looks up `sign`. */
	key?: string;
	tags?: string[];
}

export interface ImportCorpusResult {
	file: string;
	count: number;
	tags: string[];
}

export async function importCorpusFile(options: ImportCorpusOptions): Promise<ImportCorpusResult> {
	const registry = createRegistry(options.config);
	if (!registry.getGoalCard(options.card)) {
		throw new Error(`goal card "${options.card}" is not one a configured pack ships`);
	}
	const rows = parseCorpusJsonl(await readFile(options.file, 'utf8'));
	const id = options.id ?? 'corpus';
	const scenarios = scenariosFromCorpus(rows, {
		baseCardId: options.card,
		idPrefix: `${id}/scenarios`,
		delivery: { kind: 'manual-entry', key: options.key ?? 'sign' },
		...(options.tags ? { tags: options.tags } : {})
	});
	const pack = scenarioPackFrom(id, options.name ?? `Corpus over ${options.card}`, scenarios);
	await mkdir(dirname(options.out), { recursive: true });
	await writeFile(options.out, `${JSON.stringify(pack, null, '\t')}\n`, 'utf8');
	return {
		file: options.out,
		count: scenarios.length,
		tags: [...new Set(scenarios.flatMap((scenario) => scenario.tags))].sort()
	};
}
