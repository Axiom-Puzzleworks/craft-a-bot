import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseContentRecord, type ContentRecord } from '@craftabot/core';
import { readContentDir } from '../storage/file-storage.js';

/**
 * **`craftabot content`** (`34-CONTENT-STORE.md` §4.5, WP46): the harness's
 * `content/` directory is the Workshop content store's file form —
 * `<segment>/<slug>.json`, one `ContentRecord` each — read into the `local`
 * pack by every command through `--content <dir>`. `list` shows what is
 * there; `add` validates a record file and files it under its own id.
 */

export const DEFAULT_CONTENT_DIR = './content';

export function contentPathFor(dir: string, id: string): string {
	return join(dir, `${id.replace(/^local\//, '')}.json`);
}

export async function listContent(dir: string): Promise<ContentRecord[]> {
	return readContentDir(dir);
}

export async function addContent(dir: string, file: string): Promise<ContentRecord> {
	const record = parseContentRecord(JSON.parse(await readFile(file, 'utf8')));
	const path = contentPathFor(dir, record.id);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(record, null, '\t')}\n`, 'utf8');
	return record;
}

export function renderContent(records: readonly ContentRecord[]): string {
	if (records.length === 0) return 'no authored content\n';
	const lines = records.map(
		(record) => `${record.kind.padEnd(14)} ${record.id.padEnd(40)} ${record.title}`
	);
	return `${lines.join('\n')}\n`;
}
