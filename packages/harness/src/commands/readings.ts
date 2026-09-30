import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	reviewsFromContent,
	type ContentRecord,
	type PackManifest,
	type Review,
	type Storage
} from '@craftabot/core';
import { GUARDRAIL_CATALOGUE } from '@craftabot/governance';
import {
	readingQueue,
	readingSourcesFrom,
	readingSubjects,
	readingsExport,
	renderReadingsMarkdown,
	type ReadingBlueprintNote,
	type ReadingsExport
} from '@craftabot/governance/reports';
import { SCREENING_READINGS } from '@craftabot/pack-fs-bank';

/**
 * **`craftabot readings export`** (WP129, `108-READINGS.md` §4, §6): the
 * reading desk's queue from the host's side. The subjects are the eight kinds
 * the installed packs, the catalogue, the blueprint notes and the bank's
 * screening lists ship pending; the readings are the `review` records (and the
 * `control-review` alias) in the content directory and, with `--store`, in a
 * run store. The same fold `/workshop/readings` renders, written as JSON or as
 * the maintainer's markdown work list.
 */

/** The blueprint notes in a directory (`docs/blueprints` by default): every `.md` but the blueprint itself. */
export async function readBlueprintNotes(dir: string): Promise<ReadingBlueprintNote[]> {
	if (!existsSync(dir)) return [];
	const names = (await readdir(dir))
		.filter((name) => name.endsWith('.md') && name !== 'DOMAIN-PACK.md')
		.sort();
	return Promise.all(
		names.map(async (name) => {
			const markdown = await readFile(join(dir, name), 'utf8');
			const heading = /^# (.+)$/m.exec(markdown)?.[1] ?? name;
			return { id: name.replace(/\.md$/, '').toLowerCase(), title: heading, markdown };
		})
	);
}

export interface ReadingsExportOptions {
	packs: readonly PackManifest[];
	/** The content directory's records (`--content`). */
	content?: readonly ContentRecord[];
	/** A run store whose content holds readings too (`--store`). */
	storage?: Storage;
	blueprints?: readonly ReadingBlueprintNote[];
	generatedAt: string;
}

export async function readingsFor(options: ReadingsExportOptions): Promise<ReadingsExport> {
	const records: ContentRecord[] = [...(options.content ?? [])];
	if (options.storage)
		records.push(
			...(await options.storage.listContent('review')),
			...(await options.storage.listContent('control-review'))
		);
	const reviews: Review[] = reviewsFromContent(records);
	const subjects = readingSubjects(
		readingSourcesFrom(options.packs, {
			catalogue: GUARDRAIL_CATALOGUE,
			blueprints: options.blueprints ?? [],
			screeningLists: SCREENING_READINGS
		})
	);
	return readingsExport(readingQueue(subjects, reviews), options.generatedAt);
}

export async function writeReadings(
	file: ReadingsExport,
	format: 'json' | 'markdown',
	out?: string
): Promise<string> {
	const text =
		format === 'markdown' ? renderReadingsMarkdown(file) : `${JSON.stringify(file, null, '\t')}\n`;
	if (out) await writeFile(out, text, 'utf8');
	return text;
}

/** One line per kind, for the terminal. */
export function renderReadingsSummary(file: ReadingsExport): string {
	const open = file.progress.reduce((sum, row) => sum + row.open, 0);
	const total = file.progress.reduce((sum, row) => sum + row.total, 0);
	return `${[
		`readings: ${total - open} of ${total} read, ${open} open`,
		...file.progress.map(
			(row) =>
				`  ${row.kind.padEnd(16)} ${String(row.read).padStart(4)} of ${String(row.total).padEnd(4)} open ${row.open}${row.amended ? `, ${row.amended} amended` : ''}${row.rejected ? `, ${row.rejected} rejected` : ''}`
		)
	].join('\n')}\n`;
}
