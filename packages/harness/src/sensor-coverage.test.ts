import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sensorInventory } from '@craftabot/governance/reports';
import { bankRun } from './commands/bank.js';
import { defaultConfig } from './config.js';
import { credentialsFromEnv } from './credentials.js';
import { sensorFixtures } from './testing/sensor-fixtures.js';
import { harvestEvents, observe, type Observed } from './testing/event-harvest.js';

/**
 * **Sensor coverage** (WP159 stage B, `112-REAL-ENOUGH-PLAN.md` §5): every
 * event type the Sensor Inventory lists fires at least once, and every
 * optional payload field is seen filled somewhere, over the seven-desk bank
 * day (the workflow and desk paths, with truth) and the small fixtures
 * (`testing/sensor-fixtures.ts`: the corners the bank day does not reach — a
 * planted fault, a hosted guard, elevation, a fork, a group, the Gate). A
 * sensor that goes quiet fails here by name. A type declared `browser-only`
 * must *not* fire (a stale declaration is as wrong as a quiet sensor).
 */
const ROOT = resolve(import.meta.dirname, '../../..');
const roots: string[] = [];
const seen: Observed = { types: new Map(), fields: new Set() };

afterAll(async () => {
	for (const root of roots) await rm(root, { recursive: true, force: true });
});

beforeAll(async () => {
	const root = await mkdtemp(join(tmpdir(), 'craftabot-sensors-'));
	roots.push(root);
	await bankRun({
		day: '2026-06-10',
		desksPath: join(ROOT, 'campaigns/desks/bank-day.json'),
		seed: 1,
		size: 500,
		brain: 'scripted-optimal',
		out: root,
		config: defaultConfig(),
		credentials: credentialsFromEnv({}),
		egress: 'none',
		// The wiring of WP160's retention rides on the day: any value over the cap lands under <out>/values.
		keepValues: true
	});
	observe(await harvestEvents(root), seen);
	for (const fixture of await sensorFixtures()) observe(fixture.events, seen);
}, 300_000);

describe('sensor coverage', () => {
	it('sees every event type fire, except those declared browser-only, which must not', () => {
		const quiet: string[] = [];
		const stale: string[] = [];
		for (const row of sensorInventory()) {
			const fired = seen.types.has(row.type);
			if (row.reach?.kind === 'browser-only') {
				if (fired) stale.push(row.type);
			} else if (!fired) quiet.push(row.type);
		}
		expect({ quiet, stale }).toEqual({ quiet: [], stale: [] });
	});

	it('sees every optional payload field filled somewhere, and the envelope’s', () => {
		const unfilled = sensorInventory().flatMap((row) =>
			row.fields
				.filter((field) => field.optional && !seen.fields.has(`${row.type}.${field.name}`))
				.map((field) => `${row.type}.${field.name}`)
		);
		expect(unfilled).toEqual([]);
		expect(seen.fields.has('envelope.agentId')).toBe(true);
		expect(seen.fields.has('envelope.parentRunId')).toBe(true);
	});
});
