import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import validAgentSpec from '../fixtures/agent-spec.v1.valid.json';
import invalidAgentSpec from '../fixtures/agent-spec.v1.invalid.json';
import validAgentRecord from '../fixtures/agent-record.v1.valid.json';
import invalidAgentRecord from '../fixtures/agent-record.v1.invalid.json';
import validStoredEvent from '../fixtures/stored-event.v1.valid.json';
import invalidStoredEvent from '../fixtures/stored-event.v1.invalid.json';
import validPackManifest from '../fixtures/pack-manifest.v1.valid.json';
import invalidPackManifest from '../fixtures/pack-manifest.v1.invalid.json';
import validKitFile from '../fixtures/kit-file.v1.valid.json';
import invalidKitFile from '../fixtures/kit-file.v1.invalid.json';
import validTraceFile from '../fixtures/trace-file.v1.valid.json';
import invalidTraceFile from '../fixtures/trace-file.v1.invalid.json';

import { agentSpecSchema } from './agent-spec.js';
import { kitFileSchema } from './kit-file.js';
import { packManifestMetadataSchema } from './pack-manifest.js';
import { agentRecordSchema, storedEventSchema } from './records.js';
import { traceFileSchema } from './trace-file.js';

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
		name: 'AgentRecord v1',
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
		name: 'KitFile v1',
		schema: kitFileSchema,
		valid: validKitFile,
		invalid: invalidKitFile,
		shareable: true
	},
	{
		name: 'TraceFile v1',
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
		expect(CASES.map((entry) => entry.name.replace(/ v\d+$/, '')).sort()).toEqual([
			'AgentRecord',
			'AgentSpec',
			'KitFile',
			'PackManifest',
			'StoredEvent',
			'TraceFile'
		]);
	});

	it('gives every invalid fixture a different shape from its valid twin', () => {
		// A copy-pasted "invalid" fixture that is actually valid proves nothing,
		// and the rejection test above would still pass for the wrong reason.
		for (const { name, valid, invalid } of CASES) {
			expect(JSON.stringify(invalid), name).not.toBe(JSON.stringify(valid));
		}
	});
});
