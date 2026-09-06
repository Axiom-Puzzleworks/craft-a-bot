#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * **`npm run build:editions`** (`59-EDITIONS.md` §4.2, WP69; `41-…` §6.14):
 * the three named editions built in turn into `apps/workbench/build/<edition>/`,
 * each a plain folder for a static host under its own `base`, each measured
 * against its own budget. `full` — today's app, `apps/workbench/build/` — is
 * `npm run build`'s and is not touched here.
 *
 * The budgets are read from `edition.ts` by regex rather than by importing it
 * (the module pulls in every pack); the number lives in one place.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(REPO, 'apps', 'workbench');
const EDITIONS = ['simulator', 'workshop', 'playground'];

const only = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const wanted = only.length > 0 ? only : EDITIONS;
for (const id of wanted) {
	if (!EDITIONS.includes(id)) {
		console.error(`build-editions: unknown edition "${id}" — one of ${EDITIONS.join(', ')}`);
		process.exit(2);
	}
}

const source = readFileSync(join(APP, 'src', 'lib', 'edition.ts'), 'utf8');
function budgetOf(id) {
	const block = source.slice(source.indexOf(`\t${id}: {`));
	const match = /budgetBytes:\s*([\d_]+)/.exec(block);
	if (!match) throw new Error(`build-editions: no budgetBytes for ${id} in edition.ts`);
	return Number(match[1].replace(/_/g, ''));
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const results = [];
for (const id of wanted) {
	console.log(`\n=== build:editions — ${id} ===`);
	const build = spawnSync(npx, ['vite', 'build'], {
		cwd: APP,
		stdio: 'inherit',
		shell: process.platform === 'win32',
		env: { ...process.env, CAB_EDITION: id }
	});
	if (build.status !== 0) {
		console.error(`build-editions: ${id} failed to build`);
		process.exit(build.status ?? 1);
	}
	const budget = spawnSync(
		process.execPath,
		[
			join(REPO, 'scripts', 'bundle-budget.mjs'),
			'--app',
			'apps/workbench',
			'--out',
			`build/${id}`,
			'--limit',
			String(budgetOf(id))
		],
		{ stdio: 'inherit' }
	);
	results.push({ id, ok: budget.status === 0 });
}

console.log('\nbuild:editions');
for (const { id, ok } of results) {
	console.log(`  ${ok ? 'ok ' : 'OVER'} ${id}  apps/workbench/build/${id}/`);
}
if (results.some((result) => !result.ok)) process.exit(1);
