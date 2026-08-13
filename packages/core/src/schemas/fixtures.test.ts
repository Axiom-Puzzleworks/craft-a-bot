import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import validAgentSpec from '../fixtures/agent-spec.v1.valid.json';
import invalidAgentSpec from '../fixtures/agent-spec.v1.invalid.json';
import validAgentSpecV2 from '../fixtures/agent-spec.v2.valid.json';
import invalidAgentSpecV2 from '../fixtures/agent-spec.v2.invalid.json';
import validAgentRecordV1 from '../fixtures/agent-record.v1.valid.json';
import validAgentRecord from '../fixtures/agent-record.v2.valid.json';
import invalidAgentRecord from '../fixtures/agent-record.v2.invalid.json';
import validStoredEvent from '../fixtures/stored-event.v1.valid.json';
import invalidStoredEvent from '../fixtures/stored-event.v1.invalid.json';
import validPackManifest from '../fixtures/pack-manifest.v1.valid.json';
import invalidPackManifest from '../fixtures/pack-manifest.v1.invalid.json';
import validKitFileV1 from '../fixtures/kit-file.v1.valid.json';
import validKitFile from '../fixtures/kit-file.v2.valid.json';
import invalidKitFile from '../fixtures/kit-file.v2.invalid.json';
import validTraceFileV1 from '../fixtures/trace-file.v1.valid.json';
import validTraceFile from '../fixtures/trace-file.v2.valid.json';
import invalidTraceFile from '../fixtures/trace-file.v2.invalid.json';

import { agentSpecSchema } from './agent-spec.js';
import { agentSpecV2Schema } from './agent-spec-v2.js';
import { kitFileSchema, migrateKitFile } from './kit-file.js';
import { packManifestMetadataSchema } from './pack-manifest.js';
import { agentRecordSchema, migrateAgentRecord, storedEventSchema } from './records.js';
import { migrateTraceFile, traceFileSchema } from './trace-file.js';

/**
 * **The compatibility contract** (`13-…` §3).
 *
 * One valid and one invalid fixture file per schema per historical version,
 * driven through the same four checks. The files matter more than the checks
 * do: they are a frozen record of what a given version of Craft A Bot wrote to
 * disk, and they accumulate forever. A user's kit file from today must still
 * open in two years, and the only way to know that is to keep a copy of what
 * today wrote and keep parsing it.
 *
 * Adding a version means adding files, never editing them. If a fixture has to
 * change to keep a test passing, the schema has made a breaking change and
 * wants a migration instead.
 *
 * Kit files and trace files have their own suites as well, covering migration
 * and passthrough; this is the uniform floor underneath all of them.
 */

type Case = {
	name: string;
	schema: z.ZodType;
	valid: unknown;
	invalid: unknown;
	/** Artefacts a user can hand to someone else, which must never carry a key. */
	shareable?: boolean;
};

const CASES: Case[] = [
	{
		name: 'AgentSpec v1',
		schema: agentSpecSchema,
		valid: validAgentSpec,
		invalid: invalidAgentSpec
	},
	{
		name: 'AgentSpec v2',
		schema: agentSpecV2Schema,
		valid: validAgentSpecV2,
		invalid: invalidAgentSpecV2
	},
	{
		name: 'AgentRecord v2',
		schema: agentRecordSchema,
		valid: validAgentRecord,
		invalid: invalidAgentRecord
	},
	{
		name: 'StoredEvent v1',
		schema: storedEventSchema,
		valid: validStoredEvent,
		invalid: invalidStoredEvent
	},
	{
		name: 'PackManifest v1',
		schema: packManifestMetadataSchema,
		valid: validPackManifest,
		invalid: invalidPackManifest
	},
	{
		name: 'KitFile v2',
		schema: kitFileSchema,
		valid: validKitFile,
		invalid: invalidKitFile,
		shareable: true
	},
	{
		name: 'TraceFile v2',
		schema: traceFileSchema,
		valid: validTraceFile,
		invalid: invalidTraceFile,
		shareable: true
	}
];

