import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EVENT_TYPES } from '@craftabot/core';
import { makeEvent, makeRun } from '@craftabot/core/testing';
import { main } from '../cli.js';
import { createFileStorage } from '../storage/file-storage.js';
import { sensorsFor } from './sensors.js';

/**
 * `craftabot sensors list | export` (WP159, `112-REAL-ENOUGH-PLAN.md` §5):
 * the inventory the Workshop's page folds, from the host — the counts and the
 * open findings, or the whole table as JSON or markdown, with `--store`
 * adding how many of each type a run store holds.
 */
let dir: string;
beforeAll(async () => {
	dir = await mkdtemp(join(tmpdir(), 'cab-sensors-'));
});
afterAll(async () => {
	await rm(dir, { recursive: true, force: true });
});

function io() {
	const lines: string[] = [];
	const errors: string[] = [];
	return {
		lines,
		errors,
		io: {
			stdout: (text: string) => void lines.push(text),
			stderr: (text: string) => void errors.push(text),
			env: {}
		}
	};
}

describe('craftabot sensors', () => {
	it('folds every event type, and counts a store’s events when given one', async () => {
		const bare = await sensorsFor({ generatedAt: '2026-10-02T00:00:00.000Z' });
		expect(bare.rows.map((row) => row.type)).toEqual([...EVENT_TYPES]);
		expect(bare.observed).toBeUndefined();

		const storage = await createFileStorage(join(dir, 'store'));
		const run = makeRun();
		await storage.putRun(run);
		await storage.appendEvents(run.id, [makeEvent(run.id, 0, 1), makeEvent(run.id, 1, 2)]);
		const counted = await sensorsFor({ storage, generatedAt: '2026-10-02T00:00:00.000Z' });
		expect(counted.observed?.['tick.started']).toBe(2);
	});

	it('lists the counts and the open findings, and exports markdown and JSON', async () => {
		const listed = io();
		expect(await main(['sensors', 'list'], listed.io)).toBe(0);
		expect(listed.lines.join('')).toMatch(/^sensors: 34 event types/);
		expect(listed.lines.join('')).toContain('open  decision.fault');

		const out = join(dir, 'sensors.md');
		const written = io();
		expect(
			await main(['sensors', 'export', '--format', 'markdown', '--out', out], written.io)
		).toBe(0);
		expect(await readFile(out, 'utf8')).toContain('| `guardrail.checked` |');

		const json = io();
		expect(await main(['sensors', 'export'], json.io)).toBe(0);
		expect(JSON.parse(json.lines.join('')).summary.types).toBe(EVENT_TYPES.length);
	});

	it('refuses a verb it does not know', async () => {
		const bad = io();
		expect(await main(['sensors', 'nope'], bad.io)).toBe(1);
		expect(bad.errors.join('')).toContain('sensors needs list | export');
	});
});
