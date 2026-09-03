#!/usr/bin/env node
/**
 * The `@craftabot/governance` tarball is the library and nothing else (WP50,
 * `38-GOVERNANCE-1-0.md` §4.1). Runs `npm pack --dry-run` for the workspace,
 * asserts every file it would ship is `package.json`, `README.md` or under
 * `dist/`, and greps `dist/` for the things the boundary forbids — Svelte,
 * a pack, the Playroom, the app's aliases. ESLint guards the source; this
 * guards the artefact. Run after `npm run build`; exit 1 on any finding.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const workspace = 'packages/governance';
// One fixed command string: `npm` is a shell script on Windows, and nothing here is user input.
const pack = spawnSync(`npm pack --dry-run --json --workspace ${workspace}`, {
	encoding: 'utf8',
	shell: true
});
if (pack.status !== 0) {
	console.error(pack.stderr);
	process.exit(1);
}
const [manifest] = JSON.parse(pack.stdout);
const files = manifest.files.map((file) => file.path);
const stray = files.filter(
	(path) => path !== 'package.json' && path !== 'README.md' && !path.startsWith('dist/')
);
const problems = [];
if (stray.length > 0) problems.push(`files outside dist/: ${stray.join(', ')}`);
if (!files.some((path) => path === 'dist/index.js'))
	problems.push('dist/index.js is not in the tarball — build first');
if (!files.some((path) => path === 'dist/reports/index.js'))
	problems.push('dist/reports/index.js is not in the tarball');
if (
	files.some(
		(path) =>
			path.endsWith('.test.js') || path.includes('test-context') || path.includes('test-service')
	)
) {
	problems.push('test scaffolding is in the tarball');
}

// Imports, not words: a doc comment may say "no Playroom"; an import statement may not bring one.
const FORBIDDEN = [
	/from\s+['"](svelte|@sveltejs\/)/,
	/from\s+['"]@craftabot\/pack-/,
	/from\s+['"]@craftabot\/(workbench|harness|evals|telemetry)/,
	/from\s+['"]\$(lib|app)\//
];
function walk(dir) {
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) walk(path);
		else if (/\.(js|d\.ts)$/.test(entry)) {
			const text = readFileSync(path, 'utf8');
			for (const pattern of FORBIDDEN) {
				if (pattern.test(text)) problems.push(`${relative(workspace, path)} mentions ${pattern}`);
			}
		}
	}
}
walk(join(workspace, 'dist'));

if (problems.length > 0) {
	console.error(`governance tarball check failed:\n  ${problems.join('\n  ')}`);
	process.exit(1);
}
console.log(
	`@craftabot/governance ${manifest.version}: ${files.length} files, ${manifest.size} bytes packed — dist, README and package.json only`
);
