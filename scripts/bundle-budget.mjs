#!/usr/bin/env node
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The JS bundle budget from `01-ARCHITECTURE.md` §8: **< 1.5 MB JS, excluding
 * art**, in service of a sub-2-second first load.
 *
 * A budget nobody measures is a wish. This runs as the last step of the
 * workbench build, so the number is checked every time the app is built rather
 * than remembered from whenever somebody last looked — and a regression fails
 * the build that caused it. It reports gzip too, since that is what a browser
 * actually downloads, but the stated limit is on raw bytes, as the doc has it.
 */

// Resolved from this script, not the working directory: it runs as a build
// step inside `apps/workbench` as well as by hand from the repo root.
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = join(REPO, 'apps', 'workbench', 'build');
const LIMIT_BYTES = 1_500_000;

function jsFiles(dir) {
	const found = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) found.push(...jsFiles(path));
		else if (entry.name.endsWith('.js')) found.push(path);
	}
	return found;
}

let files;
try {
	files = jsFiles(BUILD);
} catch {
	console.error(`bundle-budget: no build at ${BUILD}. Run \`npm run build\` first.`);
	process.exitCode = 1;
	files = [];
}

if (files.length > 0) {
	let raw = 0;
	let gzip = 0;
	const largest = [];

	for (const file of files) {
		const bytes = statSync(file).size;
		raw += bytes;
		gzip += gzipSync(readFileSync(file)).length;
		largest.push([file, bytes]);
	}

	const kb = (bytes) => `${(bytes / 1024).toFixed(0)} kB`;
	const used = ((raw / LIMIT_BYTES) * 100).toFixed(0);

	console.log(`bundle-budget: ${files.length} JS files`);
	console.log(`  raw   ${kb(raw)} of ${kb(LIMIT_BYTES)} budget  (${used}%)`);
	console.log(`  gzip  ${kb(gzip)}`);

	largest.sort((a, b) => b[1] - a[1]);
	for (const [file, bytes] of largest.slice(0, 3)) {
		console.log(`  largest: ${kb(bytes).padStart(7)}  ${file}`);
	}

	if (raw > LIMIT_BYTES) {
		console.error(`bundle-budget: OVER BUDGET by ${kb(raw - LIMIT_BYTES)} (01 §8)`);
		process.exitCode = 1;
	} else {
		console.log('bundle-budget: within budget');
	}
}