describe.each(CASES)('$name', ({ schema, valid, invalid, shareable }) => {
	it('parses its valid fixture', () => {
		expect(schema.safeParse(valid).success).toBe(true);
	});

	it('rejects its invalid fixture', () => {
		expect(schema.safeParse(invalid).success).toBe(false);
	});

	it('round-trips parse → serialise → parse unchanged', () => {
		const first = schema.parse(valid);
		expect(schema.parse(JSON.parse(JSON.stringify(first)))).toEqual(first);
	});

	it('is stable under re-parsing its own output', () => {
		// Catches a schema that quietly rewrites what it reads — a default that
		// fires on the second pass, a transform that is not idempotent. Either
		// would mean a file drifts every time it is opened and saved.
		const once = schema.parse(valid);
		const twice = schema.parse(once);
		expect(twice).toEqual(once);
	});

	if (shareable) {
		it('carries no API key, because a person can send this file to someone', () => {
			// Hard rule 2. The CI key-leak gate covers the live export paths; this
			// covers the fixtures those paths are checked against.
			expect(JSON.stringify(valid)).not.toMatch(/apiKey|sk-[A-Za-z0-9]/i);
		});
	}
});

describe('the fixture set itself', () => {
	it('covers every schema that crosses a storage or wire boundary', () => {
		// A boundary schema with no fixture has no compatibility contract, which
		// is how a format change ships unnoticed. Adding one to `07-…` §3 means
		// adding it here.
		const covered = [...new Set(CASES.map((entry) => entry.name.replace(/ v\d+$/, '')))].sort();
		expect(covered).toEqual([
			'AgentRecord',
			'AgentSpec',
			'KitFile',
			'PackManifest',
			'StoredEvent',
			'TraceFile'
		]);
	});

	/**
	 * The reason the older fixtures are kept rather than replaced: a format
	 * that has moved on still has to be able to read what it used to write.
	 */
	it('still reads the v1 trace it used to write, and upgrades it', () => {
		const migrated = migrateTraceFile(validTraceFileV1);
		expect('kind' in migrated, JSON.stringify(migrated).slice(0, 200)).toBe(false);
		if ('kind' in migrated) return;

		expect(migrated.formatVersion).toBe(2);
		// v1 knew who the agent was on the run; every event now says so too.
		expect(migrated.events.every((event) => event.agentId === migrated.run.agentId)).toBe(true);
		// What v1 genuinely did not record is admitted, not invented.
		expect(migrated.run.providerId).toBe('unrecorded');
		expect(migrated.run.wireModel).toBe('unrecorded');
	});

	/**
	 * The same promise for the two files a *user* owns: the bots on their shelf
	 * and the kit they were sent. WP14 changed the shape of both, and neither
	 * change is allowed to cost anyone a bot.
	 */
	it('still reads the v1 shelf it used to write, and upgrades it', () => {
		const migrated = migrateAgentRecord(validAgentRecordV1);
		expect('kind' in migrated, JSON.stringify(migrated).slice(0, 200)).toBe(false);
		if ('kind' in migrated) return;

		expect(migrated.schemaVersion).toBe(2);
		expect(migrated.spec.bricks.map((brick) => brick.slot)).toContain('brain');
		// The seed lived on the row and now lives on the bot, so the box art a
		// person has been looking at for a year is the box art they keep.
		expect(migrated.spec.identity.boxArtSeed).toBe(validAgentRecordV1.boxArtSeed);
	});

	it('still reads the v1 kit it used to write, and names the packs its bricks came from', () => {
		const migrated = migrateKitFile(validKitFileV1);
		expect('kind' in migrated, JSON.stringify(migrated).slice(0, 200)).toBe(false);
		if ('kind' in migrated) return;

		expect(migrated.formatVersion).toBe(2);
		expect(migrated.requires.brickKinds['starter/llm']).toBe('starter');
		expect(Object.keys(migrated.requires.brickKinds)).toHaveLength(migrated.agent.bricks.length);
	});

	it('refuses a trace from a format it has never heard of', () => {
		const result = migrateTraceFile({ ...validTraceFileV1, formatVersion: 99 });
		expect(result).toMatchObject({ kind: 'migration-error', detectedVersion: 99 });
		expect((result as { message: string }).message).toContain('newer');
	});

	it('gives every invalid fixture a different shape from its valid twin', () => {
		// A copy-pasted "invalid" fixture that is actually valid proves nothing,
		// and the rejection test above would still pass for the wrong reason.
		for (const { name, valid, invalid } of CASES) {
			expect(JSON.stringify(invalid), name).not.toBe(JSON.stringify(valid));
		}
	});
});
