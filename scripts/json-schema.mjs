#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * JSON Schemas for every artefact that crosses a boundary (WP56 stage C,
 * `41-TARGET-DESIGN-V4.md` §6.16, decision D2). The Zod sources in `core` and
 * `evals` are the definitions of record (`10-…` §1); this generates one JSON
 * Schema (draft 2020-12, Zod 4's own `toJSONSchema`) per artefact into
 * `docs/schemas/`, so a reader in another language — a Python evaluator over
 * a bundle, a `jsonschema` one-liner — validates against the same shape the
 * app does, without this repo's code.
 *
 * **Committed, and checked on every build.** `npm run schemas` regenerates;
 * `npm run build` runs `--check`, which fails when the committed files
 * differ from what the code would generate now. So a schema changes only
 * when someone regenerated it on purpose — and, by `14-…` §7, only with a
 * version bump and a fixture, which review holds.
 *
 * Reads the built `dist/` of both packages (the same modules the harness
 * runs), so `npm run build` must have produced them.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(REPO, 'docs', 'schemas');

async function load(pkg) {
	const entry = join(REPO, 'packages', pkg, 'dist', 'index.js');
	if (!existsSync(entry)) {
		throw new Error(`json-schema: no build at ${entry}. Run \`npm run build\` first.`);
	}
	return import(pathToFileURL(entry).href);
}

/** The artefacts, by the file name a reader will look for, and where each schema lives. */
export async function artefactSchemas() {
	const core = await load('core');
	const evals = await load('evals');
	return {
		'craftabot-trace': {
			schema: core.traceFileSchema,
			title: 'Craft A Bot trace file (craftabot-trace v2)',
			description:
				'One run: its record, every event in order, its stored evaluations, and a digest over the events (07 §3, 14 §7).'
		},
		'craftabot-bundle': {
			schema: core.traceBundleSchema,
			title: 'Craft A Bot trace bundle (craftabot-bundle v1)',
			description:
				'A group episode or a campaign cell: every member trace, the merged stream, evaluations, and one digest over every digest inside (36-BUNDLE-AND-GROUPS.md §4.1).'
		},
		'craftabot-cassette': {
			schema: core.cassetteFileSchema,
			title: 'Craft A Bot cassette (craftabot-cassette v1)',
			description:
				'One service line’s recording of a real sandbox: each call’s operation, arguments and their digest, the result and the latency, redacted at write (47-SERVICE-LINES.md §4.2).'
		},
		'craftabot-scenarios': {
			schema: core.scenarioPackFileSchema,
			title: 'Craft A Bot scenario pack (craftabot-scenarios v1)',
			description:
				'Scenarios as data — a goal card plus tags, injections, expectations and plans — in a file that registers as a pack (32-SCENARIOS.md §4.1).'
		},
		campaign: {
			schema: evals.campaignSchema,
			title: 'Craft A Bot campaign file',
			description:
				'Scenarios × builds × guards × brains × seeds, with gates: a guardrail regression suite as a file (28-CAMPAIGNS.md §4).'
		},
		'campaign-report': {
			schema: evals.campaignReportSchema,
			title: 'Craft A Bot campaign report',
			description:
				'What a campaign run produced: every cell, every gate with its verdict, the slices and the budget spent (28-CAMPAIGNS.md §4.5).'
		},
		'evaluation-record': {
			schema: core.evaluationRecordSchema,
			title: 'Craft A Bot evaluation record (v1)',
			description:
				'One evaluator’s verdict over one stored run — the record a Python evaluator writes for the Workshop to import (31-EVALUATORS.md §4.4).'
		}
	};
}

export async function generateSchemas() {
	const { z } = await import('zod');
	const out = {};
	for (const [name, { schema, title, description }] of Object.entries(await artefactSchemas())) {
		const json = z.toJSONSchema(schema, {
			target: 'draft-2020-12',
			// A Zod refinement or a transform has no JSON Schema; the shape it sits on does.
			unrepresentable: 'any',
			io: 'input'
		});
		out[name] = {
			$id: `https://craftabot.dev/schemas/${name}.schema.json`,
			title,
			description,
			...json
		};
	}
	return out;
}

const render = (schema) => `${JSON.stringify(schema, null, '\t')}\n`;
export const schemaFile = (name) => join(OUT, `${name}.schema.json`);

async function main(argv) {
	const check = argv.includes('--check');
	const schemas = await generateSchemas();
	const drift = [];
	mkdirSync(OUT, { recursive: true });
	for (const [name, schema] of Object.entries(schemas)) {
		const file = schemaFile(name);
		const text = render(schema);
		const current = existsSync(file) ? readFileSync(file, 'utf8') : undefined;
		if (check) {
			if (current !== text) drift.push(name);
		} else {
			writeFileSync(file, text);
			console.log(`json-schema: wrote ${join('docs', 'schemas', `${name}.schema.json`)}`);
		}
	}
	if (check) {
		if (drift.length > 0) {
			console.error(
				`json-schema: docs/schemas/ is out of date for ${drift.join(', ')} — the Zod source changed. Run \`npm run schemas\`, and bump the artefact's version with a fixture if its shape changed (14 §7).`
			);
			process.exitCode = 1;
		} else {
			console.log(
				`json-schema: docs/schemas/ matches the code (${Object.keys(schemas).length} schemas)`
			);
		}
	}
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
	await main(process.argv.slice(2));
}
