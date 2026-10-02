import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { EngineEvent } from '@craftabot/core';

/**
 * **Every event a harness output directory holds** (WP159, `112-…` §5): the
 * agent runs' `events.jsonl` under `<dir>/runs/*` (one `StoredEvent` a line)
 * and the workflows' own events under `<dir>/workflows/*`, which the bank
 * day writes. The sensor coverage test folds these; nothing else reads them
 * this way, so it lives with the tests.
 */
export async function harvestEvents(dir: string): Promise<EngineEvent[]> {
	const events: EngineEvent[] = [];
	for (const run of await listDirs(join(dir, 'runs'))) {
		let text: string;
		try {
			text = await readFile(join(dir, 'runs', run, 'events.jsonl'), 'utf8');
		} catch {
			continue;
		}
		for (const line of text.split('\n')) {
			if (line.trim() === '') continue;
			events.push((JSON.parse(line) as { event: EngineEvent }).event);
		}
	}
	for (const workflow of await listDirs(join(dir, 'workflows'))) {
		try {
			const run = JSON.parse(
				await readFile(join(dir, 'workflows', workflow, 'workflow-run.json'), 'utf8')
			) as { events?: EngineEvent[] };
			events.push(...(run.events ?? []));
		} catch {
			continue;
		}
	}
	return events;
}

async function listDirs(path: string): Promise<string[]> {
	try {
		return (await readdir(path, { withFileTypes: true }))
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);
	} catch {
		return [];
	}
}

/** What was seen: the types that fired, and `type.field` for each payload field (and `envelope.field`) that was present. */
export interface Observed {
	types: Map<string, number>;
	fields: Set<string>;
}

export function observe(events: readonly EngineEvent[], into?: Observed): Observed {
	const seen = into ?? { types: new Map(), fields: new Set() };
	for (const event of events) {
		seen.types.set(event.type, (seen.types.get(event.type) ?? 0) + 1);
		for (const key of ['agentId', 'parentRunId'] as const)
			if (event[key] !== undefined) seen.fields.add(`envelope.${key}`);
		for (const [key, value] of Object.entries(event.payload as Record<string, unknown>))
			if (value !== undefined) seen.fields.add(`${event.type}.${key}`);
	}
	return seen;
}
