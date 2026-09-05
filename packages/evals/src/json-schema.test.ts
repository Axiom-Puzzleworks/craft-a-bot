import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { buildTraceBundle, evaluationRecordSchema, parseTraceFile } from '@craftabot/core';
import starterPack from '@craftabot/pack-starter';
import workshopPack from '@craftabot/pack-workshop';
import { injectionBaseline } from './baseline-campaign.js';
import { runCampaign } from './campaign.js';
import { scenarioPackFrom } from './corpus.js';
// @ts-expect-error — a plain ESM script with no types; it is the generator the build runs.
import { generateSchemas, schemaFile } from '../../../scripts/json-schema.mjs';

/**
 * `docs/schemas/` is for readers in other languages (WP56 stage C, `41-…`
 * §6.16), so the proof is a validator that is not Zod: Ajv, over the
 * generated JSON Schema, accepting a real instance of every artefact —
 * fixtures where they exist, artefacts built the way the app builds them
 * where they do not — and refusing a known-bad one. And the committed files
 * are the generator's output, exactly: a change to a Zod source without
 * `npm run schemas` fails here as it fails `npm run build`.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const CORE_FIXTURES = resolve(REPO, 'packages', 'core', 'src', 'fixtures');
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

type Schemas = Record<string, Record<string, unknown>>;
const schemas = (await generateSchemas()) as Schemas;
const ajv = new Ajv2020({ strict: false, validateFormats: false });
const validator = (name: string) => ajv.compile(schemas[name] as object);

describe('docs/schemas', () => {
	it('is exactly what the generator produces from the code today', () => {
		for (const [name, schema] of Object.entries(schemas)) {
			expect(readJson(schemaFile(name) as string), name).toEqual(schema);
		}
	});

	it('names seven artefacts, each with an $id, a title and a draft-2020-12 marker', () => {
		expect(Object.keys(schemas).sort()).toEqual([
			'campaign',
			'campaign-report',
			'craftabot-bundle',
			'craftabot-cassette',
			'craftabot-scenarios',
			'craftabot-trace',
			'evaluation-record'
		]);
		for (const [name, schema] of Object.entries(schemas)) {
			expect(schema.$id, name).toContain(`${name}.schema.json`);
			expect(schema.title, name).toBeTruthy();
			expect(schema.$schema, name).toContain('2020-12');
		}
	});

	it('craftabot-trace accepts the v2 fixture and refuses the invalid one', () => {
		const validate = validator('craftabot-trace');
		expect(validate(readJson(resolve(CORE_FIXTURES, 'trace-file.v2.valid.json')))).toBe(true);
		expect(validate(readJson(resolve(CORE_FIXTURES, 'trace-file.v2.invalid.json')))).toBe(false);
	});

	it('craftabot-bundle accepts a bundle built over the trace fixture', async () => {
		const trace = parseTraceFile(readJson(resolve(CORE_FIXTURES, 'trace-file.v2.valid.json')));
		const bundle = await buildTraceBundle({
			runs: [{ run: trace.run, events: trace.events }],
			exportedBy: 'json-schema.test',
			exportedAt: '2026-09-05T12:00:00.000Z'
		});
		const validate = validator('craftabot-bundle');
		expect(validate(JSON.parse(JSON.stringify(bundle))), JSON.stringify(validate.errors)).toBe(
			true
		);
	});

	it('craftabot-scenarios accepts a pack file over the starter scenarios', () => {
		const file = scenarioPackFrom('test/scenarios', 'Test scenarios', starterPack.scenarios ?? []);
		expect(file.scenarios.length).toBeGreaterThan(0);
		const validate = validator('craftabot-scenarios');
		expect(validate(JSON.parse(JSON.stringify(file))), JSON.stringify(validate.errors)).toBe(true);
	});

	it('campaign accepts the committed baseline file and the builder’s output', () => {
		const validate = validator('campaign');
		expect(validate(readJson(resolve(REPO, 'campaigns', 'injection-baseline.json')))).toBe(true);
		expect(validate(JSON.parse(JSON.stringify(injectionBaseline([1, 2]))))).toBe(true);
		expect(validate({ id: 'nope' })).toBe(false);
	});

	it('campaign-report accepts a report the runner produced', async () => {
		const base = injectionBaseline([1]);
		const campaign = {
			...base,
			scenarios: base.scenarios.slice(0, 1),
			guards: base.guards.slice(0, 1),
			brains: base.brains.slice(0, 1),
			gates: base.gates.slice(0, 1)
		};
		const report = await runCampaign(campaign, { packs: [starterPack, workshopPack] });
		const validate = validator('campaign-report');
		expect(validate(JSON.parse(JSON.stringify(report))), JSON.stringify(validate.errors)).toBe(
			true
		);
	});

	it('evaluation-record accepts a record the app would store', () => {
		const record = evaluationRecordSchema.parse({
			id: 'eval-1',
			runId: 'run-1',
			evaluatorId: 'test/always-pass',
			result: {
				evaluatorId: 'test/always-pass',
				verdict: 'pass',
				explanation: 'Nothing to see.',
				evidence: [{ eventId: 'e1', tick: 1 }]
			},
			evaluatedAt: '2026-09-05T12:00:00.000Z',
			schemaVersion: 1
		});
		const validate = validator('evaluation-record');
		expect(validate(record)).toBe(true);
		expect(validate({ ...record, schemaVersion: 2 })).toBe(false);
	});
});
